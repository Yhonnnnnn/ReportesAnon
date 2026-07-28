<?php
// ===== Configuración de la base de datos =====
// En LOCAL (XAMPP/WAMP) se usan los valores por defecto de abajo.
// En RAILWAY, el servicio de MySQL inyecta automáticamente estas variables
// de entorno (MYSQLHOST, MYSQLUSER, etc.) — no hay que tocar nada aquí,
// getenv() las toma solas si existen.
define('DB_HOST', getenv('MYSQLHOST') ?: 'localhost');
define('DB_PORT', getenv('MYSQLPORT') ?: '3306');
define('DB_USER', getenv('MYSQLUSER') ?: 'root');
define('DB_PASS', getenv('MYSQLPASSWORD') ?: '');
define('DB_NAME', getenv('MYSQLDATABASE') ?: 'reportes_anonimos');

// ===== Clave para hashear el correo =====
// Cambia este valor por una cadena larga y aleatoria propia, y NO la compartas
// ni la subas a un repositorio público. El correo nunca se guarda en texto plano.
// En Railway: ponla como variable de entorno EMAIL_PEPPER en el servicio backend.
define('EMAIL_PEPPER', getenv('EMAIL_PEPPER') ?: 'CAMBIA_ESTO_POR_UN_VALOR_SECRETO_LARGO_Y_UNICO');

// ===== Límites anti-spam =====
define('MAX_REPORTES_POR_DIA', 8);

// Carpeta donde se guarda la evidencia opcional (fotos) de los reportes.
// La URL pública se arma sola a partir de cómo llegó la petición, así que
// funciona igual en localhost que en el dominio que te da Railway.
// En Railway usa UPLOADS_DIR=/data/uploads y monta un Volume en /data.
// Fuera de Railway se conserva la carpeta local del proyecto.
define('UPLOADS_DIR', rtrim(getenv('UPLOADS_DIR') ?: (__DIR__ . '/uploads'), '/\\'));
$esquema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
// dirname(dirname(...)) quita "/api/archivo.php" y deja la carpeta "backend",
// sea que esté en la raíz del dominio (Railway) o anidada (XAMPP local).
$rutaBase = str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '')));
if ($rutaBase === '.' || $rutaBase === '/') {
    $rutaBase = '';
}
define('UPLOADS_URL', $esquema . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $rutaBase . '/uploads');

// Conexión a MySQL
function getDB() {
    try {
        $pdo = new PDO(
            "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4",
            DB_USER,
            DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error de conexión a la base de datos: ' . $e->getMessage()]);
        exit;
    }
}

// Configurar headers CORS
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ===== Helpers de autenticación =====
// Sistema de sesión simple por token (sin librerías externas).
// El token NUNCA contiene datos del usuario: es solo una cadena aleatoria
// que se busca en la tabla `sesiones`.

function generarToken(): string {
    return bin2hex(random_bytes(32)); // 64 caracteres
}

// Hash de un solo sentido para el correo: no se puede revertir a partir de
// la base de datos, solo sirve para comparar "¿este correo ya existe?".
function hashCorreo(string $email): string {
    return hash_hmac('sha256', mb_strtolower(trim($email)), EMAIL_PEPPER);
}

// Devuelve el id del usuario autenticado o null si no hay token válido.
function usuarioAutenticado(PDO $db): ?int {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';

    if (!preg_match('/Bearer\s+(\S+)/', $auth, $m)) {
        return null;
    }

    $token = $m[1];
    $stmt = $db->prepare(
        "SELECT usuario_id FROM sesiones WHERE token = ? AND expira > NOW()"
    );
    $stmt->execute([$token]);
    $fila = $stmt->fetch(PDO::FETCH_ASSOC);

    return $fila ? (int) $fila['usuario_id'] : null;
}

// Exige que haya un usuario autenticado; si no, corta la ejecución con 401.
function exigirAutenticacion(PDO $db): int {
    $userId = usuarioAutenticado($db);
    if (!$userId) {
        http_response_code(401);
        echo json_encode(['error' => 'Debes iniciar sesión para hacer esto']);
        exit;
    }
    return $userId;
}

// Anti-spam: revisa y actualiza el contador de envíos del día para un
// usuario. Devuelve true si todavía puede enviar, false si llegó al límite.
// No guarda relación con reportes concretos, solo un contador por día.
function puedeEnviarReporte(PDO $db, int $usuarioId): bool {
    $hoy = date('Y-m-d');

    $stmt = $db->prepare("SELECT contador FROM limite_envios WHERE usuario_id = ? AND fecha = ?");
    $stmt->execute([$usuarioId, $hoy]);
    $fila = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($fila && (int) $fila['contador'] >= MAX_REPORTES_POR_DIA) {
        return false;
    }

    $stmt = $db->prepare(
        "INSERT INTO limite_envios (usuario_id, fecha, contador) VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE contador = contador + 1"
    );
    $stmt->execute([$usuarioId, $hoy]);

    return true;
}
