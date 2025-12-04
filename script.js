let map;
let allHouses = []; // Store all house data
let markers = []; // Store current markers
let selectedMarker = null;
let markersById = {};
let regionMap = {}; // regionId -> 행정구역명

function getRegionNameById(id) {
  return regionMap[id] || "";
}

function buildFullAddress(house) {
  if (house.full_address) return house.full_address;
  const regionName = house.region_name || getRegionNameById(house.address);
  const detail = house.address_detail ? house.address_detail.trim() : "";
  return detail ? `${regionName} ${detail}` : regionName;
}

function enrichHouse(item) {
  const regionId = item.house.address;
  const regionName = getRegionNameById(regionId);
  const detail = item.house.address_detail || "";
  const fullAddress = detail ? `${regionName} ${detail}` : regionName;
  return {
    ...item,
    house: {
      ...item.house,
      region_id: regionId,
      region_name: regionName,
      full_address: fullAddress
    }
  };
}

async function loadRegions() {
  if (Object.keys(regionMap).length > 0) return;
  const res = await fetch("regions.json");
  if (!res.ok) {
    throw new Error("행정구역 정보를 불러오지 못했습니다.");
  }
  const list = await res.json();
  regionMap = list.reduce((acc, region) => {
    acc[region.id] = region.label;
    return acc;
  }, {});
}

// ========== AI 추천 알고리즘 ==========
async function getAIRecommendation(filteredList) {


  if (filteredList.length === 0) {
    // alert("추천할 매물이 없습니다.");
    return;
  }

  // 로딩 표시 (버튼)
  const searchBtn = document.getElementById("searchBtn");
  const originalBtnText = searchBtn ? searchBtn.innerHTML : "맺집 찾기";

  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="button-spinner"></span> 분석 중...';
  }

  try {
    // 1. 데이터 전처리: 통근 거리 계산 및 상위 후보 선정
    const candidates = filteredList.map(item => {
      const h = item.house;
      const fullAddress = buildFullAddress(h);
      // 통근 거리 계산 (평균 거리)
      let totalDist = 0;
      if (commuteLocations.length > 0) {
        commuteLocations.forEach(loc => {
          totalDist += getDistanceFromLatLonInKm(h.lat, h.lng, loc.y, loc.x);
        });
        h.avgCommuteDist = totalDist / commuteLocations.length;
      } else {
        h.avgCommuteDist = 0;
      }

      return {
        id: h.id,
        address: fullAddress,
        address_id: h.region_id ?? h.address,
        deposit: h.deposit,
        rent: h.rent,
        maintenance_fee: h.maintenance_fee,
        lifestyle: item.lifestyle,
        avgCommuteDist: h.avgCommuteDist
      };
    });

    // 통근 위치가 있다면 거리순으로 정렬하여 상위 30개만 API에 전송 (토큰 절약)
    if (commuteLocations.length > 0) {
      candidates.sort((a, b) => a.avgCommuteDist - b.avgCommuteDist);
    }
    const topCandidates = candidates.slice(0, 30);

    // 2. 사용자 요구사항 구성
    const rentTypeChip = document.querySelector("#rent-type .chip.active");
    const userReq = {
      rentType: rentTypeChip ? rentTypeChip.textContent : "전체",
      depositMin: document.getElementById("depositMin").value,
      depositMax: document.getElementById("depositMax").value,
      rentMin: document.getElementById("rentMin").value,
      rentMax: document.getElementById("rentMax").value,
      commuteLocations: commuteLocations.map(l => l.name) // 좌표 대신 이름만 보내도 됨 (거리는 이미 계산해서 보냄)
    };

    // 3. Cloudflare Worker 호출
    const WORKER_URL = "https://matjib-ai.th20001026.workers.dev";

    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userReq: userReq,
        topCandidates: topCandidates
      })
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    const content = JSON.parse(data.choices[0].message.content);
    console.log("AI 추천 결과:", content);

    const recommendations = content.recommendations;
    const keywords = recommendations.map(r => r.keyword);

    // 5. 결과 처리: 추천 키워드들 중 하나라도 포함된 매물 필터링
    const aiFiltered = filteredList.filter(item => {
      const label = buildFullAddress(item.house);
      return keywords.some(k => label.includes(k));
    });

    if (aiFiltered.length > 0) {
      // 맵과 리스트 업데이트 (추천 사유 전달)
      updateMap(aiFiltered);
      updateList(aiFiltered, recommendations);

      // 첫 번째 매물로 지도 중심 이동
      const first = aiFiltered[0].house;
      const moveLatLon = new kakao.maps.LatLng(parseFloat(first.lat), parseFloat(first.lng));
      map.setCenter(moveLatLon);

      // Alert 제거됨
    } else {
      console.log(`AI가 추천한 지역(${keywords.join(", ")})에 해당하는 매물을 찾을 수 없습니다.`);
    }

  } catch (e) {
    console.error(e);
    // alert("AI 추천 중 오류가 발생했습니다: " + e.message);
  } finally {
    // 로딩 숨김 및 버튼 복구
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.innerHTML = originalBtnText;
    }
  }
}

// 거리 계산 함수 (Haversine formula)
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2 - lat1);
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}
const minInput = document.getElementById("depositMin");
const maxInput = document.getElementById("depositMax");
const depositLabel = document.getElementById("depositLabel");

function updateDepositRange() {
  // min <= max になるように調整
  if (parseInt(minInput.value) > parseInt(maxInput.value)) {
    const tmp = minInput.value;
    minInput.value = maxInput.value;
    maxInput.value = tmp;
  }

  const minVal = parseInt(minInput.value);
  const maxVal = parseInt(maxInput.value);

  depositLabel.textContent = `(${minVal}만 ~ ${maxVal}만)`;
  updateTrack();
}

function updateTrack() {
  const min = parseInt(minInput.min);
  const max = parseInt(minInput.max);

  const minVal = parseInt(minInput.value);
  const maxVal = parseInt(maxInput.value);

  const minPercent = ((minVal - min) / (max - min)) * 100;
  const maxPercent = ((maxVal - min) / (max - min)) * 100;

  const track = document.getElementById("dep-slider");
  track.style.background = `
    linear-gradient(
      to right,
      #ddd ${minPercent}%,
      #875c44 ${minPercent}%,
      #875c44 ${maxPercent}%,
      #ddd ${maxPercent}%
    )
  `;
}

if (minInput && maxInput) {
  minInput.addEventListener("input", updateDepositRange);
  maxInput.addEventListener("input", updateDepositRange);
  updateDepositRange(); // 初期表示
}

// ==========월세 슬라이더 입력 처리==========
const r_minInput = document.getElementById("rentMin");
const r_maxInput = document.getElementById("rentMax");
const rentLabel = document.getElementById("rentLabel");

function updateRentRange() {
  // min <= max になるように調整
  if (parseInt(r_minInput.value) > parseInt(r_maxInput.value)) {
    const tmp = r_minInput.value;
    r_minInput.value = r_maxInput.value;
    r_maxInput.value = tmp;
  }

  const minVal = parseInt(r_minInput.value);
  const maxVal = parseInt(r_maxInput.value);

  rentLabel.textContent = `(${minVal}만 ~ ${maxVal}만)`;
  updateRentTrack();
}

function updateRentTrack() {
  const min = parseInt(r_minInput.min);
  const max = parseInt(r_minInput.max);

  const minVal = parseInt(r_minInput.value);
  const maxVal = parseInt(r_maxInput.value);

  const minPercent = ((minVal - min) / (max - min)) * 100;
  const maxPercent = ((maxVal - min) / (max - min)) * 100;

  const track = document.getElementById("rent-slider");
  track.style.background = `
    linear-gradient(
      to right,
      #ddd ${minPercent}%,
      #875c44 ${minPercent}%,
      #875c44 ${maxPercent}%,
      #ddd ${maxPercent}%
    )
  `;
}

if (r_minInput && r_maxInput) {
  r_minInput.addEventListener("input", updateRentRange);
  r_maxInput.addEventListener("input", updateRentRange);
  updateRentRange(); // 初期表示
}

//=================선택 버튼 처리=======================
document.querySelectorAll(".chip-row").forEach((row) => {
  row.addEventListener("click", (e) => {
    if (!e.target.classList.contains("chip")) return;

    const isMulti = row.dataset.multi === "true";

    if (isMulti) {
      // 복수선택 가능
      e.target.classList.toggle("active");
    } else {
      // 단일선택
      row.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      e.target.classList.add("active");
    }
  });
});


const userForm = document.querySelector("#userForm");
if (userForm) {
  userForm.addEventListener("submit", (e) => {
    e.preventDefault();

    // 1. 폼 데이터 수집
    const rentTypeChip = document.querySelector("#rent-type .chip.active");
    const rentType = rentTypeChip ? rentTypeChip.textContent : "전체";

    const depositMin = parseInt(document.getElementById("depositMin").value) || 0;
    const depositMax = parseInt(document.getElementById("depositMax").value) || 0;

    const rentMin = parseInt(document.getElementById("rentMin").value) || 0;
    const rentMax = parseInt(document.getElementById("rentMax").value) || 0;

    const includeFee = document.getElementById("includeFee").checked;

    const areaChip = document.querySelector("#area-range .chip.active");
    const areaText = areaChip ? areaChip.textContent : "전체";

    // 라이프스타일 활성화 여부 확인
    const lifestyleChips = document.querySelectorAll("#lifestyle .chip");
    const lifestyleConditions = [
      { key: 'walk', active: lifestyleChips[0].classList.contains("active") },
      { key: 'running', active: lifestyleChips[1].classList.contains("active") },
      { key: 'pet', active: lifestyleChips[2].classList.contains("active") },
      { key: 'gym', active: lifestyleChips[3].classList.contains("active") },
      { key: 'concert', active: lifestyleChips[4].classList.contains("active") },
      { key: 'cafe', active: lifestyleChips[5].classList.contains("active") },
      { key: 'hiking', active: lifestyleChips[6].classList.contains("active") },
      { key: 'baseball', active: lifestyleChips[7].classList.contains("active") },
    ];

    // 2. 필터링 로직
    const filtered = allHouses.filter(item => {
      const h = item.house;
      const l = item.lifestyle || {};

      // (1) 거래 유형
      if (rentType !== "전체" && h.rent_type !== rentType) return false;

      // (2) 보증금
      if (h.deposit < depositMin || h.deposit > depositMax) return false;

      // (3) 월세 (+관리비)
      let checkRent = h.rent;
      if (includeFee) checkRent += h.maintenance_fee;
      // 전세인 경우 월세가 0이므로 범위에 포함되는지 확인 (보통 0~0 범위가 아니면 제외될 수 있음)
      // 하지만 사용자 경험상 전세를 선택했을 때 월세 필터가 어떻게 동작할지 고려해야 함.
      // 여기서는 단순하게 계산된 월세(전세는 0)가 범위 내에 있는지 확인.
      if (checkRent < rentMin || checkRent > rentMax) return false;

      // (4) 면적 (평수 변환)
      const pyeong = h.area_m2 / 3.3058;
      if (areaText !== "전체") {
        if (areaText === "10평 이하" && pyeong > 10) return false;
        if (areaText === "10평대" && (pyeong < 10 || pyeong >= 20)) return false;
        if (areaText === "20평대" && (pyeong < 20 || pyeong >= 30)) return false;
        if (areaText === "30평대" && (pyeong < 30 || pyeong >= 40)) return false;
        if (areaText === "40평대" && (pyeong < 40 || pyeong >= 50)) return false;
        if (areaText === "50평대" && (pyeong < 50 || pyeong >= 60)) return false;
        if (areaText === "60평 이상" && pyeong < 60) return false;
      }

      // (5) 라이프스타일 (AND 조건: 선택된 모든 조건 만족해야 함)
      for (const cond of lifestyleConditions) {
        if (cond.active) {
          // 해당 라이프스타일 데이터가 1이어야 함. 데이터가 없거나 0이면 탈락
          if (!l[cond.key] || l[cond.key] == 0) return false;
        }
      }

      return true;
    });

    // 3. 지도 업데이트
    console.log(`검색 결과: ${filtered.length}건`);
    if (filtered.length === 0) {
      alert("조건에 맞는 매물이 없습니다.");
    } else {
      updateMap(filtered);
      updateList(filtered); // 리스트 업데이트 및 뷰 전환

      // 첫 번째 매물로 중심 이동 (상세정보는 로드하지 않음 -> 리스트 뷰 유지)
      const first = filtered[0].house;
      const moveLatLon = new kakao.maps.LatLng(parseFloat(first.lat), parseFloat(first.lng));
      map.setCenter(moveLatLon);

      // AI 추천 실행 (검색 트리거)
      getAIRecommendation(filtered);
    }
  });
}


// ========== 통근 위치 추가 ==========

const commuteInput = document.getElementById("commuteInput");
const commuteAddBtn = document.getElementById("commuteAddBtn");
const commuteList = document.getElementById("commuteList");
let commuteLocations = []; // 좌표 저장용 배열

function addCommuteItem() {
  const text = commuteInput.value.trim();
  if (!text) return;

  // 같은장소-> 추가x
  const exists = Array.from(commuteList.querySelectorAll(".commute-item-name"))
    .some((el) => el.textContent === text);
  if (exists) {
    commuteInput.value = "";
    return;
  }

  // 장소 검색 객체 생성 (키워드 검색용)
  const ps = new kakao.maps.services.Places();

  // 키워드로 장소를 검색합니다
  ps.keywordSearch(text, function (result, status) {
    // 정상적으로 검색이 완료됐으면 
    if (status === kakao.maps.services.Status.OK) {
      const x = result[0].x;
      const y = result[0].y;
      const coords = new kakao.maps.LatLng(y, x);

      // 통근 위치 마커 생성 (구분을 위해 다른 이미지나 색상을 쓸 수 있지만 일단 기본 마커 사용)
      // 매물 마커와 겹칠 수 있으니 z-index를 높이거나 다른 스타일 적용 고려 가능
      const marker = new kakao.maps.Marker({
        position: coords,
        map: map
      });

      const locationData = {
        name: text,
        x: x, // 경도 (lng)
        y: y, // 위도 (lat)
        marker: marker // 마커 객체 저장
      };

      // 좌표 배열에 저장
      commuteLocations.push(locationData);
      console.log("통근 위치 추가됨:", locationData);

      // 지도 중심 이동
      map.setCenter(coords);

      // UI 추가
      const item = document.createElement("div");
      item.className = "commute-item";

      const nameSpan = document.createElement("span");
      nameSpan.className = "commute-item-name";
      nameSpan.textContent = text; // 입력한 텍스트 그대로 사용

      // 아래 네줄은 php로 넘어갈 유저 요구사항 배열
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "commuteList[]";   // 중요!
      hidden.value = text;
      // 

      const removeBtn = document.createElement("button");
      removeBtn.className = "commute-remove";
      removeBtn.textContent = "x";
      removeBtn.addEventListener("click", () => {
        commuteList.removeChild(item);

        // 마커 지도에서 제거
        marker.setMap(null);

        // 배열에서도 삭제
        commuteLocations = commuteLocations.filter(loc => loc.name !== text);
        console.log("통근 위치 삭제됨:", text);
      });

      item.appendChild(nameSpan);
      item.appendChild(removeBtn);
      item.appendChild(hidden);  //php넘길것 아이템에 추가
      commuteList.appendChild(item);

      commuteInput.value = "";

    } else {
      alert("키워드로 장소를 찾을 수 없습니다. 정확한 장소명을 입력해주세요.");
    }
  });
}

if (commuteAddBtn) {
  commuteAddBtn.addEventListener("click", addCommuteItem);
}

// Enter키 눌러도 저장
if (commuteInput) {
  commuteInput.addEventListener("keydown", (e) => {
    if (e.isComposing) return; // IME 입력 중(한글 조합 중)이면 무시
    if (e.key === "Enter") {
      e.preventDefault();
      addCommuteItem();
    }
  });
}


document.addEventListener("DOMContentLoaded", () => {

  // SDK 로드가 끝난 뒤에 실행되도록
  kakao.maps.load(async () => {
    const container = document.getElementById("map");
    if (!container) return;

    map = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(37.5, 127.0),
      level: 4,

    });

    try {
      await loadRegions();
      const list = await fetch("houses.json").then(res => res.json());
      const processedList = list.map(enrichHouse);
      allHouses = processedList;

      // 초기 렌더링: 전체 목록 표시
      updateMap(allHouses);

      // 초기 좌표로 건대 매물 (광진구)
      const firstItem = allHouses.find(item => buildFullAddress(item.house).includes("광진구")) || allHouses[0];
      if (firstItem) {
        const firstPos = new kakao.maps.LatLng(parseFloat(firstItem.house.lat), parseFloat(firstItem.house.lng));
        map.setCenter(firstPos);
        map.setLevel(4);

        // 초기 상세정보 로드
        loadDetail(firstItem.house.id);
      }
    } catch (err) {
      console.error(err);
    }

  });

  // 목록으로 돌아가기 버튼 이벤트
  const backBtn = document.getElementById("backToListBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      document.getElementById("detail-view").style.display = "none";
      document.getElementById("list-view").style.display = "flex";

      // 모든 마커 다시 보이기
      Object.values(markersById).forEach(m => m.setMap(map));
    });
  }

});

function updateMap(list) {
  // 1. 기존 마커 제거
  markers.forEach(m => m.setMap(null));
  markers = [];
  markersById = {};
  selectedMarker = null;

  // 마커 이미지 설정 (모든 검색 결과에 적용)
  var imageSrc = 'mark3.png',
    imageSize = new kakao.maps.Size(36, 36),
    imageOption = { offset: new kakao.maps.Point(17, 36) };
  var markerImage = new kakao.maps.MarkerImage(imageSrc, imageSize, imageOption);

  // 2. 새 마커 생성
  list.forEach(item => {
    const h = item.house;
    const pos = new kakao.maps.LatLng(parseFloat(h.lat), parseFloat(h.lng));

    // 마커 이미지 적용
    const marker = new kakao.maps.Marker({
      position: pos,
      map: map,
      image: markerImage
    });

    markersById[h.id] = marker;

    kakao.maps.event.addListener(marker, "click", () => {
      loadDetail(h.id);
    });

    markers.push(marker);
  });
}

function updateList(list, aiRecommendations = []) {
  const listContent = document.getElementById("list-content");
  if (!listContent) return;
  listContent.innerHTML = ""; // 초기화

  // 지역별 그룹핑
  const grouped = {};
  list.forEach(item => {
    const h = item.house;
    const regionLabel = h.region_name || getRegionNameById(h.address);
    let region = "기타";
    if (regionLabel) {
      const parts = regionLabel.split(" ");
      region = parts[1] || regionLabel;
    }

    if (!grouped[region]) {
      grouped[region] = [];
    }
    grouped[region].push(item);
  });

  // 그룹별 렌더링
  for (const region in grouped) {
    // 섹션 컨테이너
    const section = document.createElement("div");
    section.className = "list-section";

    // 헤더
    const header = document.createElement("div");
    header.className = "list-section-header";
    header.textContent = region;
    section.appendChild(header);

    // AI 추천 사유 표시
    if (aiRecommendations.length > 0) {
      aiRecommendations.forEach(rec => {
        // 해당 지역(region)의 매물 중 하나라도 추천 키워드(rec.keyword)를 포함하는지 확인
        const isMatch = grouped[region].some(item => buildFullAddress(item.house).includes(rec.keyword));
        if (isMatch) {
          // 헤더에 버튼 추가
          const btn = document.createElement("button");
          btn.className = "ai-reason-btn";
          btn.textContent = "AI 추천 이유 보기";
          header.appendChild(btn);

          // 이유 박스 (숨김 상태로 시작)
          const reasonBox = document.createElement("div");
          reasonBox.className = "recommendation-reason";
          reasonBox.style.display = "none";
          reasonBox.innerHTML = `<strong>${rec.keyword} 추천 이유</strong><br>${rec.reason}`;
          section.appendChild(reasonBox);

          // 버튼 클릭 이벤트
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isVisible = reasonBox.style.display === "block";
            reasonBox.style.display = isVisible ? "none" : "block";
            btn.textContent = isVisible ? "AI 추천 이유 보기" : "접기";
          });
        }
      });
    }

    // 아이템들
    grouped[region].forEach(item => {
      const h = item.house;
      const el = document.createElement("div");
      el.className = "list-item";

      // 가격 문자열
      const priceStr = (h.rent_type === "전세")
        ? `전세 ${num(h.deposit)}`
        : `월세 ${num(h.deposit)} / ${num(h.rent)}`;

      const fullAddress = buildFullAddress(h);
      el.innerHTML = `
        <div class="list-item-title">${fullAddress}</div>
        <div class="list-item-price">${priceStr}</div>
        <div class="list-item-info">${h.room_type} · ${h.area_m2}m² · ${h.floor}층</div>
      `;

      el.addEventListener("click", () => {
        loadDetail(h.id);
      });

      section.appendChild(el);
    });

    listContent.appendChild(section);
  }

  // 뷰 전환: 리스트 보이기, 상세 숨기기
  const listView = document.getElementById("list-view");
  const detailView = document.getElementById("detail-view");
  if (listView) listView.style.display = "flex";
  if (detailView) detailView.style.display = "none";
}

function loadDetail(id) {
  // Find data from global array instead of fetching
  const item = allHouses.find(i => i.house.id == id);
  if (item) {
    renderDetail(item.house, item.lifestyle);

    // 상세 뷰 보이기, 리스트 숨기기
    const listView = document.getElementById("list-view");
    const detailView = document.getElementById("detail-view");
    if (detailView) detailView.style.display = "block";
    if (listView) listView.style.display = "none";

    // 목록으로 돌아가기 버튼 보이기
    const backBtn = document.getElementById("backToListBtn");
    if (backBtn) backBtn.style.display = "block";

    // === 지도 이동 및 마커 필터링 ===
    // 모든 마커 숨기기
    Object.values(markersById).forEach(m => m.setMap(null));

    const marker = markersById[id];
    if (marker) {
      // 선택된 마커만 보이기
      marker.setMap(map);

      // 지도 중심 이동
      map.setCenter(marker.getPosition());
    }

  } else {
    console.error("House not found:", id);
  }
}

function renderDetail(h, life) {
  // 가격
  const price = (h.rent_type === "전세")
    ? `전세 ${num(h.deposit)}`
    : `월세 ${num(h.deposit)} / ${num(h.rent)}`;
  setText("detailPrice", price);

  // 메타
  setText("detailMeta",
    `${h.room_type} · ${h.area_m2}m² · ${h.floor}층 / ${h.total_floor}층 · ${num(h.maintenance_fee)}만원`
  );

  // 아이콘 4개 
  setText("iconRoomType", h.room_type);
  setText("iconArea", `${h.area_m2}m²`);
  setText("iconFloor", `${h.floor}층/${h.total_floor}층`);
  setText("iconFee", `${num(h.maintenance_fee)}만원`);

  // 상세정보 
  setText("d-area", `${h.area_m2}m²`);
  setText("d-roomsBaths", `${h.rooms}개 / ${h.baths}개`);
  setText("d-direction", h.direction);
  setText("d-heating", h.heating);
  setText("d-elevator", (+h.elevator ? "있음" : "없음"));
  setText("d-parking", `${h.parking_total}대`);
  setText("d-moveIn", dateDot(h.move_in_date));
  setText("d-buildingType", h.building_type);

  // 키워드 보이기 및 숨기기
  renderKeywords(life);

}

function renderKeywords(life) {
  toggle("kw-walk", life && +life.walk);
  toggle("kw-running", life && +life.running);
  toggle("kw-pet", life && +life.pet);
  toggle("kw-gym", life && +life.gym);
  toggle("kw-concert", life && +life.concert);
  toggle("kw-cafe", life && +life.cafe);
  toggle("kw-hiking", life && +life.hiking);
  toggle("kw-baseball", life && +life.baseball);
}

function toggle(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = on ? "inline-flex" : "none";
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function num(v) { return (+v || 0).toLocaleString("ko-KR"); }

function dateDot(s) { return String(s || "").replaceAll("-", "."); }
