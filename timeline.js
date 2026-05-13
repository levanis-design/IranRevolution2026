const header = document.querySelector("header");
const menuToggle = document.getElementById("menu-toggle");
const navControls = document.getElementById("nav-controls");
const languageSelect = document.getElementById("language-select");
const listViewLink = document.getElementById("list-view-btn");

const ESTIMATED_EXECUTED = 40000;
const UNCONFIRMED_COUNT = 35000;

let recordedCount = 0;
let confirmedCount = 0;

if (header) {
  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 50);
  });
}

if (menuToggle && navControls) {
  menuToggle.addEventListener("click", () => {
    const isOpen = navControls.classList.toggle("active");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navControls.querySelectorAll("a, button").forEach((element) => {
    element.addEventListener("click", () => {
      navControls.classList.remove("active");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

if (listViewLink) {
  listViewLink.addEventListener("click", (event) => {
    const target = document.getElementById("map-memorial");
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

if (languageSelect) {
  languageSelect.addEventListener("change", () => {
    const isPersian = languageSelect.value === "fa";
    document.documentElement.lang = isPersian ? "fa" : "en";
    document.documentElement.dir = isPersian ? "rtl" : "ltr";
  });
}

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function onAnchorClick(event) {
    const href = this.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

function animateNumber(element, target) {
  if (!element) return;

  const duration = 1800;
  const startTime = performance.now();

  function update(currentTime) {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(target * eased);

    element.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = target.toLocaleString();
    }
  }

  requestAnimationFrame(update);
}

function normalizePerson(item) {
  return {
    verified: item.verified === true,
    bioEn: item.bio || "",
    bioFa: item.bio_fa || ""
  };
}

function isConfirmedExecuted(person) {
  const text = `${person.bioEn} ${person.bioFa}`.toLowerCase();
  return (
    person.verified &&
    (
      text.includes("executed") ||
      text.includes("execution") ||
      text.includes("اعدام") ||
      text.includes("killed")
    )
  );
}

async function loadStats() {
  try {
    const response = await fetch("./memorials.json");
    if (!response.ok) {
      throw new Error(`Could not load memorials.json: HTTP ${response.status}`);
    }

    const data = await response.json();
    const entries = (Array.isArray(data) ? data : data.memorials || []).map(normalizePerson);
    recordedCount = entries.length;
    confirmedCount = entries.filter(isConfirmedExecuted).length;
  } catch (error) {
    console.error("Failed to load timeline stats.", error);
  }

  animateNumber(document.getElementById("countEstimated"), ESTIMATED_EXECUTED);
  animateNumber(document.getElementById("countRecorded"), recordedCount);
  animateNumber(document.getElementById("countConfirmed"), confirmedCount);
  animateNumber(document.getElementById("countUnconfirmed"), UNCONFIRMED_COUNT);
}

function createParticles() {
  const container = document.getElementById("particles");
  if (!container) return;

  const particleCount = 20;

  for (let i = 0; i < particleCount; i += 1) {
    const particle = document.createElement("div");
    particle.className = "particle";
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.animationDuration = `${Math.random() * 15 + 10}s`;
    particle.style.animationDelay = `${Math.random() * 10}s`;
    particle.style.width = `${Math.random() * 2 + 1}px`;
    particle.style.height = particle.style.width;
    container.appendChild(particle);
  }
}

function observeAnimatedElements() {
  const revealThreshold = () => window.innerHeight * 0.85;
  const stagedReveal = () => {
    document.querySelectorAll(".timeline-item").forEach((element, index) => {
      window.setTimeout(() => {
        element.classList.add("visible");
      }, 120 * index);
    });
  };

  const revealVisibleItems = () => {
    document.querySelectorAll(".timeline-item").forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top <= revealThreshold()) {
        element.classList.add("visible");
      }
    });
  };

  window.addEventListener("scroll", revealVisibleItems, { passive: true });
  window.addEventListener("resize", revealVisibleItems);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        if (entry.target.classList.contains("timeline-item")) {
          entry.target.classList.add("visible");
        }
        if (entry.target.classList.contains("fade-in")) {
          entry.target.classList.add("in-view");
        }
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
  });

  document.querySelectorAll(".fade-in, .timeline-item").forEach((element) => {
    observer.observe(element);
  });

  requestAnimationFrame(revealVisibleItems);
  window.setTimeout(revealVisibleItems, 250);
  window.setTimeout(stagedReveal, 350);
}

createParticles();
observeAnimatedElements();
loadStats();
