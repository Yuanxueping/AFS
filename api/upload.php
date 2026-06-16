<?php
require_once __DIR__ . '/config.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

requireAuth();

if (empty($_FILES['file'])) {
    jsonResponse(['error' => '未收到文件'], 400);
}

$file = $_FILES['file'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    jsonResponse(['error' => '上传失败，错误码：' . $file['error']], 400);
}

// Validate type
$allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
$finfo   = finfo_open(FILEINFO_MIME_TYPE);
$mime    = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!in_array($mime, $allowed)) {
    jsonResponse(['error' => '不支持的文件类型：' . $mime], 400);
}

// Max 5 MB
if ($file['size'] > 5 * 1024 * 1024) {
    jsonResponse(['error' => '文件超过 5MB 限制'], 400);
}

// Extension map
$exts = [
    'image/jpeg'    => 'jpg',
    'image/png'     => 'png',
    'image/gif'     => 'gif',
    'image/webp'    => 'webp',
    'image/svg+xml' => 'svg',
];
$ext = $exts[$mime];

// Save to /uploads/
$uploadDir = dirname(__DIR__) . '/uploads/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$filename = date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
$dest     = $uploadDir . $filename;

if (!move_uploaded_file($file['tmp_name'], $dest)) {
    jsonResponse(['error' => '文件保存失败'], 500);
}

// Return public URL (relative to site root)
$url = '/uploads/' . $filename;
jsonResponse(['success' => true, 'url' => $url]);
