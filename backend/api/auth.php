<?php
require_once __DIR__ . '/../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

$db = getDB();

switch ("$method:$action") {

    // ===== REGISTRO =====
    // Pide correo, alias y contraseña. El correo se guarda como hash.
    case 'POST:register':
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $correo = mb_strtolower(trim($input['correo'] ?? ''));
        $alias = trim($input['alias'] ?? '');
        $password = (string) ($input['password'] ?? '');

        if (!filter_var($correo, FILTER_VALIDATE_EMAIL) || mb_strlen($correo) > 254) {
            http_response_code(400);
            echo json_encode(['error' => 'Escribe un correo electrónico válido']);
            exit;
        }
        if (mb_strlen($alias) < 3 || mb_strlen($alias) > 30 || !preg_match('/^[a-zA-Z0-9_.-]+$/', $alias)) {
            http_response_code(400);
            echo json_encode(['error' => 'El alias debe tener entre 3 y 30 caracteres y no usar tu nombre real']);
            exit;
        }
        if (strlen($password) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'La contraseña debe tener al menos 6 caracteres']);
            exit;
        }

        try {
            $emailHash = hashCorreo($correo);
            $check = $db->prepare("SELECT id FROM usuarios WHERE email_hash = ?");
            $check->execute([$emailHash]);
            if ($check->fetch()) {
                http_response_code(409);
                echo json_encode(['error' => 'Ese correo ya tiene una cuenta']);
                exit;
            }

            $check = $db->prepare("SELECT id FROM usuarios WHERE alias = ?");
            $check->execute([$alias]);
            if ($check->fetch()) {
                http_response_code(409);
                echo json_encode(['error' => 'Ese alias ya está en uso']);
                exit;
            }

            $colores = ['#e53935', '#ffb300', '#43a047', '#1e88e5', '#8e24aa', '#00897b'];
            $color = $colores[array_rand($colores)];

            $stmt = $db->prepare(
                "INSERT INTO usuarios (alias, password_hash, proveedor, email_hash, avatar_color)
                 VALUES (?, ?, 'local', ?, ?)"
            );
            $stmt->execute([$alias, password_hash($password, PASSWORD_DEFAULT), $emailHash, $color]);
            $userId = (int) $db->lastInsertId();

            $token = crearSesion($db, $userId);

            echo json_encode([
                'token' => $token,
                'usuario' => ['alias' => $alias, 'avatarColor' => $color]
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'No se pudo crear la cuenta']);
        }
        break;

    // ===== LOGIN =====
    case 'POST:login':
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $correo = mb_strtolower(trim($input['correo'] ?? ''));
        $password = (string) ($input['password'] ?? '');

        $stmt = $db->prepare("SELECT id, alias, password_hash, avatar_color FROM usuarios WHERE email_hash = ?");
        $stmt->execute([hashCorreo($correo)]);
        $usuario = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$usuario || !password_verify($password, $usuario['password_hash'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Correo o contraseña incorrectos']);
            exit;
        }

        $token = crearSesion($db, (int) $usuario['id']);

        echo json_encode([
            'token' => $token,
            'usuario' => ['alias' => $usuario['alias'], 'avatarColor' => $usuario['avatar_color']]
        ]);
        break;

    // ===== PERFIL DEL USUARIO AUTENTICADO =====
    case 'GET:me':
        $userId = exigirAutenticacion($db);
        $stmt = $db->prepare("SELECT alias, avatar_color FROM usuarios WHERE id = ?");
        $stmt->execute([$userId]);
        $usuario = $stmt->fetch(PDO::FETCH_ASSOC);
        echo json_encode(['alias' => $usuario['alias'], 'avatarColor' => $usuario['avatar_color']]);
        break;

    // ===== LOGOUT =====
    case 'POST:logout':
        $headers = getallheaders();
        $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        if (preg_match('/Bearer\s+(\S+)/', $auth, $m)) {
            $stmt = $db->prepare("DELETE FROM sesiones WHERE token = ?");
            $stmt->execute([$m[1]]);
        }
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Acción no encontrada']);
        break;
}

// Crea una fila de sesión con vencimiento a 7 días y devuelve el token.
function crearSesion(PDO $db, int $usuarioId): string {
    $token = generarToken();
    $stmt = $db->prepare(
        "INSERT INTO sesiones (token, usuario_id, expira) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))"
    );
    $stmt->execute([$token, $usuarioId]);
    return $token;
}
