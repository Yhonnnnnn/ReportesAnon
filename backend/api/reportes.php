<?php
require_once __DIR__ . '/../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

// Auto-migración para añadir la columna 'zona' si no existe
try {
    $db->query("SELECT zona FROM reportes LIMIT 1");
} catch (PDOException $e) {
    try {
        $db->exec("ALTER TABLE reportes ADD zona VARCHAR(255) NULL AFTER longitud");
    } catch (PDOException $e2) { }
}

switch ($method) {
    case 'GET':
        // Obtener reportes activos. Si viene ?desde=<fecha ISO>, solo trae
        // los reportes nuevos desde esa fecha (esto es lo que usa el mapa
        // para el "tiempo real": cada pocos segundos pregunta solo por lo nuevo).
        try {
            $desde = $_GET['desde'] ?? null;

            if ($desde) {
                $stmt = $db->prepare(
                    "SELECT id, categoria, descripcion, latitud, longitud, zona, fecha, evidencia_path,
                            confirmaciones, marcas_falso
                     FROM reportes
                     WHERE estado = 'activo' AND fecha > ?
                     ORDER BY fecha DESC"
                );
                $stmt->execute([$desde]);
            } else {
                $stmt = $db->query(
                    "SELECT id, categoria, descripcion, latitud, longitud, zona, fecha, evidencia_path,
                            confirmaciones, marcas_falso
                     FROM reportes
                     WHERE estado = 'activo'
                     ORDER BY fecha DESC"
                );
            }

            $reportes = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($reportes as &$r) {
                $r['evidenciaUrl'] = $r['evidencia_path'] ? UPLOADS_URL . '/' . $r['evidencia_path'] : null;
                unset($r['evidencia_path']);
            }
            echo json_encode($reportes);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    case 'POST':
        // Crear un nuevo reporte. Requiere sesión iniciada (evita reportes
        // de bots/anónimos totales), pero el reporte en sí NO se guarda
        // ligado al usuario que lo hizo.
        $userId = exigirAutenticacion($db);

        if (!puedeEnviarReporte($db, $userId)) {
            http_response_code(429);
            echo json_encode(['error' => 'Alcanzaste el límite de reportes por hoy. Intenta más tarde.']);
            exit;
        }

        // Puede llegar como JSON (sin evidencia) o multipart/form-data (con evidencia)
        $esMultipart = str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data');
        $input = $esMultipart ? $_POST : (json_decode(file_get_contents('php://input'), true) ?? []);

        $categoria = trim($input['categoria'] ?? '');
        $descripcion = trim($input['descripcion'] ?? '');
        $latitud = $input['latitud'] ?? null;
        $longitud = $input['longitud'] ?? null;
        $zona = trim($input['zona'] ?? '');
        if ($zona === '') $zona = null;

        if (!$categoria || !$descripcion || !$latitud || !$longitud) {
            http_response_code(400);
            echo json_encode(['error' => 'Todos los campos son obligatorios']);
            exit;
        }

        // OJO: todo el bloque (incluyendo guardarEvidencia, que usa GD) queda
        // dentro de este try/catch(Throwable). Antes, si a la extensión gd le
        // faltaba algo, PHP lanzaba un "Fatal Error" (no una Exception normal),
        // eso rompía el script ANTES de llegar al INSERT, y por eso el reporte
        // nunca quedaba guardado en la base -- sin ningún mensaje claro de qué
        // pasó. catch (Throwable) sí atrapa ese tipo de error también.
        try {
            $evidenciaPath = null;
            if ($esMultipart && !empty($_FILES['evidencia']['tmp_name'])) {
                if (!extension_loaded('gd')) {
                    throw new Exception('La extensión gd de PHP no está instalada en el servidor (no se puede procesar la imagen).');
                }
                $evidenciaPath = guardarEvidencia($_FILES['evidencia']);
                if ($evidenciaPath === false) {
                    http_response_code(400);
                    echo json_encode(['error' => 'La evidencia debe ser una imagen JPG, PNG o WEBP de máximo 5MB']);
                    exit;
                }
            }

            $stmt = $db->prepare(
                "INSERT INTO reportes (categoria, descripcion, latitud, longitud, zona, fecha, evidencia_path)
                 VALUES (?, ?, ?, ?, ?, NOW(), ?)"
            );
            $stmt->execute([$categoria, $descripcion, $latitud, $longitud, $zona, $evidenciaPath]);

            $id = $db->lastInsertId();

            echo json_encode([
                'success' => true,
                'id' => $id,
                'message' => 'Reporte guardado exitosamente'
            ]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Error guardando el reporte: ' . $e->getMessage()]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Método no permitido']);
        break;
}

// Guarda la imagen de evidencia RE-CODIFICÁNDOLA con GD. Esto tiene un efecto
// clave de privacidad: al volver a generar el archivo a partir de los píxeles,
// se eliminan los metadatos EXIF originales (que pueden incluir la ubicación
// GPS exacta donde se tomó la foto y el modelo del celular). Devuelve el
// nombre del archivo guardado, o false si el archivo no es válido.
function guardarEvidencia(array $archivo) {
    $tamañoMaximo = 5 * 1024 * 1024; // 5MB
    if ($archivo['size'] > $tamañoMaximo || $archivo['error'] !== UPLOAD_ERR_OK) {
        return false;
    }

    $info = @getimagesize($archivo['tmp_name']);
    if (!$info) {
        return false;
    }

    if (!is_dir(UPLOADS_DIR)) {
        mkdir(UPLOADS_DIR, 0755, true);
    }

    $nombre = bin2hex(random_bytes(16));

    switch ($info['mime']) {
        case 'image/jpeg':
            $img = imagecreatefromjpeg($archivo['tmp_name']);
            $destino = "$nombre.jpg";
            imagejpeg($img, UPLOADS_DIR . '/' . $destino, 85);
            break;
        case 'image/png':
            $img = imagecreatefrompng($archivo['tmp_name']);
            $destino = "$nombre.png";
            imagepng($img, UPLOADS_DIR . '/' . $destino);
            break;
        case 'image/webp':
            $img = imagecreatefromwebp($archivo['tmp_name']);
            $destino = "$nombre.webp";
            imagewebp($img, UPLOADS_DIR . '/' . $destino, 85);
            break;
        default:
            return false;
    }

    imagedestroy($img);
    return $destino;
}