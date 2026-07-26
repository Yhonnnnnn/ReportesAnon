<?php
require_once __DIR__ . '/../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

// Umbral: si un reporte acumula esta cantidad de marcas de "falso" más que
// de confirmaciones, se oculta automáticamente del mapa (pero no se borra).
const UMBRAL_OCULTAR = 3;

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

$userId = exigirAutenticacion($db);

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$reporteId = (int) ($input['reporte_id'] ?? 0);
$tipo = $input['tipo'] ?? '';

if (!$reporteId || !in_array($tipo, ['confirma', 'falso'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Datos inválidos']);
    exit;
}

try {
    $stmt = $db->prepare(
        "INSERT INTO reportes_votos (reporte_id, usuario_id, tipo) VALUES (?, ?, ?)"
    );
    $stmt->execute([$reporteId, $userId, $tipo]);
} catch (PDOException $e) {
    // Índice único unico_voto: ya había votado este reporte
    http_response_code(409);
    echo json_encode(['error' => 'Ya votaste en este reporte']);
    exit;
}

$columna = $tipo === 'confirma' ? 'confirmaciones' : 'marcas_falso';
$db->prepare("UPDATE reportes SET $columna = $columna + 1 WHERE id = ?")->execute([$reporteId]);

$stmt = $db->prepare("SELECT confirmaciones, marcas_falso FROM reportes WHERE id = ?");
$stmt->execute([$reporteId]);
$reporte = $stmt->fetch(PDO::FETCH_ASSOC);

if ($reporte && ($reporte['marcas_falso'] - $reporte['confirmaciones']) >= UMBRAL_OCULTAR) {
    $db->prepare("UPDATE reportes SET estado = 'oculto' WHERE id = ?")->execute([$reporteId]);
}

echo json_encode([
    'success' => true,
    'confirmaciones' => (int) $reporte['confirmaciones'],
    'marcasFalso' => (int) $reporte['marcas_falso']
]);
