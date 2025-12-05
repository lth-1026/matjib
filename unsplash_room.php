<?php
// unsplash_room.php
header("Content-Type: application/json; charset=utf-8");

$id = isset($_GET['id']) ? intval($_GET['id']) : 1;
if ($id <= 0) $id = 1;

// ★ 自分の Access Key（公開リポには載せない！）

// 「リアルな部屋」寄りのクエリ
$query = urlencode("apartment interior living room bedroom home");

// Unsplash 検索
$url = "https://api.unsplash.com/search/photos?"
     . "query={$query}"
     . "&per_page=50"
     . "&page=1"
     . "&orientation=landscape"
     . "&content_filter=high"
     . "&order_by=relevant"
     . "&client_id={$ACCESS_KEY}";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);

$res = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($res === false || $httpCode !== 200) {
    echo json_encode([]);
    exit;
}

$data = json_decode($res, true);
$results = isset($data['results']) ? $data['results'] : [];

// ---------- フィルタリング ----------

// これは「絶対いらない」系（3D・イラスト系）
$ngWords = [
    '3d','render','rendering','illustration','cartoon',
    'isometric','minimalist illustration','abstract','graphic'
];

// 逆に「これが入ってたら部屋として採用したい」系
$mustWords = [
    'interior','apartment','living room','bedroom','room',
    'sofa','couch','home','apartment interior'
];

// 「天井アップ」「壁の角だけ」っぽいのを避けたいワード
$ceilingNgWords = ['ceiling','corner','wall texture','close up','door frame'];

$good = [];

foreach ($results as $photo) {
    if (!isset($photo['urls']['small'])) continue;

    // タイトル/説明/alt_description もテキストとして見る
    $texts = [];
    if (!empty($photo['description'])) {
        $texts[] = mb_strtolower($photo['description'], 'UTF-8');
    }
    if (!empty($photo['alt_description'])) {
        $texts[] = mb_strtolower($photo['alt_description'], 'UTF-8');
    }

    $tags = isset($photo['tags']) ? $photo['tags'] : [];
    foreach ($tags as $t) {
        if (isset($t['title'])) {
            $texts[] = mb_strtolower($t['title'], 'UTF-8');
        }
    }

    if (empty($texts)) continue;

    // 1) NGワードを含んでいたら除外
    $isBad = false;
    foreach ($ngWords as $ng) {
        foreach ($texts as $txt) {
            if (strpos($txt, $ng) !== false) {
                $isBad = true;
                break 2;
            }
        }
    }
    if ($isBad) continue;

    // 2) 天井アップっぽいワードも除外
    foreach ($ceilingNgWords as $ng) {
        foreach ($texts as $txt) {
            if (strpos($txt, $ng) !== false) {
                $isBad = true;
                break 2;
            }
        }
    }
    if ($isBad) continue;

    // 3) mustWords のどれかは必ず含んでいてほしい
    $hasMust = false;
    foreach ($mustWords as $mw) {
        foreach ($texts as $txt) {
            if (strpos($txt, $mw) !== false) {
                $hasMust = true;
                break 2;
            }
        }
    }
    if (!$hasMust) continue;

    $good[] = $photo;
}

// good が空なら元 results 全体をプールに
$pool = count($good) ? $good : $results;
$n = count($pool);

if ($n === 0) {
    echo json_encode([]);
    exit;
}

// ========= 物件IDから決まるシードで 3枚選択 =========
$chosen = [];
$seed   = $id * 7919;

for ($i = 0; $i < 3; $i++) {
    $idx = ($seed + $i) % $n;
    $chosen[] = $pool[$idx];
}

// URL だけ返す
$urls = [];
foreach ($chosen as $p) {
    if (isset($p['urls']['small'])) {
        $urls[] = $p['urls']['small'];
    }
}

echo json_encode($urls);
