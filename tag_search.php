<?php
// tag_search.php 例: tag_search.php?tag=pet

$tag = $_GET['tag'] ?? '';

$allowed = ['walk','running','pet','gym','concert','cafe','hiking','baseball'];
if (!in_array($tag, $allowed, true)) {
    http_response_code(400);
    echo "invalid tag";
    exit;
}

$tagNames = [
    'walk'     => '산책',
    'running'  => '러닝',
    'pet'      => '반려동물',
    'gym'      => '헬스',
    'concert'  => '콘서트',
    'cafe'     => '카페',
    'hiking'   => '등산',
    'baseball' => '야구',
];
$tagLabel = $tagNames[$tag] ?? $tag;

// ===== DB 接続（ここは自分の環境に合わせる） =====
$dsn  = 'mysql:host=localhost;dbname=testdb;charset=utf8mb4';
$user = 'root';
$pass = '';   // ← root パスワードがあればここ
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
];
$pdo = new PDO($dsn, $user, $pass, $options);

// ① このタグを含む物件一覧
$sqlList = "
SELECT
    h.id,
    h.address,
    h.rent_type,
    h.deposit,
    h.rent,
    h.room_type,
    h.area_m2,
    SUBSTRING_INDEX(h.address, ' ', 2) AS region
FROM houses h
JOIN house_lifestyle l ON l.house_id = h.id
WHERE l.$tag = 1
ORDER BY h.id DESC
";
$houses = $pdo->query($sqlList)->fetchAll();

// ② 地域別件数 TOP3
$sqlRank = "
SELECT
    SUBSTRING_INDEX(h.address, ' ', 2) AS region,
    COUNT(*) AS cnt
FROM houses h
JOIN house_lifestyle l ON l.house_id = h.id
WHERE l.$tag = 1
GROUP BY region
ORDER BY cnt DESC
LIMIT 3
";
$rank = $pdo->query($sqlRank)->fetchAll();

// 価格表示のヘルパ
function priceLabel($h) {
    if ($h['rent_type'] === '전세') {
        return '전세 ' . number_format($h['deposit']);
    } else {
        return '월세 ' . number_format($h['deposit']) . ' / ' . number_format($h['rent']);
    }
}
?>
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>키워드: <?= htmlspecialchars($tagLabel) ?> 매물</title>
  <link rel="stylesheet" href="style.css">
  <style>
    body {
      margin: 0;
      background: #f7eee4;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .wrap {
      max-width: 1100px;
      margin: 20px auto;
      padding: 20px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    h1 { margin-top: 0; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      background: #d3a576;
      color: #fff;
      font-size: 12px;
      margin-left: 8px;
    }
    a {
      color: #875c44;
      text-decoration: none;
      font-size: 14px;
    }
    a:hover { text-decoration: underline; }

    .region-box {
      margin-top: 16px;
      padding: 12px 14px;
      background: #faf4ea;
      border-radius: 10px;
      font-size: 14px;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      background: #875c44;
      color: #fff;
      font-size: 11px;
      margin-left: 6px;
    }

    /* カードレイアウト */
    .card-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 20px;
    }
    .house-card {
      width: 250px;
      background: #fdf7f0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 10px rgba(0,0,0,0.03);
      display: flex;
      flex-direction: column;
    }
    .house-card .card-photo {
      height: 140px;
      background: #ddd;
      background-size: cover;
      background-position: center;
    }
    .house-card .card-body {
      padding: 10px 12px 12px;
    }
    .card-region {
      font-size: 13px;
      color: #777;
      margin-bottom: 4px;
    }
    .card-price-main {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 2px;
      color: #333;
    }
    .card-meta {
      font-size: 13px;
      color: #555;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <a href="index.html">&larr; 맺집으로 돌아가기</a>

    <h1>
      키워드: <?= htmlspecialchars($tagLabel) ?>
      <span class="badge"><?= count($houses) ?>개 매물</span>
    </h1>

    <div class="region-box">
      <strong><?= htmlspecialchars($tagLabel) ?> 매물이 많은 지역 TOP 3</strong>
      <?php if ($rank): ?>
        <ol style="margin: 6px 0 0 20px; padding: 0;">
          <?php foreach ($rank as $row): ?>
            <li>
              <?= htmlspecialchars($row['region'] ?: '주소 없음') ?>
              <span class="pill"><?= (int)$row['cnt'] ?>개</span>
            </li>
          <?php endforeach; ?>
        </ol>
      <?php else: ?>
        <p style="margin:6px 0 0;">해당 키워드를 가진 매물이 아직 없습니다.</p>
      <?php endif; ?>
    </div>

    <h2 style="margin-top: 24px; font-size:18px;">매물 목록</h2>

    <?php if (!$houses): ?>
      <p>이 키워드를 포함하는 매물이 없습니다.</p>
    <?php else: ?>
      <div class="card-grid">
        <?php foreach ($houses as $h): ?>
          <div class="house-card" data-house-id="<?= (int)$h['id'] ?>">
            <div class="card-photo"></div>
            <div class="card-body">
              <div class="card-region"><?= htmlspecialchars($h['region']) ?></div>
              <div class="card-price-main"><?= htmlspecialchars(priceLabel($h)) ?></div>
              <div class="card-meta">
                <?= htmlspecialchars($h['room_type']) ?>
                · <?= htmlspecialchars($h['area_m2']) ?>㎡
              </div>
            </div>
          </div>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </div>

  <script>
  document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll(".house-card").forEach(function(card) {
      const id = card.dataset.houseId;
      const photoDiv = card.querySelector(".card-photo");
      if (!id) return;

      // ▼ 画像読み込み（今まで通り）
      if (photoDiv) {
        fetch("unsplash_room.php?id=" + encodeURIComponent(id))
          .then(function(res) { return res.json(); })
          .then(function(urls) {
            if (Array.isArray(urls) && urls[0]) {
              photoDiv.style.backgroundImage = "url('" + urls[0] + "')";
            }
          })
          .catch(function(err) {
            console.error("photo load error", err);
          });
      }

      // ▼ カードクリックで 맺집へ戻る（物件ID付き）
      card.style.cursor = "pointer";
      card.addEventListener("click", function() {
        window.location.href = "index.html?focus=" + encodeURIComponent(id);
      });
    });
  });
</script>

</body>
</html>
