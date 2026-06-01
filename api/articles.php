<?php
require_once __DIR__ . '/config.php';

session_start();
setCorsHeaders();
header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';
$id     = isset($_GET['id'])     ? $_GET['id']     : '';

// ── Site config endpoints ─────────────────────────────────────────────────────
if ($action === 'config') {
    if ($method === 'GET') {
        $config = getSiteConfig();
        unset($config['adminPasswordHash']);
        jsonResponse($config);
    }
    if ($method === 'PUT') {
        requireAuth();
        $body = file_get_contents('php://input');
        $data = json_decode($body, true);
        if (!$data) { jsonResponse(['error' => 'Invalid JSON'], 400); }

        $config = getSiteConfig();
        $allowed = ['siteName','siteDescription','siteUrl','logo',
                    'afsPublisherId','defaultAfsStyleId','defaultAfsChannelId',
                    'facebookPixelId','tiktokPixelId','articlesPerPage'];
        foreach ($allowed as $key) {
            if (isset($data[$key])) { $config[$key] = $data[$key]; }
        }
        // Allow password change
        if (!empty($data['newPassword'])) {
            $config['adminPasswordHash'] = hash('sha256', $data['newPassword']);
        }
        file_put_contents(CONFIG_FILE, json_encode($config, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        unset($config['adminPasswordHash']);
        jsonResponse(['success' => true, 'config' => $config]);
    }
    jsonResponse(['error' => 'Method Not Allowed'], 405);
}

// ── Import endpoint ───────────────────────────────────────────────────────────
if ($action === 'import' && $method === 'POST') {
    requireAuth();
    $body = file_get_contents('php://input');
    $data = json_decode($body, true);
    if (!$data || !isset($data['articles']) || !is_array($data['articles'])) {
        jsonResponse(['error' => 'Invalid import data. Expected {"articles": [...]}'], 400);
    }
    $store = loadArticles();
    $existingIds = array_column($store['articles'], 'id');
    $imported = 0;
    $skipped  = 0;
    foreach ($data['articles'] as $article) {
        $article = sanitizeArticle($article);
        if (in_array($article['id'], $existingIds)) {
            // Update existing
            foreach ($store['articles'] as &$a) {
                if ($a['id'] === $article['id']) {
                    $a = $article;
                    $skipped++;
                    break;
                }
            }
            unset($a);
        } else {
            $store['articles'][] = $article;
            $existingIds[] = $article['id'];
            $imported++;
        }
    }
    saveArticles($store);
    jsonResponse(['success' => true, 'imported' => $imported, 'updated' => $skipped]);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $store = loadArticles();
    if ($id) {
        $article = findArticle($store, $id);
        if (!$article) { jsonResponse(['error' => 'Article not found'], 404); }
        jsonResponse($article);
    }
    // Optional filters
    $category = isset($_GET['category']) ? $_GET['category'] : '';
    $tag      = isset($_GET['tag'])      ? $_GET['tag']      : '';
    $search   = isset($_GET['search'])   ? $_GET['search']   : '';
    $page     = max(1, intval(isset($_GET['page']) ? $_GET['page'] : 1));
    $limit    = max(1, min(100, intval(isset($_GET['limit']) ? $_GET['limit'] : 10)));

    $articles = $store['articles'];

    // Sort newest first
    usort($articles, function($a, $b) {
        return strcmp($b['createdAt'], $a['createdAt']);
    });

    if ($category) {
        $articles = array_values(array_filter($articles, function($a) use ($category) {
            return $a['category'] === $category;
        }));
    }
    if ($tag) {
        $articles = array_values(array_filter($articles, function($a) use ($tag) {
            return in_array($tag, $a['tags'] ?? []);
        }));
    }
    if ($search) {
        $q = mb_strtolower($search);
        $articles = array_values(array_filter($articles, function($a) use ($q) {
            return mb_strpos(mb_strtolower($a['title']), $q) !== false
                || mb_strpos(mb_strtolower($a['excerpt'] ?? ''), $q) !== false;
        }));
    }

    $total = count($articles);
    $offset = ($page - 1) * $limit;
    $paged  = array_slice($articles, $offset, $limit);

    // Strip full content from list view for performance
    $paged = array_map(function($a) {
        unset($a['content']);
        return $a;
    }, $paged);

    // Collect categories
    $allArticles = $store['articles'];
    $categories = [];
    foreach ($allArticles as $a) {
        $cat = $a['category'] ?? '';
        if ($cat) { $categories[$cat] = ($categories[$cat] ?? 0) + 1; }
    }

    jsonResponse([
        'articles'   => $paged,
        'total'      => $total,
        'page'       => $page,
        'limit'      => $limit,
        'totalPages' => ceil($total / $limit),
        'categories' => $categories,
    ]);
}

if ($method === 'POST') {
    requireAuth();
    $body = file_get_contents('php://input');
    $data = json_decode($body, true);
    if (!$data || empty($data['title'])) {
        jsonResponse(['error' => 'Title is required'], 400);
    }
    $store   = loadArticles();
    $article = sanitizeArticle($data, true);
    $store['articles'][] = $article;
    saveArticles($store);
    jsonResponse(['success' => true, 'article' => $article], 201);
}

if ($method === 'PUT') {
    requireAuth();
    if (!$id) { jsonResponse(['error' => 'ID required'], 400); }
    $body = file_get_contents('php://input');
    $data = json_decode($body, true);
    if (!$data) { jsonResponse(['error' => 'Invalid JSON'], 400); }

    $store = loadArticles();
    $found = false;
    foreach ($store['articles'] as &$article) {
        if ($article['id'] === $id) {
            $data['id']        = $id;
            $data['createdAt'] = $article['createdAt'];
            $article = sanitizeArticle($data);
            $article['updatedAt'] = gmdate('Y-m-d\TH:i:s\Z');
            $found = true;
            break;
        }
    }
    unset($article);
    if (!$found) { jsonResponse(['error' => 'Article not found'], 404); }
    saveArticles($store);
    jsonResponse(['success' => true, 'article' => findArticle($store, $id)]);
}

if ($method === 'DELETE') {
    requireAuth();
    if (!$id) { jsonResponse(['error' => 'ID required'], 400); }
    $store = loadArticles();
    $before = count($store['articles']);
    $store['articles'] = array_values(array_filter($store['articles'], function($a) use ($id) {
        return $a['id'] !== $id;
    }));
    if (count($store['articles']) === $before) { jsonResponse(['error' => 'Article not found'], 404); }
    saveArticles($store);
    jsonResponse(['success' => true]);
}

jsonResponse(['error' => 'Method Not Allowed'], 405);

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadArticles() {
    if (!file_exists(ARTICLES_FILE)) {
        return ['articles' => []];
    }
    $content = file_get_contents(ARTICLES_FILE);
    $data = json_decode($content, true);
    return $data ?: ['articles' => []];
}

function saveArticles($store) {
    file_put_contents(ARTICLES_FILE, json_encode($store, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

function findArticle($store, $idOrSlug) {
    foreach ($store['articles'] as $a) {
        if ($a['id'] === $idOrSlug || ($a['slug'] ?? '') === $idOrSlug) {
            return $a;
        }
    }
    return null;
}

function generateUuid() {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

function generateSlug($title) {
    // Simple slug: lowercase, replace spaces/special chars
    $slug = mb_strtolower($title);
    $slug = preg_replace('/\s+/', '-', $slug);
    $slug = preg_replace('/[^\p{L}\p{N}\-]/u', '', $slug);
    $slug = trim($slug, '-');
    if (empty($slug)) { $slug = 'article-' . time(); }
    return $slug . '-' . substr(md5($title . time()), 0, 6);
}

function sanitizeArticle($data, $isNew = false) {
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $afsDefaults = [
        'styleId'   => '',
        'channelId' => '',
    ];
    $incoming = $data['afs'] ?? [];
    $afs = [
        'styleId'   => strval($incoming['styleId']   ?? ''),
        'channelId' => strval($incoming['channelId'] ?? ''),
    ];

    return [
        'id'          => $data['id']        ?? generateUuid(),
        'title'       => trim($data['title'] ?? ''),
        'slug'        => !empty($data['slug']) ? $data['slug'] : generateSlug($data['title'] ?? ''),
        'content'     => $data['content']   ?? '',
        'excerpt'     => $data['excerpt']   ?? '',
        'category'    => trim($data['category'] ?? ''),
        'tags'        => array_values(array_filter(array_map('trim', (array)($data['tags'] ?? [])))),
        'coverImage'  => $data['coverImage'] ?? '',
        'createdAt'   => $data['createdAt'] ?? $now,
        'updatedAt'   => $now,
        'afs'         => $afs,
    ];
}
