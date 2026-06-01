<?php
// API Configuration

define('DATA_PATH', dirname(__DIR__) . '/data/');
define('ARTICLES_FILE', DATA_PATH . 'articles.json');
define('CONFIG_FILE', DATA_PATH . 'site-config.json');

// CORS Headers
function setCorsHeaders() {
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// JSON Response helper
function jsonResponse($data, $statusCode = 200) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// Load site config
function getSiteConfig() {
    if (!file_exists(CONFIG_FILE)) {
        return [
            'siteName' => '我的博客',
            'siteDescription' => '分享知识与见解',
            'siteUrl' => 'https://example.com',
            'logo' => '',
            'afsPublisherId' => '',
            'defaultAfsStyleId' => '',
            'defaultAfsChannelId' => '',
            'facebookPixelId' => '',
            'tiktokPixelId' => '',
            'articlesPerPage' => 10,
            'adminPasswordHash' => '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
        ];
    }
    $content = file_get_contents(CONFIG_FILE);
    return json_decode($content, true);
}

// Session-based auth check
function isAuthenticated() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    return isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true;
}

function requireAuth() {
    if (!isAuthenticated()) {
        jsonResponse(['error' => 'Unauthorized', 'message' => '请先登录'], 401);
    }
}
