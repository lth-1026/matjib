<?php
    header("Content-Type: application/json; charset=utf-8");

    $pdo = new PDO("mysql:host=localhost;dbname=testdb;charset=utf8mb4", "root", "1234", [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    $id = isset($_GET["id"]) ? (int)$_GET["id"] : 0;
    
    $stmt = $pdo->prepare("SELECT * FROM houses WHERE id=?");
    $stmt->execute([$id]);
    $house = $stmt->fetch(PDO::FETCH_ASSOC);

    $stmt = $pdo->prepare("SELECT * FROM house_lifestyle WHERE house_id=?");
    $stmt->execute([$id]);
    $lifestyle = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

    echo json_encode(["house"=>$house, "lifestyle"=>$lifestyle], JSON_UNESCAPED_UNICODE);

?>