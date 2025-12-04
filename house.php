<?php

            header("Content-Type: application/json; charset=utf-8");


    $pdo = new PDO("mysql:host=localhost;dbname=testdb;charset=utf8mb4", "root", "1234", [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    $stmt = $pdo->query("SELECT id, lat, lng FROM houses LIMIT 500");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);

?>