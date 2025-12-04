// ========== 보증금 슬라이더 입력처리 ==========
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

minInput.addEventListener("input", updateDepositRange);
maxInput.addEventListener("input", updateDepositRange);
updateDepositRange(); // 初期表示

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

r_minInput.addEventListener("input", updateRentRange);
r_maxInput.addEventListener("input", updateRentRange);
updateRentRange(); // 初期表示

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


document.querySelector("#userForm").addEventListener("submit", (e) => {
  e.preventDefault();

  //렌트타입 저장
  const activeChipRent = document.querySelector("#rent-type .chip.active");
  document.getElementById("rentTypeInput").value = activeChipRent ? activeChipRent.textContent : "";

  //면적 저장
  const activeChipArea = document.querySelector("#area-range .chip.active");
  document.getElementById("areaInput").value = activeChipArea ? activeChipArea.textContent : "";

  //라이프스타일 저장
  const chips = document.querySelectorAll("#lifestyle .chip");
  document.getElementById("walkInput").value    = chips[0].classList.contains("active") ? "산책" : 0;
  document.getElementById("runningInput").value = chips[1].classList.contains("active") ? "러닝" : 0;
  document.getElementById("petInput").value     = chips[2].classList.contains("active") ? "반려동물" : 0;
  document.getElementById("gymInput").value     = chips[3].classList.contains("active") ? "헬스" : 0;
  document.getElementById("concertInput").value = chips[4].classList.contains("active") ? "콘서트" : 0;
  document.getElementById("cafeInput").value    = chips[5].classList.contains("active") ? "카페" : 0;
  document.getElementById("hikingInput").value  = chips[6].classList.contains("active") ? "등산" : 0;
  document.getElementById("baseballInput").value= chips[7].classList.contains("active") ? "야구" : 0;


  const formData = new FormData(e.target);

  fetch("matjib.php", {
    method: "POST",
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    updateMap(data);
    updateDetail(data);
  });
}  
);


// ========== 통근 위치 추가 ==========

const commuteInput = document.getElementById("commuteInput");
const commuteAddBtn = document.getElementById("commuteAddBtn");
const commuteList = document.getElementById("commuteList");

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

  const item = document.createElement("div");
  item.className = "commute-item";

  const nameSpan = document.createElement("span");
  nameSpan.className = "commute-item-name";
  nameSpan.textContent = text;

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
  });

  item.appendChild(nameSpan);
  item.appendChild(removeBtn);
  item.appendChild(hidden);  //php넘길것 아이템에 추가
  commuteList.appendChild(item);

  commuteInput.value = "";
}

commuteAddBtn.addEventListener("click", addCommuteItem);

// Enter키 눌러도 저장
commuteInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addCommuteItem();
  }
});


let map;

document.addEventListener("DOMContentLoaded", () => {
  
  // SDK 로드가 끝난 뒤에 실행되도록
  kakao.maps.load(() => {
    const container = document.getElementById("map");
    if (!container) return;

    map = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(37.5, 127.0),
      level: 4,
      
    });

    fetch("house.php")
      .then(res => res.json())
      .then(list => {

        
        // 초기 좌표로 건대 매물
        const first = list[320];
        const firstPos = new kakao.maps.LatLng(parseFloat(first.lat), parseFloat(first.lng));
        map.setCenter(firstPos);
        map.setLevel(4); 

        // 마커들 찍기 
        list.forEach(h => {
          const pos = new kakao.maps.LatLng(parseFloat(h.lat), parseFloat(h.lng));
          const marker = new kakao.maps.Marker({ position: pos, map });

          kakao.maps.event.addListener(marker, "click", () => {
            loadDetail(h.id);
          });
        });

        });

      })
      .catch(console.error);

});



function loadDetail(id) {
  fetch(`house_detail.php?id=${id}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) return console.error(data.error);
      renderDetail(data.house, data.lifestyle);
    })
    .catch(console.error);
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
  toggle("kw-walk",     life && +life.walk);
  toggle("kw-running",  life && +life.running);
  toggle("kw-pet",      life && +life.pet);
  toggle("kw-gym",      life && +life.gym);
  toggle("kw-concert",  life && +life.concert);
  toggle("kw-cafe",     life && +life.cafe);
  toggle("kw-hiking",   life && +life.hiking);
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

