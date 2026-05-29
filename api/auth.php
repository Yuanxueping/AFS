<?php
require_once __DIR__ . '/config.php';

session_start();
setCorsHeaders();
header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

// Handle logout
if ($method === 'GET' && $action === 'logout') {
    $_SESSION = [];
    session_destroy();
    jsonResponse(['success' => true, 'message' => '已退出登录']);
}

// Handle check
if ($method === 'GET' && $action === 'check') {
    if (isAuthenticated()) {
        jsonResponse(['authenticated' => true]);
    } else {
        jsonResponse(['authenticated' => false]);
    }
}

// Handle login (POST)
if ($method === 'POST') {
    $body = file_get_contents('php://input');
    $data = json_decode($body, true);

    if (!$data || !isset($data['password'])) {
        jsonResponse(['error' => 'Bad Request', 'message' => '请提供密码'], 400);
    }

    $password = $data['password'];
    $config = getSiteConfig();
    $storedHash = $config['adminPasswordHash'];

    // SHA-256 hash comparison
    $inputHash = hash('sha256', $password);

    if ($inputHash === $storedHash) {
        $_SESSION['authenticated'] = true;
        $_SESSION['loginTime'] = time();
        jsonResponse(['success' => true, 'message' => '登录成功']);
    } else {
        jsonResponse(['error' => 'Unauthorized', 'message' => '密码错误'], 401);
    }
}

jsonResponse(['error' => 'Method Not Allowed'], 405);
