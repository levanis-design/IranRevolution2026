(function () {
  const COLS = 200;
  const ROWS = 200;
  const TOTAL = COLS * ROWS;

  const HOVER_SCALE = 4.8;
  const PREVIOUS_HOVER_SCALE = 2.4;

  const canvas = document.getElementById("interactiveGridCanvas");
  const flag = document.getElementById("flagContainer");
  if (!canvas || !flag) {
    console.error("Canvas or flag container not found");
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Could not get 2D context from canvas");
    return;
  }

  const tooltip = document.getElementById("tooltip");
  const previewPanel = document.getElementById("previewPanel");

  const modal = document.getElementById("modal");
  const modalNameFa = document.getElementById("modalNameFa");
  const modalNameEn = document.getElementById("modalNameEn");
  const modalLocation = document.getElementById("modalLocation");
  const modalDetails = document.getElementById("modalDetails");
  const closeModal = document.getElementById("closeModal");
  const prevPerson = document.getElementById("prevPerson");
  const nextPerson = document.getElementById("nextPerson");

  const sideInfoImage = document.getElementById("sideInfoImage");
  const sideNameFa = document.getElementById("sideNameFa");
  const sideNameEn = document.getElementById("sideNameEn");
  const sideLocation = document.getElementById("sideLocation");
  const sideDetails = document.getElementById("sideDetails");
  if (
    !ctx ||
    !tooltip ||
    !previewPanel ||
    !modal ||
    !modalNameFa ||
    !modalNameEn ||
    !modalLocation ||
    !modalDetails ||
    !closeModal ||
    !prevPerson ||
    !nextPerson ||
    !sideInfoImage ||
    !sideNameFa ||
    !sideNameEn ||
    !sideLocation ||
    !sideDetails
  ) {
    return;
  }

  let people = [];
  let width = 0;
  let height = 0;
  let hoverIndex = -1;
  let previousHoverIndex = -1;
  let currentModalIndex = 0;

  const emblemCenterX = 0.5;
  const emblemCenterY = 0.505;
  const emblemRadiusX = 0.155;
  const emblemRadiusY = 0.205;

  async function loadMemorialData() {
    try {
      const response = await fetch("./memorials.json");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: memorials.json not found`);
      }

      const data = await response.json();

      people = Array.from({ length: TOTAL }, (_, i) => {
        const item = data[i];

        if (!item) return createPlaceholderPerson(i);

        return {
          nameFa: item.name_fa || "نام فارسی قابل تکمیل",
          nameEn: item.name || "English name pending",
          locationFa: item.location_fa || item.city_fa || "محل قابل تکمیل",
          locationEn: item.location || item.city || "Location pending",
          year: item.date || "قابل تکمیل",
          age: extractAge(item.bio || item.bio_fa || ""),
          number: i + 1,
          image: item.media?.photo || "",
          bioFa: item.bio_fa || "",
          bioEn: item.bio || "",
          verified: item.verified || false
        };
      });

      resizeCanvas();
    } catch (error) {
      console.error("Could not load memorials.json", error);
      people = Array.from({ length: TOTAL }, (_, i) => createPlaceholderPerson(i));
      resizeCanvas();
    }
  }

  function createPlaceholderPerson(i) {
    return {
      nameFa: "نام فارسی قابل تکمیل",
      nameEn: `Name Placeholder ${i + 1}`,
      locationFa: "محل قابل تکمیل",
      locationEn: "Location pending",
      year: "قابل تکمیل",
      age: "قابل تکمیل",
      number: i + 1,
      image: "",
      bioFa: "",
      bioEn: "",
      verified: false
    };
  }

  function extractAge(text) {
    const match = text.match(/Age:\s*(\d+)|سن:\s*(\d+)/);
    return match ? (match[1] || match[2]) : "قابل تکمیل";
  }

  function isInsideEmblem(col, row, cellW, cellH) {
    const cx = ((col + 0.5) * cellW) / width;
    const cy = ((row + 0.5) * cellH) / height;

    return (
      ((cx - emblemCenterX) ** 2) / (emblemRadiusX ** 2) +
      ((cy - emblemCenterY) ** 2) / (emblemRadiusY ** 2)
    ) <= 1;
  }

  function resizeCanvas() {
    const rect = flag.getBoundingClientRect();

    width = Math.round(rect.width);
    height = Math.round(rect.height);

    if (width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.scale(dpr, dpr);

    renderGrid();
  }

  function renderGrid() {
    if (!width || !height || !people.length) return;

    ctx.clearRect(0, 0, width, height);

    const cellW = width / COLS;
    const cellH = height / ROWS;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (isInsideEmblem(col, row, cellW, cellH)) continue;

        const index = row * COLS + col;
        const person = people[index];

        const x = col * cellW;
        const y = row * cellH;

        const hasRealPerson =
          person &&
          person.nameEn &&
          !person.nameEn.startsWith("Name Placeholder");

        if (hasRealPerson) {
          ctx.fillStyle = "rgba(120,105,75,0.42)";
          ctx.fillRect(x, y, cellW, cellH);
        }

        ctx.strokeStyle = "rgba(0,0,0,0.14)";
        ctx.lineWidth = 0.35;
        ctx.strokeRect(x, y, cellW, cellH);
      }
    }

    drawHover(previousHoverIndex, PREVIOUS_HOVER_SCALE, "rgba(255,215,120,0.28)");
    drawHover(hoverIndex, HOVER_SCALE, "rgba(255,220,120,0.82)");
  }

  function drawHover(index, scale, fillStyle) {
    if (index < 0 || !people[index]) return;

    const cellW = width / COLS;
    const cellH = height / ROWS;

    const row = Math.floor(index / COLS);
    const col = index % COLS;

    if (isInsideEmblem(col, row, cellW, cellH)) return;

    const x = col * cellW + cellW / 2;
    const y = row * cellH + cellH / 2;

    const w = cellW * scale;
    const h = cellH * scale;

    ctx.save();

    ctx.fillStyle = fillStyle;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);

    ctx.strokeStyle = "#ffd966";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);

    ctx.restore();
  }

  function getIndexFromMouse(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (x < 0 || y < 0 || x >= width || y >= height) return -1;

    const cellW = width / COLS;
    const cellH = height / ROWS;

    const col = Math.floor(x / cellW);
    const row = Math.floor(y / cellH);

    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1;
    if (isInsideEmblem(col, row, cellW, cellH)) return -1;

    return row * COLS + col;
  }

  function updateGlow(x, y) {
    const rect = flag.getBoundingClientRect();

    flag.style.setProperty("--mouse-x", `${x - rect.left}px`);
    flag.style.setProperty("--mouse-y", `${y - rect.top}px`);
  }

  function updateSideInfo(person) {
    if (!person || !sideInfoImage) return;

    if (person.image) {
      sideInfoImage.innerHTML =
        `<img src="${person.image}" alt="${person.nameFa}" loading="lazy" decoding="async" />`;
    } else {
      sideInfoImage.textContent = "تصویر";
    }

    sideNameFa.textContent = person.nameFa;
    sideNameEn.textContent = person.nameEn;
    sideLocation.textContent = `${person.locationFa} | ${person.locationEn}`;
    sideDetails.textContent =
      `شماره ${person.number} | تاریخ ${person.year} | سن ${person.age}`;
  }

  function showTooltip(index, x, y) {
    const person = people[index];
    if (!person) return;

    tooltip.innerHTML = `
      <strong>${person.nameFa}</strong><br>
      ${person.nameEn}<br>
      شماره ${person.number} | ${person.locationFa} | ${person.locationEn} | سن ${person.age}
    `;

    tooltip.style.left = x + 18 + "px";
    tooltip.style.top = y - 42 + "px";
    tooltip.style.display = "block";

    previewPanel.textContent =
      `${person.nameFa} | ${person.nameEn} | ${person.locationFa} | ${person.locationEn} | سن ${person.age} | برای مشاهده کلیک کنید`;

    updateSideInfo(person);
  }

  function hideTooltip() {
    tooltip.style.display = "none";

    previewPanel.textContent =
      "موس را روی پرچم حرکت دهید — هر مربع نمایانگر یک جان از دست رفته است";
  }

  function openModal(index) {
    if (index < 0 || !people[index]) return;

    currentModalIndex = index;
    const person = people[index];

    modalNameFa.textContent = person.nameFa;
    modalNameEn.textContent = person.nameEn;

    modalLocation.textContent =
      `محل: ${person.locationFa} | ${person.locationEn}`;

    modalDetails.textContent =
      `شماره ${person.number} | تاریخ ${person.year} | سن ${person.age}`;

    const modalImage = document.getElementById("modalImage");

    if (person.image) {
      modalImage.innerHTML =
        `<img src="${person.image}" alt="${person.nameFa}" loading="lazy" decoding="async" />`;
      modalImage.classList.add("has-image");
    } else {
      modalImage.textContent = "تصویر";
      modalImage.classList.remove("has-image");
    }

    updateSideInfo(person);

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModalBox() {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }

  function goPrev() {
    let next = currentModalIndex - 1;
    if (next < 0) next = TOTAL - 1;
    openModal(next);
  }

  function goNext() {
    let next = currentModalIndex + 1;
    if (next >= TOTAL) next = 0;
    openModal(next);
  }

  canvas.addEventListener("mousemove", function (e) {
    updateGlow(e.clientX, e.clientY);

    const index = getIndexFromMouse(e.clientX, e.clientY);

    if (index !== hoverIndex) {
      previousHoverIndex = hoverIndex;
      hoverIndex = index;
      renderGrid();
    }

    if (index >= 0) {
      showTooltip(index, e.clientX, e.clientY);
    } else {
      hideTooltip();
    }
  });

  canvas.addEventListener("mouseleave", function () {
    previousHoverIndex = hoverIndex;
    hoverIndex = -1;

    hideTooltip();
    renderGrid();
  });

  canvas.addEventListener("click", function (e) {
    const index = getIndexFromMouse(e.clientX, e.clientY);

    if (index >= 0) {
      openModal(index);
    }
  });

  closeModal.addEventListener("click", closeModalBox);
  prevPerson.addEventListener("click", goPrev);
  nextPerson.addEventListener("click", goNext);

  modal.addEventListener("click", function (e) {
    if (e.target === modal) {
      closeModalBox();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (modal.style.display !== "flex") return;

    if (e.key === "Escape") closeModalBox();
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "ArrowRight") goNext();
  });

  window.addEventListener("load", function () {
    loadMemorialData();
  });

  window.addEventListener("resize", resizeCanvas);

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(flag);
  }

  // Initialize immediately if DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(() => {
        loadMemorialData();
        resizeCanvas();
      }, 50);
    });
  } else {
    // DOM already loaded
    loadMemorialData();
    resizeCanvas();
  }
})();
