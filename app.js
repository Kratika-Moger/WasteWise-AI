const STORAGE_KEY = "wastewise-demo-v1";
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const defaults = {
  points: 1280,
  co2: 4.7,
  plastics: 18,
  claimed: [],
  reports: [
    { location: "Mason & 4th", type: "Overflowing bin", status: "Resolved", when: "Yesterday" },
    { location: "Juniper Park", type: "Helpful local spot", status: "Shared", when: "3 days ago" }
  ]
};

let state = loadState();
let activeFilter = "all";
let activeScan = null;
let toastTimer;

const scanData = {
  battery: {
    type: "E-waste",
    eyebrow: "Household battery",
    status: "Hazardous",
    title: "Keep this one out of the bin.",
    sub: "Lithium and alkaline batteries can spark fires in sorting equipment. Give this little power cell a dedicated exit.",
    chips: ["Electronics", "Hazardous if crushed"],
    score: 98,
    impact: { points: 80, co2: 0.24, plastics: 0 },
    instructions: ["Tape the terminals with clear tape.", "Drop at an electronics retailer or household hazardous waste site.", "Do not put it in curbside recycling or trash."]
  },
  pizza: {
    type: "Paper",
    eyebrow: "Food-soiled paper",
    status: "Compostable",
    title: "Split the box, keep the good part.",
    sub: "Grease makes the bottom half compost-bound, while a clean lid can still travel with paper recycling.",
    chips: ["Paper", "Compostable"],
    score: 94,
    impact: { points: 55, co2: 0.18, plastics: 0 },
    instructions: ["Tear off the clean lid for paper recycling.", "Put the greasy base and food scraps in compost.", "Flatten what remains so it takes up less space."]
  },
  foam: {
    type: "Plastic",
    eyebrow: "Expanded polystyrene",
    status: "Non-Recyclable",
    title: "Not curbside — but not hopeless.",
    sub: "Foam takeout trays are light, bulky, and rarely accepted in household recycling. A special drop-off is the better route.",
    chips: ["Plastic foam", "Special drop-off"],
    score: 88,
    impact: { points: 65, co2: 0.31, plastics: 1 },
    instructions: ["Brush off food and let it dry.", "Keep foam loose; never bag it with recycling.", "Look for a local foam or plastics collection point."]
  },
  carton: {
    type: "Paper",
    eyebrow: "Paper carton",
    status: "Recyclable",
    title: "A good candidate for recycling.",
    sub: "This carton is designed to be recovered. Empty it, give it a quick rinse, and let your local system do the rest.",
    chips: ["Paperboard", "Low effort"],
    score: 91,
    impact: { points: 45, co2: 0.18, plastics: 0 },
    instructions: ["Empty and give the inside a quick rinse.", "Replace the cap if your local program asks for it.", "Place it loose in the recycling bin."]
  }
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored ? { ...defaults, ...stored } : structuredClone(defaults);
  } catch {
    return structuredClone(defaults);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[match]));
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.7 } });
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  $("span", toast).textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function updateImpact() {
  const points = Math.round(state.points);
  $("#impact-points").textContent = points.toLocaleString();
  $("#progress-text").textContent = `${points.toLocaleString()} / 2,000`;
  $("#points-to-go").textContent = `${Math.max(0, 2000 - points).toLocaleString()} pts to go`;
  $("#level-progress").style.width = `${Math.min(100, (points / 2000) * 100)}%`;
  $("#impact-co2").textContent = state.co2.toFixed(1);
  $("#impact-plastics").textContent = state.plastics;
  $$(".reward-card").forEach((card) => {
    const cost = Number(card.dataset.cost);
    const button = $(".redeem-button", card);
    const rewardKey = $(".reward-card strong", card)?.textContent;
    if (state.claimed.includes(rewardKey)) {
      card.classList.add("reward-locked");
      button.textContent = "Claimed";
      button.disabled = true;
    } else if (state.points < cost) {
      button.textContent = "Locked";
      button.disabled = true;
      card.classList.add("reward-locked");
    } else {
      button.textContent = "Redeem";
      button.disabled = false;
      card.classList.remove("reward-locked");
    }
  });
}

function renderAnalysis(key) {
  const item = scanData[key] || scanData.carton;
  activeScan = key;
  $("#analysis-result").innerHTML = `
    <article class="analysis-card">
      <div class="analysis-left">
        <span class="analysis-label">WasteWise read · ${item.eyebrow}</span>
        <h3>${item.title}</h3>
        <p>${item.sub}</p>
        <div class="analysis-details">
          <div><small>Waste type</small><strong>${item.type}</strong></div>
          <div><small>Sub-category</small><strong>${item.eyebrow}</strong></div>
          <div><small>Status</small><strong class="status-${item.status.toLowerCase().replace(/[^a-z]+/g, "-")}">${item.status}</strong></div>
        </div>
        <div class="analysis-meta">${item.chips.map((chip) => `<span class="analysis-chip">${chip}</span>`).join("")}</div>
      </div>
      <div class="analysis-right">
        <div class="analysis-right-title">Your next three moves</div>
        <div class="instruction-list">${item.instructions.map((instruction) => `<div class="instruction"><i data-lucide="check"></i><span>${instruction}</span></div>`).join("")}</div>
      </div>
      <div class="analysis-bottom">
        <div class="score-inline"><span class="score-ring">${item.score}</span><span><small>confidence score</small><small>${item.impact.points} points · +${item.impact.co2.toFixed(2)} kg CO₂</small></span></div>
        <button class="button button-lime" id="add-to-impact" type="button">Add to my impact <i data-lucide="plus"></i></button>
      </div>
    </article>`;
  refreshIcons();
  $("#add-to-impact").addEventListener("click", () => addScanToImpact(item));
  $("#analysis-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function addScanToImpact(item) {
  if (!item || activeScan === `${activeScan}-added`) return;
  state.points += item.impact.points;
  state.co2 += item.impact.co2;
  state.plastics += item.impact.plastics;
  saveState();
  updateImpact();
  const button = $("#add-to-impact");
  if (button) {
    button.innerHTML = '<i data-lucide="check"></i> Added to my impact';
    button.disabled = true;
    button.classList.add("added");
    refreshIcons();
  }
  activeScan = `${activeScan}-added`;
  showToast(`+${item.impact.points} points added to your trail`);
}

function runScan(key = "carton", label = "photo") {
  const progress = $("#upload-progress");
  const panel = $("#drop-zone");
  progress.classList.add("active", "loading");
  panel.classList.add("scanning");
  $(".upload-title", panel).textContent = `Reading ${label}…`;
  $(".upload-panel p", panel).style.visibility = "hidden";
  setTimeout(() => {
    progress.classList.remove("active", "loading");
    panel.classList.remove("scanning");
    $(".upload-title", panel).textContent = "Drop a photo here";
    $(".upload-panel p", panel).style.visibility = "visible";
    renderAnalysis(key);
    showToast("Your waste read is ready");
  }, 1050);
}

function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Please choose an image file");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast("That photo is over 10 MB");
    return;
  }
  runScan("carton", file.name.replace(/\.[^/.]+$/, "").slice(0, 23) || "photo");
}

function renderReports() {
  const list = $("#report-list");
  if (!state.reports.length) {
    list.innerHTML = '<div class="report-empty">No signals here yet. Your first note can be useful.</div>';
  } else {
    list.innerHTML = state.reports.slice(0, 4).map((report) => `
      <div class="report-list-row">
        <span class="report-status-dot"></span>
        <span><strong>${escapeHtml(report.location)}</strong><small>${escapeHtml(report.type)} · ${escapeHtml(report.status)}</small></span>
        <time>${escapeHtml(report.when)}</time>
      </div>`).join("");
  }
  refreshIcons();
}

function setupNavigation() {
  const menu = $("#menu-toggle");
  const mobileNav = $("#mobile-nav");
  menu.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("is-open");
    menu.setAttribute("aria-expanded", String(open));
    menu.innerHTML = `<i data-lucide="${open ? "x" : "menu"}"></i>`;
    refreshIcons();
  });
  $$("#mobile-nav a").forEach((link) => link.addEventListener("click", () => {
    mobileNav.classList.remove("is-open");
    menu.setAttribute("aria-expanded", "false");
    menu.innerHTML = '<i data-lucide="menu"></i>';
    refreshIcons();
  }));
  $("#open-profile").addEventListener("click", () => showToast("Maya’s field notes are saved on this device"));
}

function setupScan() {
  const fileInput = $("#waste-file");
  const dropZone = $("#drop-zone");
  $("#choose-file").addEventListener("click", (event) => {
    event.stopPropagation();
    fileInput.click();
  });
  dropZone.addEventListener("click", (event) => {
    if (!event.target.closest("button")) fileInput.click();
  });
  dropZone.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && document.activeElement === dropZone) fileInput.click();
  });
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((type) => dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach((type) => dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  }));
  dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));
  $$(".preset-card").forEach((button) => button.addEventListener("click", () => runScan(button.dataset.preset, button.querySelector("strong").textContent)));
}

function setupGuide() {
  const search = $("#guide-search");
  const rows = $$(".guide-row");
  const empty = $("#empty-guide");
  const filterRows = () => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    rows.forEach((row) => {
      const matchesText = row.dataset.name.includes(query);
      const matchesFilter = activeFilter === "all" || row.dataset.category === activeFilter;
      const show = matchesText && matchesFilter;
      row.hidden = !show;
      if (show) visible += 1;
    });
    empty.classList.toggle("show", visible === 0);
  };
  search.addEventListener("input", filterRows);
  $$(".filter-chip").forEach((chip) => chip.addEventListener("click", () => {
    activeFilter = chip.dataset.filter;
    $$(".filter-chip").forEach((item) => item.classList.toggle("active", item === chip));
    filterRows();
  }));
  rows.forEach((row) => row.addEventListener("click", () => {
    const key = row.dataset.guide;
    if (scanData[key]) {
      document.querySelector("#scan").scrollIntoView({ behavior: "smooth" });
      setTimeout(() => runScan(key, row.querySelector(".guide-item strong").textContent), 480);
    }
  }));
  $("#show-all-guide").addEventListener("click", () => {
    search.value = "";
    activeFilter = "all";
    $$(".filter-chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.filter === "all"));
    filterRows();
    showToast("Showing the complete starter edition");
  });
}

function setupRewards() {
  $$(".redeem-button").forEach((button) => button.addEventListener("click", () => {
    const card = button.closest(".reward-card");
    const cost = Number(card.dataset.cost);
    const name = $(".reward-card strong", card).textContent;
    if (state.points < cost || state.claimed.includes(name)) return;
    state.points -= cost;
    state.claimed.push(name);
    saveState();
    updateImpact();
    showToast(`${name} added to your rewards`);
  }));
}

function setupReport() {
  const reportInput = $("#report-file");
  const photoDrop = $("#report-photo-drop");
  photoDrop.addEventListener("click", () => reportInput.click());
  photoDrop.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") reportInput.click();
  });
  reportInput.addEventListener("change", () => {
    const file = reportInput.files[0];
    if (!file) return;
    $("#report-photo-label").textContent = file.name.slice(0, 28);
    showToast("Photo attached to your signal");
  });
  $("#report-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const location = $("#report-location").value.trim();
    if (!location) {
      $("#report-status").textContent = "Add a location first";
      $("#report-location").focus();
      return;
    }
    const type = $("#report-type");
    const report = { location, type: type.options[type.selectedIndex].text, status: "Reviewing", when: "Just now" };
    state.reports.unshift(report);
    saveState();
    renderReports();
    event.target.reset();
    $("#report-photo-label").textContent = "Add a photo";
    $("#report-status").textContent = "Signal placed";
    showToast("Thanks — your signal is on the neighborhood map");
    setTimeout(() => { $("#report-status").textContent = ""; }, 3500);
  });
  $("#clear-reports").addEventListener("click", () => {
    state.reports = [];
    saveState();
    renderReports();
    showToast("Recent signals cleared from this device");
  });
}

function setupReset() {
  $("#reset-data").addEventListener("click", () => {
    if (!window.confirm("Reset your local demo points, rewards, and signals?")) return;
    state = structuredClone(defaults);
    saveState();
    updateImpact();
    renderReports();
    $("#analysis-result").innerHTML = "";
    showToast("Demo data reset");
  });
}

function setupReveals() {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });
  $$(".reveal").forEach((element) => revealObserver.observe(element));
}

function init() {
  updateImpact();
  renderReports();
  setupNavigation();
  setupScan();
  setupGuide();
  setupRewards();
  setupReport();
  setupReset();
  setupReveals();
  refreshIcons();
}

document.addEventListener("DOMContentLoaded", init);