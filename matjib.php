<?php 

    header("Content-Type: application/json; charset=utf-8");



    $host = "localhost";
    $user = "root";
    $pass = "1234";
    $db = "testdb";

    $conn = mysqli_connect($host, $user, $pass, $db);

    if(!$conn){
        die("Connection failed: " . mysqli_connect_error());
    }


    if(isset($_POST["rentType"])){

        /* 아래는 서버로 잘 넘어오는지 확인용 코드 */
        //key-value로 저장
        $response = [
            "rentType" => $_POST["rentType"],
            "depositMin" => $_POST["depositMin"],
            "depositMax" => $_POST["depositMax"],
            "rentMin" => $_POST["rentMin"],
            "rentMax" => $_POST["rentMax"],
            "maintenanceFee" => $_POST["maintenanceFee"] ,
            "area" => $_POST["area"],

            "walk" => $_POST["walk"],
            "running" => $_POST["running"],
            "pet" => $_POST["pet"],
            "gym" => $_POST["gym"],
            "concert" => $_POST["concert"],
            "cafe" => $_POST["cafe"],
            "hiking" => $_POST["hiking"],
            "baseball" => $_POST["baseball"],

            "commuteList" => $_POST["commuteList"] ?? "" 
        ];
        /*                                      */


        //JSON으로 응답
        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        exit;

    }    



?>