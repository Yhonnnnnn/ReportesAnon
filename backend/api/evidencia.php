<?php
require_once __DIR__ . '/../config.php';

// Solo se aceptan los nombres aleatorios creados por guardarEvidencia().
// basename evita que alguien intente leer archivos fuera de UPLOADS_DIR.
$archivo = basename($_GET['archivo'] ?? '');
if (!preg_match('/^[a-f0-9]{32}\.(jpg|png|webp)$/', $archivo)) {
    http_response_code(400);
    echo json_encode(['error' => 'Archivo de evidencia inválido']);
    exit;
}

$ruta = UPLOADS_DIR . '/' . $archivo;
if (!is_file($ruta) || !is_readable($ruta)) {
    http_response_code(404);
    echo json_encode(['error' => 'Evidencia no encontrada']);
    exit;
}

$tiposPermitidos = [
    'jpg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
];
$extension = strtolower(pathinfo($archivo, PATHINFO_EXTENSION));

header_remove('Content-Type');
header('Content-Type: ' . $tiposPermitidos[$extension]);
header('Content-Length: ' . filesize($ruta));
header('Cache-Control: public, max-age=86400');
readfile($ruta);
