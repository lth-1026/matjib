const WORKER_URL = "https://matjib-ai.th20001026.workers.dev";
let map;
let allHouses = []; // Store all house data
let markers = []; // Store current markers
let selectedMarker = null;
let markersById = {};
let regionMap = {}; // regionId -> 지역 정보
let posById = {};
let places;

const LIFESTYLE_META = [
  { key: "walk", label: "산책" },
  { key: "running", label: "러닝" },
  { key: "pet", label: "반려동물" },
  { key: "gym", label: "헬스" },
  { key: "performance", label: "공연" },
  { key: "cafe", label: "카페" },
  { key: "movie", label: "영화" },
  { key: "sports", label: "스포츠 관람" }
];

function getRegionInfoById(id) {
  if (id === undefined || id === null) return null;
  const key = String(id);
  return regionMap[key] || null;
}

function getRegionNameById(id) {
  const info = getRegionInfoById(id);
  return info ? info.label : "";
}

function getRegionProfileById(id) {
  const info = getRegionInfoById(id);
  return info ? info.lifestyle : null;
}

function buildFullAddress(house) {
  if (house.full_address) return house.full_address;
  const regionName = house.region_name || getRegionNameById(house.address);
  const detail = house.address_detail ? house.address_detail.trim() : "";
  return detail ? `${regionName} ${detail}` : regionName;
}

function enrichHouse(item) {
  const regionId = item.house.address;
  const regionInfo = getRegionInfoById(regionId) || {};
  const regionName = regionInfo.label || "";
  const detail = item.house.address_detail || "";
  const fullAddress = detail ? `${regionName} ${detail}` : regionName;
  return {
    ...item,
    house: {
      ...item.house,
      region_id: regionId,
      region_name: regionName,
      region_info: regionInfo,
      region_profile: regionInfo.lifestyle || null,
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
    acc[String(region.id)] = region;
    return acc;
  }, {});
}

function getLifestyleSelections() {
  const chips = document.querySelectorAll("#lifestyle .chip");
  return LIFESTYLE_META.map((meta, idx) => ({
    ...meta,
    active: chips[idx] ? chips[idx].classList.contains("active") : false
  }));
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
      const regionId = h.region_id ?? h.address;
      const regionName = h.region_name || getRegionNameById(regionId);
      const regionProfile = h.region_profile || getRegionProfileById(regionId);
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
        address_id: regionId,
        region_label: regionName,
        region_profile: regionProfile,
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
    const regionProfiles = topCandidates.reduce((acc, item) => {
      if (item.region_label && item.region_profile) {
        acc[item.region_label] = item.region_profile;
      }
      return acc;
    }, {});
    const lifestyleSelections = getLifestyleSelections();
    const activeLifestyle = lifestyleSelections.filter(item => item.active);

    // 2. 사용자 요구사항 구성
    const rentTypeChip = document.querySelector("#rent-type .chip.active");
    const userReq = {
      rentType: rentTypeChip ? rentTypeChip.textContent : "전체",
      depositMin: document.getElementById("depositMin").value,
      depositMax: document.getElementById("depositMax").value,
      rentMin: document.getElementById("rentMin").value,
      rentMax: document.getElementById("rentMax").value,
      commuteLocations: commuteLocations.map(l => l.name), // 좌표 대신 이름만 보내도 됨 (거리는 이미 계산해서 보냄)
      lifestyleSelections: lifestyleSelections,
      activeLifestyle: activeLifestyle
    };

    // 3. Cloudflare Worker 호출
    // 3. Cloudflare Worker 호출

    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userReq: userReq,
        topCandidates: topCandidates,
        regionProfiles: regionProfiles
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
// ========== 슬라이더 & Input 동기화 (보증금 & 월세) ==========

function setupRangeSync(minSliderId, maxSliderId, minInputId, maxInputId, trackId) {
  const minSlider = document.getElementById(minSliderId);
  const maxSlider = document.getElementById(maxSliderId);
  const minInput = document.getElementById(minInputId);
  const maxInput = document.getElementById(maxInputId);
  const track = document.getElementById(trackId);

  if (!minSlider || !maxSlider || !minInput || !maxInput || !track) return;

  const min = parseInt(minSlider.min);
  const max = parseInt(minSlider.max);

  function updateTrack() {
    const minVal = parseInt(minSlider.value);
    const maxVal = parseInt(maxSlider.value);
    const minPercent = ((minVal - min) / (max - min)) * 100;
    const maxPercent = ((maxVal - min) / (max - min)) * 100;

    // Use theme colors: #e4d9c2 for empty, #875c44 for filled
    track.style.background = `linear-gradient(to right, #e4d9c2 ${minPercent}%, #875c44 ${minPercent}%, #875c44 ${maxPercent}%, #e4d9c2 ${maxPercent}%)`;
  }

  function onSliderChange() {
    let minVal = parseInt(minSlider.value);
    let maxVal = parseInt(maxSlider.value);

    // Prevent cross over
    if (minVal > maxVal) {
      if (this === minSlider) {
        minSlider.value = maxVal;
        minVal = maxVal;
      } else {
        maxSlider.value = minVal;
        maxVal = minVal;
      }
    }

    minInput.value = minVal;
    maxInput.value = maxVal;
    updateTrack();
  }

  function onInputChange() {
    let minVal = parseInt(minInput.value);
    let maxVal = parseInt(maxInput.value);

    // Validate
    if (minVal < min) minVal = min;
    if (maxVal > max) maxVal = max;
    if (minVal > maxVal) {
      // Just clamp without moving the other for simplicity in text input, 
      // or swap? Let's minimal clamp.
      if (this === minInput) minVal = maxVal;
      else maxVal = minVal;
    }

    minSlider.value = minVal;
    maxSlider.value = maxVal;
    updateTrack();
  }

  minSlider.addEventListener("input", onSliderChange);
  maxSlider.addEventListener("input", onSliderChange);
  minInput.addEventListener("input", onInputChange); // Update on typing
  minInput.addEventListener("change", onInputChange); // Confirm on enter/blur
  maxInput.addEventListener("input", onInputChange);
  maxInput.addEventListener("change", onInputChange);

  // Trigger initial update from INPUT values (which are set to full range in HTML)
  onInputChange();
}

// 보증금 (0~5000)
setupRangeSync("depositMin", "depositMax", "inputDepositMin", "inputDepositMax", "dep-slider");

// 월세 (0~2000)
setupRangeSync("rentMin", "rentMax", "inputRentMin", "inputRentMax", "rent-slider");

//=================선택 버튼 처리=======================
document.querySelectorAll(".chip-row").forEach((row) => {
  row.addEventListener("click", (e) => {
    if (!e.target.classList.contains("chip")) return;

    const isMulti = row.dataset.multi === "true";

    if (isMulti) {
      // 복수선택 가능
      const text = e.target.textContent.trim();
      if (text === "전체") {
        // "전체" 클릭 시: 나머지 모두 해제하고 본인만 활성화
        row.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        e.target.classList.add("active");
      } else {
        // 일반 옵션 클릭 시: "전체"가 켜져 있다면 끄기
        e.target.classList.toggle("active");
        // "전체" 칩 찾아서 끄기
        const allChip = Array.from(row.querySelectorAll(".chip")).find(c => c.textContent.trim() === "전체");
        if (allChip) allChip.classList.remove("active");
      }
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

    const areaChips = document.querySelectorAll("#area-range .chip.active");
    const areaTexts = Array.from(areaChips).map(c => c.textContent.trim());
    const isAreaAll = areaTexts.includes("전체") || areaTexts.length === 0;

    // 라이프스타일 활성화 여부 확인
    const lifestyleSelections = getLifestyleSelections();
    const lifestyleConditions = lifestyleSelections.map(sel => ({
      key: sel.key,
      active: sel.active
    }));

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
      // (4) 면적 (평수 변환)
      const pyeong = h.area_m2 / 3.3058;

      if (!isAreaAll) {
        let areaMatch = false;
        for (const text of areaTexts) {
          if (text === "10평 이하" && pyeong <= 10) areaMatch = true;
          else if (text === "10평대" && pyeong >= 10 && pyeong < 20) areaMatch = true;
          else if (text === "20평대" && pyeong >= 20 && pyeong < 30) areaMatch = true;
          else if (text === "30평대" && pyeong >= 30 && pyeong < 40) areaMatch = true;
          else if (text === "40평대" && pyeong >= 40 && pyeong < 50) areaMatch = true;
          else if (text === "50평대" && pyeong >= 50 && pyeong < 60) areaMatch = true;
          else if (text === "60평 이상" && pyeong >= 60) areaMatch = true;
        }
        if (!areaMatch) return false;
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


//============= overlay용 ===================

// 오버레이 '맺집 찾기' 버튼
const overlaySearchBtn = document.getElementById("overlaySearchBtn");
if (overlaySearchBtn) {
  overlaySearchBtn.addEventListener("click", () => {
    // 1) 거래유형 단일 선택 동기화
    syncSingleChip("#initial-rent-type", "#rent-type");

    // 2) 면적 단일 선택 동기화
    syncSingleChip("#initial-area-range", "#area-range");

    // 3) 라이프스타일 복수 선택 동기화
    syncMultiChips("#initial-lifestyle", "#lifestyle");

    // 4) 통근 위치 동기화
    syncCommuteFromOverlay();

    // 오버레이 닫기
    overlayOff();

    // 6) 메인 폼 submit
    const form = document.querySelector("#userForm");
    if (form) {
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  });
}

/**
 * 단일 선택 chip-row 동기화
 */
function syncSingleChip(srcRowSelector, dstRowSelector) {
  const srcActive = document.querySelector(`${srcRowSelector} .chip.active`);
  if (!srcActive) return;

  const text = srcActive.textContent.trim();
  const dstRow = document.querySelector(dstRowSelector);
  if (!dstRow) return;

  dstRow.querySelectorAll(".chip").forEach((chip) => {
    if (chip.textContent.trim() === text) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
}

/**
 * 복수 선택 chip-row 동기화
 */
function syncMultiChips(srcRowSelector, dstRowSelector) {
  const srcRow = document.querySelector(srcRowSelector);
  const dstRow = document.querySelector(dstRowSelector);
  if (!srcRow || !dstRow) return;

  const srcChips = Array.from(srcRow.querySelectorAll(".chip"));
  const dstChips = Array.from(dstRow.querySelectorAll(".chip"));

  dstChips.forEach((dstChip) => {
    const text = dstChip.textContent.trim();
    const srcChip = srcChips.find(
      (c) => c.textContent.trim() === text
    );
    const isActive = srcChip && srcChip.classList.contains("active");
    dstChip.classList.toggle("active", !!isActive);
  });
}

// ========== 통근 위치 추가==========

// --- 메인 aside용 ---
const commuteInput = document.getElementById("commuteInput");
const commuteAddBtn = document.getElementById("commuteAddBtn");
const commuteList = document.getElementById("commuteList");

// --- 오버레이용 ---
const oCommuteInput = document.getElementById("initial-commuteInput");
const oCommuteAddBtn = document.getElementById("initial-commuteAddBtn");
const oCommuteList = document.getElementById("initial-commuteList");

// 통근 좌표/마커 저장용
let commuteLocations = [];

/**
 * 공통: 통근 아이템 DOM 생성
 * withHidden = true  이면 php로 보낼 hidden input도 같이 생성
 * marker     = 해당 통근 위치 마커 (없으면 null)
 */
function createCommuteItemElement(text, withHidden, marker) {
  const item = document.createElement("div");
  item.className = "commute-item";

  const nameSpan = document.createElement("span");
  nameSpan.className = "commute-item-name";
  nameSpan.textContent = text;

  const removeBtn = document.createElement("button");
  removeBtn.className = "commute-remove";
  removeBtn.textContent = "x";
  removeBtn.addEventListener("click", () => {
    // UI에서 제거
    if (item.parentElement) {
      item.parentElement.removeChild(item);
    }

    // 마커 지도에서 제거
    if (marker) {
      marker.setMap(null);
    }

    // 배열에서도 제거
    commuteLocations = commuteLocations.filter(loc => loc.name !== text);
    console.log("통근 위치 삭제됨:", text);
  });

  item.appendChild(nameSpan);
  item.appendChild(removeBtn);

  if (withHidden) {
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = "commuteList[]";  // php에서 받을 이름
    hidden.value = text;
    item.appendChild(hidden);
  }

  return item;
}

/**
 * 메인 aside에 통근 위치 추가
 * - textArg 가 있으면 그 텍스트 사용 (오버레이 동기화용)
 * - 없으면 commuteInput 의 값을 사용 (사용자 입력)
 * - Kakao Places 로 좌표 검색해서 마커 찍고 commuteLocations 에 저장
 */
function addCommuteItemMain(textArg) {
  const text = (textArg ?? commuteInput.value.trim());
  if (!text) return;

  // 같은 장소 중복 방지
  const exists = Array.from(
    commuteList.querySelectorAll(".commute-item-name")
  ).some((el) => el.textContent === text);

  if (exists) {
    if (!textArg) commuteInput.value = "";
    return;
  }

  // Kakao Places 객체 (이미 전역 places 쓰고 있으면 그걸 써도 OK)
  const ps = new kakao.maps.services.Places();

  ps.keywordSearch(text, (result, status) => {
    if (status !== kakao.maps.services.Status.OK || !result.length) {
      alert("키워드로 장소를 찾을 수 없습니다. 정확한 장소명을 입력해주세요.");

      // 좌표가 없어도 UI/hidden 만 추가하고 싶다면 아래 주석 해제
      // const item = createCommuteItemElement(text, true, null);
      // commuteList.appendChild(item);

      if (!textArg) commuteInput.value = "";
      return;
    }

    const x = result[0].x; // lng
    const y = result[0].y; // lat
    const coords = new kakao.maps.LatLng(y, x);

    const marker = new kakao.maps.Marker({
      position: coords,
      map: map
    });

    const locationData = {
      name: text,
      x: x,
      y: y,
      marker: marker
    };
    commuteLocations.push(locationData);
    console.log("통근 위치 추가됨:", locationData);

    // 지도 중심 이동 (좋으면 유지, 싫으면 주석)
    map.setCenter(coords);

    const item = createCommuteItemElement(text, true, marker);
    commuteList.appendChild(item);

    if (!textArg) commuteInput.value = "";
  });
}

// 메인 aside: 버튼/엔터 처리
if (commuteAddBtn && commuteInput) {
  commuteAddBtn.addEventListener("click", () => addCommuteItemMain());
  commuteInput.addEventListener("keydown", (e) => {
    if (e.isComposing) return; // 한글 조합중이면 무시
    if (e.key === "Enter") {
      e.preventDefault();
      addCommuteItemMain();
    }
  });
}

/**
 * 오버레이에 통근 위치 추가 (좌표/마커 없음, 텍스트만)
 */
function addCommuteItemOverlay() {
  const text = oCommuteInput.value.trim();
  if (!text) return;

  const exists = Array.from(
    oCommuteList.querySelectorAll(".commute-item-name")
  ).some((el) => el.textContent === text);

  if (exists) {
    oCommuteInput.value = "";
    return;
  }

  const item = createCommuteItemElement(text, false, null);
  oCommuteList.appendChild(item);

  oCommuteInput.value = "";
}

// 오버레이: 버튼/엔터 처리
if (oCommuteAddBtn && oCommuteInput) {
  oCommuteAddBtn.addEventListener("click", addCommuteItemOverlay);
  oCommuteInput.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      addCommuteItemOverlay();
    }
  });
}

/**
 * 오버레이에 쌓아둔 통근 위치 -> 메인 aside로 동기화
 * (오버레이에 있는 텍스트를 하나씩 addCommuteItemMain으로 보내서,
 *  좌표 검색 + 마커 생성까지 같이 수행)
 */
function syncCommuteFromOverlay() {
  if (!oCommuteList || !commuteList) return;

  // 메인 리스트 초기화
  commuteList.innerHTML = "";
  commuteLocations.forEach(loc => {
    if (loc.marker) loc.marker.setMap(null);
  });
  commuteLocations = [];

  const names = Array.from(
    oCommuteList.querySelectorAll(".commute-item-name")
  ).map((el) => el.textContent);

  names.forEach((name) => addCommuteItemMain(name));
}



document.addEventListener("DOMContentLoaded", () => {
  // 카카오 SDK가 준비된 뒤에 실행
  kakao.maps.load(async () => {
    const container = document.getElementById("map");
    if (!container) return;

    // 지도 생성
    map = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(37.5, 127.0),
      level: 4,
    });

    // 장소검색 객체
    places = new kakao.maps.services.Places();

    try {
      // 1) 행정구역 / 매물 데이터 로드
      await loadRegions();
      const list = await fetch("houses.json").then(res => res.json());
      const processedList = list.map(enrichHouse);
      allHouses = processedList;

      // 2) 마커 & 리스트 기본 세팅
      updateMap(allHouses);   // 이 안에서 markersById 가 채워짐
      updateList(allHouses);

      // 3) URL에서 focus 파라미터 읽기
      const params = new URLSearchParams(window.location.search);
      const focusStr = params.get("focus");
      const focusId = focusStr ? parseInt(focusStr, 10) : null;

      if (focusId && markersById[focusId]) {
        // ===== 태그 페이지에서 넘어온 경우: 특정 매물 포커스 =====
        console.log("focusId:", focusId);

        // 상세 정보 표시
        loadDetail(focusId);

        // 뷰 전환: 상세만 보이기
        const listView = document.getElementById("list-view");
        const detailView = document.getElementById("detail-view");
        if (detailView) detailView.style.display = "block";
        if (listView) listView.style.display = "none";

        // 목록으로 돌아가기 버튼 표시
        const backBtn = document.getElementById("backToListBtn");
        if (backBtn) backBtn.style.display = "block";

        // 지도 중심을 해당 매물로 이동
        const marker = markersById[focusId];
        if (marker) {
          marker.setMap(map); // 혹시 숨겨져 있을 경우를 대비
          map.setCenter(marker.getPosition());
          map.setLevel(4);
        }

      } else {
        // ===== 일반 접속(초기 화면) =====
        // 건대 주변 기본 중심
        const center = new kakao.maps.LatLng(
          37.543536094587516,
          127.07741635877292
        );
        map.setCenter(center);
        map.setLevel(5);

        // 처음 들어온 경우에만 취향 입력 오버레이 표시 (세션당 1회)
        if (!sessionStorage.getItem("overlayShown")) {
          overlayOn();
          sessionStorage.setItem("overlayShown", "true");
        }
      }

    } catch (err) {
      console.error(err);
    }
  });

  // 목록으로 돌아가기 버튼
  const backBtn = document.getElementById("backToListBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      const detailView = document.getElementById("detail-view");
      const listView = document.getElementById("list-view");
      if (detailView) detailView.style.display = "none";
      if (listView) listView.style.display = "flex";

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

  // ★ 지하철 계산용 좌표도 초기화
  posById = {};

  // 마커 이미지 설정
  var imageSrc = 'marker.svg',
    imageSize = new kakao.maps.Size(36, 36),
    imageOption = { offset: new kakao.maps.Point(17, 36) };
  var markerImage = new kakao.maps.MarkerImage(imageSrc, imageSize, imageOption);

  // 2. 새 마커 생성
  list.forEach(item => {
    const h = item.house;
    const pos = new kakao.maps.LatLng(parseFloat(h.lat), parseFloat(h.lng));

    const marker = new kakao.maps.Marker({
      position: pos,
      map: map,
      image: markerImage
    });

    // ★ 여기서 id -> 좌표를 저장
    markersById[h.id] = marker;
    posById[h.id] = pos;

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
    renderDetail(item.house, item.lifestyle, id);

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

function renderDetail(h, life, id) {
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

  updateNearestSubway(id);
  //updateNearestBus(id);

  renderPhotos(h, id);

}

function renderKeywords(life) {
  toggle("kw-walk", life && +life.walk);
  toggle("kw-running", life && +life.running);
  toggle("kw-pet", life && +life.pet);
  toggle("kw-gym", life && +life.gym);
  toggle("kw-performance", life && +life.performance);
  toggle("kw-cafe", life && +life.cafe);
  toggle("kw-movie",life && +life.movie);
  toggle("kw-sports",life && +life.sports);
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

function overlayOn() {
  document.getElementById("overlay").style.display = "flex";
}

function overlayOff() {
  document.getElementById("overlay").style.display = "none";
}

// ================== 최단거리 지하철 3개 표시 ==================
function updateNearestSubway(houseId) {
  if (!places) return;

  const pos = posById[houseId];
  const listEl = document.getElementById("subwayList");
  if (!pos || !listEl) return;

  listEl.innerHTML = '<div class="transport-item">검색중...</div>';

  places.categorySearch(
    "SW8",
    function (data, status, pagination) {
      if (status !== kakao.maps.services.Status.OK || !data.length) {
        listEl.innerHTML = '<div class="transport-item">주변 지하철역 정보 없음</div>';
        return;
      }

      const top3 = data.slice(0, 3);
      listEl.innerHTML = "";

      top3.forEach(place => {
        const dist = place.distance
          ? Number(place.distance).toLocaleString("ko-KR")
          : "?";

        const lineInfo = getLineInfo(place);

        const item = document.createElement("div");
        item.className = "transport-item";

        item.innerHTML = `
          ${lineInfo ? `<span class="subway-line ${lineInfo.className}">${lineInfo.label}</span>` : ""}
          ${place.place_name} · <b>${dist}m</b>
        `;
        listEl.appendChild(item);
      });
    },
    {
      location: pos,
      radius: 1000,
      sort: kakao.maps.services.SortBy.DISTANCE
    }
  );
}

// ================== 노선 색상 매핑 ==================
function getLineInfo(place) {
  const cat = place.category_name || "";

  if (cat.includes("1호선")) return { label: "1호선", className: "line1" };
  if (cat.includes("2호선")) return { label: "2호선", className: "line2" };
  if (cat.includes("3호선")) return { label: "3호선", className: "line3" };
  if (cat.includes("4호선")) return { label: "4호선", className: "line4" };
  if (cat.includes("5호선")) return { label: "5호선", className: "line5" };
  if (cat.includes("6호선")) return { label: "6호선", className: "line6" };
  if (cat.includes("7호선")) return { label: "7호선", className: "line7" };
  if (cat.includes("8호선")) return { label: "8호선", className: "line8" };
  if (cat.includes("9호선")) return { label: "9호선", className: "line9" };

  if (cat.includes("신분당선")) return { label: "신분당선", className: "lineSBD" };
  if (cat.includes("수인분당선")) return { label: "수인분당선", className: "lineSBDG" };
  if (cat.includes("경의중앙선")) return { label: "경의중앙선", className: "lineGJ" };
  if (cat.includes("공항철도")) return { label: "공항철도", className: "lineAREX" };
  if (cat.includes("경춘선")) return { label: "경춘선", className: "lineGC" };
  if (cat.includes("의정부")) return { label: "의정부선", className: "lineUL" };
  if (cat.includes("경강선")) return { label: "경강선", className: "lineKG" };

  return null;
}

function updateNearestBus(houseId) {
  if (!places) return;

  const pos = posById[houseId];
  const listEl = document.getElementById("busList");
  if (!pos || !listEl) return;

  listEl.innerHTML = '<div class="transport-item">검색중...</div>';

  places.categorySearch(
    "BS4",
    function (data, status, pagination) {
      if (status !== kakao.maps.services.Status.OK || !data.length) {
        listEl.innerHTML = '<div class="transport-item">주변 버스 정류장 정보 없음</div>';
        return;
      }

      const top3 = data.slice(0, 3);
      listEl.innerHTML = "";

      top3.forEach(stop => {
        const dist = stop.distance
          ? Number(stop.distance).toLocaleString("ko-KR")
          : "?";

        const item = document.createElement("div");
        item.className = "transport-item";

        item.innerHTML = `
          🚌 ${stop.place_name} · <b>${dist}m</b>
        `;
        listEl.appendChild(item);
      });
    },
    {
      location: pos,
      radius: 1000,
      sort: kakao.maps.services.SortBy.DISTANCE
    }
  );
}
function renderPhotos(h, id) {
  const p1 = document.getElementById("photo1");
  const p2 = document.getElementById("photo2");
  const p3 = document.getElementById("photo3");
  if (!p1 || !p2 || !p3) return;

  [p1, p2, p3].forEach(el => {
    el.style.backgroundImage = "none";
  });

  fetch(`${WORKER_URL}/unsplash?id=${id}`)
    .then(res => res.json())
    .then(urls => {
      if (!Array.isArray(urls) || urls.length === 0) return;

      const targets = [p1, p2, p3];
      targets.forEach((el, i) => {
        const url = urls[i];
        if (url) {
          el.style.backgroundImage = `url('${url}')`;
        }
      });
    })
    .catch(err => {
      console.error("Unsplash error:", err);
    });
}

// ========== 右側キーワードタグをクリックしたら別ページへ ==========
document.querySelectorAll(".icon-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    const tag = pill.dataset.tag;
    if (!tag) return;
    window.location.href = `tag_search.html?tag=${encodeURIComponent(tag)}`;
  });
});
