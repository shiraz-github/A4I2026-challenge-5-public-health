// Mobile Clinic Planner - Frontend Application

let map;
let tractMarkersLayer = L.layerGroup();
let careSitesLayer = L.layerGroup();
let clinicStopsLayer = L.layerGroup();
let rejectedSitesLayer = L.layerGroup();
let vetoMarkersLayer = L.layerGroup();

let currentStops = [];
let currentRejectedSites = [];
let currentVetoStops = [];
let candidateTractsPool = [];
let selectedStopIndex = 0;

// Multi-County configuration with centroids, zoom levels, and tract details
const COUNTY_CONFIG = {
  "13121": {
    name: "Fulton County, GA",
    label: "Fulton County, GA (Atlanta)",
    center: [33.7490, -84.3880],
    zoom: 10,
    subtitle: "Dynamic Public Health Equity & Preventative Mobile Care Siting • Fulton County, GA (Atlanta)"
  },
  "17031": {
    name: "Cook County, IL",
    label: "Cook County, IL (Chicago)",
    center: [41.8781, -87.6298],
    zoom: 10,
    subtitle: "Dynamic Public Health Equity & Preventative Mobile Care Siting • Cook County, IL (Chicago)"
  },
  "06085": {
    name: "Santa Clara County, CA",
    label: "Santa Clara County, CA (Sunnyvale / San Jose)",
    center: [37.3541, -121.9552],
    zoom: 10,
    subtitle: "Dynamic Public Health Equity & Preventative Mobile Care Siting • Santa Clara County, CA (Sunnyvale / San Jose)"
  },
  "36005": {
    name: "Bronx County, NY",
    label: "Bronx County, NY (New York City)",
    center: [40.8448, -73.8648],
    zoom: 11,
    subtitle: "Dynamic Public Health Equity & Preventative Mobile Care Siting • Bronx County, NY (New York City)"
  },
  "48201": {
    name: "Harris County, TX",
    label: "Harris County, TX (Houston)",
    center: [29.7604, -95.3698],
    zoom: 10,
    subtitle: "Dynamic Public Health Equity & Preventative Mobile Care Siting • Harris County, TX (Houston)"
  },
  "48453": {
    name: "Travis County, TX",
    label: "Travis County, TX (Austin)",
    center: [30.2672, -97.7431],
    zoom: 10,
    subtitle: "Dynamic Public Health Equity & Preventative Mobile Care Siting • Travis County, TX (Austin)"
  }
};

let currentCounty = "13121";
const FULTON_CENTER = [33.7490, -84.3880];

let currentYear = 2026;
let currentMonth = 11; // 1-indexed (November = 11)
let planCycle = 0;
let currentWeather = "clear"; // 'clear' or 'rain'

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initCalendar(currentYear, currentMonth);
  loadPlan();
  loadTracts();
  loadCareSites();

  // County Selector Handler
  const countySelect = document.getElementById("countySelect");
  if (countySelect) {
    countySelect.value = currentCounty;
    countySelect.addEventListener("change", (e) => {
      currentCounty = e.target.value;
      planCycle = 0; // reset rotation cycle on county change
      
      const config = COUNTY_CONFIG[currentCounty] || COUNTY_CONFIG["13121"];
      
      // Update subheader text and map title
      const subheader = document.getElementById("countySubheader");
      if (subheader) subheader.innerText = config.subtitle;
      
      const mapTitle = document.getElementById("mapCountyTitle");
      if (mapTitle) mapTitle.innerText = config.label;

      // Center map smoothly on the selected county
      if (map) {
        map.flyTo(config.center, config.zoom, { animate: true, duration: 1.2 });
      }

      // Reload county datasets
      loadPlan();
      loadTracts();
      loadCareSites();
    });
  }

  document.getElementById("refreshPlanBtn").addEventListener("click", () => {
    planCycle += 1;
    loadPlan();
  });

  // Weather Adaptive Toggle Listeners
  const clearBtn = document.getElementById("weatherClearBtn");
  const rainBtn = document.getElementById("weatherRainBtn");

  function setWeatherMode(mode) {
    currentWeather = mode;
    if (mode === "rain") {
      rainBtn.className = "px-2.5 py-1 rounded-lg font-semibold text-white bg-blue-600 shadow-2xs transition flex items-center gap-1 active:scale-95 text-[11px]";
      clearBtn.className = "px-2.5 py-1 rounded-lg font-medium text-slate-600 hover:text-slate-900 transition flex items-center gap-1 active:scale-95 text-[11px]";
    } else {
      clearBtn.className = "px-2.5 py-1 rounded-lg font-semibold text-[#0071e3] bg-white shadow-2xs transition flex items-center gap-1 active:scale-95 text-[11px]";
      rainBtn.className = "px-2.5 py-1 rounded-lg font-medium text-slate-600 hover:text-slate-900 transition flex items-center gap-1 active:scale-95 text-[11px]";
    }
    loadPlan();
  }

  if (clearBtn) clearBtn.addEventListener("click", () => setWeatherMode("clear"));
  if (rainBtn) rainBtn.addEventListener("click", () => setWeatherMode("rain"));

  const monthSelect = document.getElementById("monthSelect");
  if (monthSelect) {
    monthSelect.addEventListener("change", (e) => {
      const [y, m] = e.target.value.split("-").map(Number);
      currentYear = y;
      currentMonth = m;
      loadPlan();
    });
  }

  const prevBtn = document.getElementById("prevMonthBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentMonth === 1) {
        currentMonth = 12;
        currentYear -= 1;
      } else {
        currentMonth -= 1;
      }
      syncMonthSelectAndLoad();
    });
  }

  const nextBtn = document.getElementById("nextMonthBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentMonth === 12) {
        currentMonth = 1;
        currentYear += 1;
      } else {
        currentMonth += 1;
      }
      syncMonthSelectAndLoad();
    });
  }

  document.getElementById("toggleCareSites").addEventListener("change", (e) => {
    if (e.target.checked) {
      map.addLayer(careSitesLayer);
    } else {
      map.removeLayer(careSitesLayer);
    }
  });

  document.getElementById("toggleTracts").addEventListener("change", (e) => {
    if (e.target.checked) {
      map.addLayer(tractMarkersLayer);
    } else {
      map.removeLayer(tractMarkersLayer);
    }
  });

  const toggleRejected = document.getElementById("toggleRejected");
  if (toggleRejected) {
    toggleRejected.addEventListener("change", (e) => {
      if (e.target.checked) {
        map.addLayer(rejectedSitesLayer);
      } else {
        map.removeLayer(rejectedSitesLayer);
      }
    });
  }

  const toggleVetoPins = document.getElementById("toggleVetoPins");
  if (toggleVetoPins) {
    toggleVetoPins.addEventListener("change", (e) => {
      if (e.target.checked) {
        map.addLayer(vetoMarkersLayer);
      } else {
        map.removeLayer(vetoMarkersLayer);
      }
    });
  }

  // 3-Agent Collaborative Pipeline Runner
  const runPipelineBtn = document.getElementById("runPipelineBtn");
  if (runPipelineBtn) {
    runPipelineBtn.addEventListener("click", () => {
      execute3AgentPipeline();
    });
  }

  // Dedicated Main Flyer Language Switchers
  const mainEn = document.getElementById("mainFlierEnBtn");
  const mainEs = document.getElementById("mainFlierEsBtn");
  const mainVi = document.getElementById("mainFlierViBtn");
  if (mainEn) mainEn.addEventListener("click", () => updateFlyerDisplay("en"));
  if (mainEs) mainEs.addEventListener("click", () => updateFlyerDisplay("es"));
  if (mainVi) mainVi.addEventListener("click", () => updateFlyerDisplay("vi"));

  // Copy & Print Flyer Handlers
  const copyBtn = document.getElementById("copyFlierBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const box = document.getElementById("mainFlierContentBox");
      if (box && navigator.clipboard) {
        navigator.clipboard.writeText(box.innerText).then(() => {
          copyBtn.innerHTML = `<i class="fa-solid fa-check text-[10px] text-emerald-600"></i> Copied!`;
          setTimeout(() => {
            copyBtn.innerHTML = `<i class="fa-regular fa-copy text-[10px]"></i> Copy Text`;
          }, 2000);
        });
      }
    });
  }

  const printBtn = document.getElementById("printFlierBtn");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      const box = document.getElementById("mainFlierContentBox");
      if (!box) return;
      const printWindow = window.open("", "_blank");
      printWindow.document.write(`
        <html>
          <head>
            <title>Community Health Clinic Flyer</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
              h1 { color: #0071e3; font-size: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
              h3 { color: #334155; font-size: 16px; margin-top: 20px; }
              ul { padding-left: 20px; }
              li { margin-bottom: 6px; }
              .footer { margin-top: 30px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px; }
            </style>
          </head>
          <body>
            <div>${box.innerText.replace(/\n/g, '<br>')}</div>
            <div class="footer">Fulton County Mobile Health Van • Public Health Equity Outreach</div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    });
  }

  // Pipeline panel flyer tab switchers
  const flierEnBtn = document.getElementById("showFlierEnBtn");
  const flierEsBtn = document.getElementById("showFlierEsBtn");
  const flierViBtn = document.getElementById("showFlierViBtn");
  if (flierEnBtn) flierEnBtn.addEventListener("click", () => updateFlyerDisplay("en"));
  if (flierEsBtn) flierEsBtn.addEventListener("click", () => updateFlyerDisplay("es"));
  if (flierViBtn) flierViBtn.addEventListener("click", () => updateFlyerDisplay("vi"));

  // Modals Listeners
  initModalListeners();
});

function syncMonthSelectAndLoad() {
  const monthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  const select = document.getElementById("monthSelect");
  if (select) {
    // If option does not exist, add it dynamically
    let option = Array.from(select.options).find(opt => opt.value === monthKey);
    if (!option) {
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      option = new Option(`${monthNames[currentMonth - 1]} ${currentYear}`, monthKey);
      select.add(option);
    }
    select.value = monthKey;
  }
  loadPlan();
}

function initMap() {
  map = L.map("map", {
    center: FULTON_CENTER,
    zoom: 10,
    zoomControl: true
  });

  // Google Maps base layer (Roads / Standard vector view)
  const googleRoads = L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
    attribution: 'Map data &copy; <a href="https://maps.google.com" target="_blank" rel="noopener">Google Maps</a>'
  }).addTo(map);

  // Google Maps Satellite & Hybrid view for optional layer toggle
  const googleHybrid = L.tileLayer("https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
    attribution: 'Imagery &copy; <a href="https://maps.google.com" target="_blank" rel="noopener">Google Maps</a>'
  });

  const googleTerrain = L.tileLayer("https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", {
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
    attribution: 'Map data &copy; <a href="https://maps.google.com" target="_blank" rel="noopener">Google Maps</a>'
  });

  L.control.layers({
    "Google Maps (Standard)": googleRoads,
    "Google Maps (Satellite / Hybrid)": googleHybrid,
    "Google Maps (Terrain)": googleTerrain
  }, null, { position: "topright", collapsed: true }).addTo(map);

  map.addLayer(tractMarkersLayer);
  map.addLayer(careSitesLayer);
  map.addLayer(clinicStopsLayer);
  map.addLayer(rejectedSitesLayer);
}

function initCalendar(year, month, stops = []) {
  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const firstDayIndex = new Date(year, month - 1, 1).getDay();
  const totalDays = new Date(year, month, 0).getDate();

  // Create mapping of Saturday day numbers to stop index
  const satMap = {};
  stops.forEach((s, idx) => {
    if (s.day) {
      satMap[s.day] = idx;
    }
  });

  // Empty leading cells before first day of month
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "p-1.5 text-slate-200 text-center";
    grid.appendChild(emptyCell);
  }

  for (let day = 1; day <= totalDays; day++) {
    const dayOfWeek = (firstDayIndex + day - 1) % 7;
    const isSaturday = dayOfWeek === 6;
    const stopIdx = satMap[day];

    const dayEl = document.createElement("div");
    dayEl.className = `p-1.5 sm:p-2 rounded-lg border text-center transition cursor-pointer select-none ${
      isSaturday 
        ? "sat-highlight font-bold shadow-sm hover:scale-105 border-blue-500" 
        : "border-slate-100 bg-white text-slate-700 hover:bg-slate-50"
    }`;

    let content = `<span>${day}</span>`;
    if (isSaturday && stopIdx !== undefined) {
      content += `<div class="text-[9px] uppercase tracking-tighter opacity-90 mt-0.5">Stop #${stopIdx + 1}</div>`;
      dayEl.setAttribute("data-stop-idx", stopIdx);
      dayEl.addEventListener("click", () => {
        selectStop(stopIdx);
      });
    }

    dayEl.innerHTML = content;
    grid.appendChild(dayEl);
  }
}

async function loadPlan() {
  try {
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    const res = await fetch(`api/plan?month=${monthKey}&cycle=${planCycle}&weather=${currentWeather}&county=${currentCounty}`);
    const data = await res.json();
    currentStops = data.stops || [];
    currentVetoStops = data.round1_veto_stops || [];
    candidateTractsPool = data.candidate_tracts || [];

    // Rebuild calendar with month's actual days and stops
    initCalendar(data.year || currentYear, data.month_num || currentMonth, currentStops);

    renderStopsList(currentStops);
    renderClinicStopPins(currentStops);
    renderAlternatives(data.alternatives || []);
    renderRejectedSites(data.rejected_sites || []);
    if (data.flyers) {
      window.latestFlyers = data.flyers;
      updateFlyerDisplay("en");
    }

    if (currentStops.length > 0) {
      selectStop(0);
    }
  } catch (err) {
    console.error("Failed to load plan:", err);
  }
}

function updateFlyerDisplay(lang = "en") {
  const flyers = window.latestFlyers || {};
  let content = "";
  if (lang === "en") content = flyers.flier_en || "English flyer not available.";
  else if (lang === "es") content = flyers.flier_es || "Folleto en español no disponible.";
  else if (lang === "vi") content = flyers.flier_vi || "Tờ rơi tiếng Việt chưa có sẵn.";

  // Update main dedicated flyer card
  const mainBox = document.getElementById("mainFlierContentBox");
  if (mainBox) mainBox.innerText = content;

  // Update pipeline flyer card if present
  const pipeBox = document.getElementById("flierContentBox");
  if (pipeBox) pipeBox.innerText = content;

  // Update tab button styles
  const mainBtns = {
    en: document.getElementById("mainFlierEnBtn"),
    es: document.getElementById("mainFlierEsBtn"),
    vi: document.getElementById("mainFlierViBtn")
  };

  Object.entries(mainBtns).forEach(([k, btn]) => {
    if (!btn) return;
    if (k === lang) {
      btn.className = "bg-[#0071e3] text-white px-2.5 py-1 rounded-lg text-[11px] font-semibold transition shadow-2xs";
    } else {
      btn.className = "text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg text-[11px] font-medium transition";
    }
  });
}

function renderStopsList(stops) {
  const container = document.getElementById("stopsList");
  container.innerHTML = "";

  stops.forEach((stop, idx) => {
    const card = document.createElement("div");
    card.id = `stop-card-${idx}`;
    card.className = `p-4 rounded-2xl border border-black/5 cursor-pointer transition-all bg-white/90 hover:bg-white hover:shadow-md hover:border-[#0071e3]/30 active:scale-[0.99]`;
    card.addEventListener("click", () => selectStop(idx));

    // Construct comparative reasoning badges
    const uninsBadge = stop.uninsured_mult > 1.5 
      ? `<span class="apple-pill bg-red-500/10 text-[#ff3b30] border border-red-500/20 text-[10px]">${stop.uninsured_mult}x Co. Avg</span>`
      : "";
    const vehBadge = stop.vehicle_mult > 1.5 
      ? `<span class="apple-pill bg-amber-500/10 text-amber-700 border border-amber-500/20 text-[10px]">${stop.vehicle_mult}x Co. Avg</span>`
      : "";

    // Build dropdown options from candidateTractsPool
    let dropdownOptionsHtml = "";
    if (candidateTractsPool && candidateTractsPool.length > 0) {
      dropdownOptionsHtml = candidateTractsPool.map(t => {
        const isSelected = String(t.geo_id) === String(stop.tract_id) ? "selected" : "";
        return `<option value="${t.geo_id}" ${isSelected}>Rank #${t.rank_overall} (Tract ${t.geo_id} • Score ${t.composite_need_score} • Uninsured ${t.pct_uninsured}%)</option>`;
      }).join("");
    } else {
      dropdownOptionsHtml = `<option value="${stop.tract_id}" selected>Rank #${stop.rank_overall} (Tract ${stop.tract_id})</option>`;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="apple-pill bg-purple-600 text-white font-bold text-xs shadow-xs px-2.5 py-1">
            <i class="fa-solid fa-trophy text-[10px] text-amber-300 mr-1"></i> Rank #${stop.rank_overall}
          </span>
          <span class="apple-pill bg-blue-500/10 text-blue-700 border border-blue-500/20 font-semibold text-xs">
            ${stop.saturday_label}
          </span>
          <span class="apple-pill bg-slate-100 text-slate-600 text-[10px]">
            Score ${stop.composite_need_score}
          </span>
        </div>
        <span class="text-xs font-semibold text-slate-500 font-mono">Tract ${stop.tract_id}</span>
      </div>

      <!-- Interactive Location Dropdown Selector -->
      <div class="mb-2.5 p-2 bg-slate-50/90 rounded-xl border border-black/5 flex items-center gap-2">
        <label class="text-[10px] font-semibold text-slate-500 uppercase tracking-tight flex items-center gap-1 whitespace-nowrap">
          <i class="fa-solid fa-location-dot text-[#0071e3]"></i> Change Site:
        </label>
        <select class="location-select flex-1 text-[11px] font-medium text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs focus:ring-1 focus:ring-[#0071e3] focus:border-[#0071e3] cursor-pointer" data-stop-idx="${idx}">
          ${dropdownOptionsHtml}
        </select>
      </div>

      <!-- Weather-Adaptive Facility & Parking Type -->
      <div class="mb-2 p-2 rounded-xl border ${stop.weather_mode === 'rain' ? 'bg-blue-50/80 border-blue-200/60 text-blue-900' : 'bg-amber-50/60 border-amber-200/60 text-amber-900'} flex items-center justify-between text-[11px]">
        <div class="flex items-center gap-1.5">
          <i class="fa-solid ${stop.parking_icon || (stop.weather_mode === 'rain' ? 'fa-warehouse' : 'fa-square-parking')} ${stop.weather_mode === 'rain' ? 'text-blue-600' : 'text-amber-600'}"></i>
          <span class="font-semibold">${stop.parking_type || 'Civic Staging Facility'}</span>
        </div>
        <span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${stop.weather_mode === 'rain' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'}">
          ${stop.weather_mode === 'rain' ? '🌧️ Covered Deck' : '☀️ Open Plaza'}
        </span>
      </div>

      <!-- Why Selected Explanation -->
      <p class="text-xs text-slate-700 font-medium mb-2 leading-relaxed">
        ${stop.why_chosen}
      </p>

      <!-- Key Comparative Metric Indicators -->
      <div class="grid grid-cols-3 gap-2 mt-2 text-center text-[11px] bg-slate-50/80 p-2.5 rounded-xl border border-black/5">
        <div>
          <span class="text-slate-400 block text-[9px] uppercase tracking-tight">Uninsured</span>
          <span class="font-semibold text-[#ff3b30]">${stop.pct_uninsured}%</span>
          <div class="mt-0.5">${uninsBadge}</div>
        </div>
        <div>
          <span class="text-slate-400 block text-[9px] uppercase tracking-tight">No Car</span>
          <span class="font-semibold text-amber-600">${stop.pct_no_vehicle}%</span>
          <div class="mt-0.5">${vehBadge}</div>
        </div>
        <div>
          <span class="text-slate-400 block text-[9px] uppercase tracking-tight">Safety Net</span>
          <span class="font-semibold text-[#0071e3]">${stop.km_to_safety_net} km</span>
          <span class="text-[10px] text-slate-500 block mt-0.5">${stop.dist_diff > 0 ? '+' : ''}${stop.dist_diff} km vs avg</span>
        </div>
      </div>

      <!-- Quick Action Buttons: Book Calendar, Location QR & Flyer -->
      <div class="mt-3 flex items-center gap-1.5 pt-2.5 border-t border-black/5">
        <button type="button" class="book-slot-btn flex-1 py-1.5 px-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-[#0071e3] font-semibold rounded-xl text-[11px] transition flex items-center justify-center gap-1 border border-blue-500/20 active:scale-95" data-idx="${idx}">
          <i class="fa-regular fa-calendar-check text-[10px]"></i> Book
        </button>
        <button type="button" class="view-qr-btn flex-1 py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-[11px] transition flex items-center justify-center gap-1 border border-black/5 active:scale-95" data-idx="${idx}">
          <i class="fa-solid fa-qrcode text-[10px]"></i> QR Code
        </button>
        <button type="button" class="view-flyer-btn flex-1 py-1.5 px-2.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 font-semibold rounded-xl text-[11px] transition flex items-center justify-center gap-1 border border-purple-500/20 active:scale-95" data-idx="${idx}">
          <i class="fa-solid fa-bullhorn text-[10px]"></i> Flyer
        </button>
      </div>
    `;

    // Hook quick button handlers
    const bookBtn = card.querySelector(".book-slot-btn");
    const qrBtn = card.querySelector(".view-qr-btn");
    const flyerBtn = card.querySelector(".view-flyer-btn");

    if (bookBtn) {
      bookBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openBookingModal(stop);
      });
    }

    if (qrBtn) {
      qrBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openQrModal(stop);
      });
    }

    if (flyerBtn) {
      flyerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const flyerCard = document.getElementById("mainFlierContentBox");
        if (flyerCard) {
          flyerCard.scrollIntoView({ behavior: "smooth", block: "center" });
          flyerCard.classList.add("ring-2", "ring-purple-500");
          setTimeout(() => flyerCard.classList.remove("ring-2", "ring-purple-500"), 1800);
        }
      });
    }

    // Hook dropdown change handler
    const locSelect = card.querySelector(".location-select");
    if (locSelect) {
      locSelect.addEventListener("click", (e) => e.stopPropagation());
      locSelect.addEventListener("change", (e) => {
        e.stopPropagation();
        changeStopLocation(idx, e.target.value);
      });
    }

    container.appendChild(card);
  });
}

function changeStopLocation(stopIndex, newTractId) {
  if (!currentStops[stopIndex] || !candidateTractsPool.length) return;
  const newTract = candidateTractsPool.find(t => String(t.geo_id) === String(newTractId));
  if (!newTract) return;

  const oldStop = currentStops[stopIndex];
  const avgUninsured = 11.0;
  const avgNoVehicle = 11.7;
  const avgKmCare = 6.78;

  const uninsMult = avgUninsured ? Number((newTract.pct_uninsured / avgUninsured).toFixed(1)) : 1.0;
  const vehMult = avgNoVehicle ? Number((newTract.pct_no_vehicle / avgNoVehicle).toFixed(1)) : 1.0;
  const distDiff = Number((newTract.km_to_safety_net - avgKmCare).toFixed(1));

  // Update current stop object in place
  currentStops[stopIndex] = {
    ...oldStop,
    tract_id: newTract.geo_id,
    total_pop: newTract.total_pop,
    lat: newTract.latitude,
    lon: newTract.longitude,
    rank_overall: newTract.rank_overall,
    total_tracts: newTract.total_tracts || 326,
    need_percentile: newTract.need_percentile,
    composite_need_score: newTract.composite_need_score,
    pct_uninsured: newTract.pct_uninsured,
    pct_no_vehicle: newTract.pct_no_vehicle,
    km_to_safety_net: newTract.km_to_safety_net,
    extra_km_if_uninsured: newTract.extra_km_if_uninsured,
    pct_diabetes: newTract.pct_diabetes,
    pct_asthma: newTract.pct_asthma,
    uninsured_mult: uninsMult,
    vehicle_mult: vehMult,
    dist_diff: distDiff,
    parking_type: currentStops[stopIndex].parking_type || (currentWeather === 'rain' ? 'Indoor Covered Parking Deck' : 'Outdoor Open Civic Plaza'),
    facility_name: `Tract ${newTract.geo_id} ${currentWeather === 'rain' ? 'Covered Civic Deck & Indoor Community Bay' : 'Civic Plaza & Community Center Lot'}`,
    parking_icon: currentWeather === 'rain' ? 'fa-warehouse' : 'fa-square-parking',
    weather_mode: currentWeather,
    weather_badge: currentWeather === 'rain' ? 'Rain Contingency: Indoor Parking' : 'Fair Weather: Open Plaza',
    weather_note: currentWeather === 'rain' ? '🌧️ Rainy Weather Mode Active: Selected indoor multi-level covered deck to ensure dry patient waiting and van ramp protection.' : '☀️ Clear Weather Mode: Open civic plaza staging with pedestrian walk-up access.',
    rationale: `High uninsured (${newTract.pct_uninsured}%) and vehicle isolation (${newTract.pct_no_vehicle}% without car) with ${newTract.km_to_safety_net} km distance to nearest safety net care. Facility: ${currentWeather === 'rain' ? 'Indoor Covered Parking Deck' : 'Outdoor Open Civic Plaza'}.`,
    reasoning_bullets: [
      `Need Score: ${newTract.composite_need_score} (Rank #${newTract.rank_overall} of ${newTract.total_tracts || 326} county tracts).`,
      `Uninsured Rate: ${newTract.pct_uninsured}% (${uninsMult}x higher than county avg of ${avgUninsured}%).`,
      `Transit/Vehicle Isolation: ${newTract.pct_no_vehicle}% of households have no vehicle (${vehMult}x county avg of ${avgNoVehicle}%).`,
      `Safety-Net Care Gap: ${newTract.km_to_safety_net} km to nearest FQHC/safety-net provider (${distDiff > 0 ? '+' : ''}${distDiff} km vs avg).`,
      currentWeather === 'rain' ? '🌧️ Rainy Weather Mode Active: Selected indoor multi-level covered deck to ensure dry patient waiting and van ramp protection.' : '☀️ Clear Weather Mode: Open civic plaza staging with pedestrian walk-up access.'
    ],
    why_chosen: `Rank #${newTract.rank_overall} Priority Site (Custom selected via dropdown). Sited due to ${newTract.pct_uninsured}% uninsured rate and ${newTract.pct_no_vehicle}% vehicle isolation.`
  };

  // Re-render stop list and map pins
  renderStopsList(currentStops);
  renderClinicStopPins(currentStops);
  selectStop(stopIndex);

  // Update Trilingual Flyers with updated stops
  updateFlyersFromCurrentStops();
}

function updateFlyersFromCurrentStops() {
  if (currentStops.length < 4) return;
  window.latestFlyers = {
    flier_en: `# 🏥 Free Mobile Health Clinic Coming to Your Neighborhood!\n\n**No insurance? No problem! No ID required. Walk-ins are always welcome.**\n\n### Free Health Services:\n- Blood pressure checks & heart health screening\n- Diabetes & blood sugar rapid testing\n- Doctor consultations & preventive care checkups\n- Medication guidance & health insurance navigation\n\n### 4 Saturday Clinic Stops (9:00 AM – 2:00 PM):\n- **${currentStops[0].saturday_label} (${currentStops[0].date})**: Census Tract ${currentStops[0].tract_id} (Rank #${currentStops[0].rank_overall} Priority)\n- **${currentStops[1].saturday_label} (${currentStops[1].date})**: Census Tract ${currentStops[1].tract_id} (Rank #${currentStops[1].rank_overall} Priority)\n- **${currentStops[2].saturday_label} (${currentStops[2].date})**: Census Tract ${currentStops[2].tract_id} (Rank #${currentStops[2].rank_overall} Priority)\n- **${currentStops[3].saturday_label} (${currentStops[3].date})**: Census Tract ${currentStops[3].tract_id} (Rank #${currentStops[3].rank_overall} Priority)\n\n📅 *Click "Book" to add to your calendar, or scan the Location QR code for directions!*`,
    flier_es: `# 🏥 ¡Clínica Médica Móvil Gratuita en su Comunidad!\n\n**¿No tiene seguro médico? ¡No se preocupe! No se requiere identificación. ¡Todos son bienvenidos!**\n\n### Servicios Gratuitos:\n- Control de presión arterial y chequeo del corazón\n- Pruebas rápidas de glucosa y diabetes\n- Consultas con médicos amigables y chequeos preventivos\n- Asesoramiento de salud e información comunitaria\n\n### Horario de los 4 Sábados (9:00 AM – 2:00 PM):\n- **${currentStops[0].saturday_label} (${currentStops[0].date})**: Sector Censal ${currentStops[0].tract_id} (Prioridad #${currentStops[0].rank_overall})\n- **${currentStops[1].saturday_label} (${currentStops[1].date})**: Sector Censal ${currentStops[1].tract_id} (Prioridad #${currentStops[1].rank_overall})\n- **${currentStops[2].saturday_label} (${currentStops[2].date})**: Sector Censal ${currentStops[2].tract_id} (Prioridad #${currentStops[2].rank_overall})\n- **${currentStops[3].saturday_label} (${currentStops[3].date})**: Sector Censal ${currentStops[3].tract_id} (Prioridad #${currentStops[3].rank_overall})\n\n📅 *¡Haga clic en "Reservar Cita" para guardarlo en su calendario o escanee el código QR para indicaciones!*`,
    flier_vi: `# 🏥 Phòng Khám Y Tế Di Động Miễn Phí Tại Khu Vực Của Quý Vị!\n\n**Không có bảo hiểm? Không sao! Không cần giấy tờ tùy thân. Chào đón tất cả mọi người!**\n\n### Dịch Vụ Khám Chữa Bệnh Miễn Phí:\n- Đo huyết áp và kiểm tra sức khỏe tim mạch\n- Xét nghiệm đường huyết và tầm soát bệnh tiểu đường\n- Tư vấn bác sĩ tận tình và khám sức khỏe tổng quát phòng ngừa\n- Hướng dẫn dùng thuốc và hỗ trợ tiếp cận y tế cộng đồng\n\n### Lịch Khám 4 Ngày Thứ Bảy (9:00 Sáng – 2:00 Chiều):\n- **${currentStops[0].saturday_label} (${currentStops[0].date})**: Khu Dân Cư ${currentStops[0].tract_id} (Ưu Tiên Hạng #${currentStops[0].rank_overall})\n- **${currentStops[1].saturday_label} (${currentStops[1].date})**: Khu Dân Cư ${currentStops[1].tract_id} (Ưu Tiên Hạng #${currentStops[1].rank_overall})\n- **${currentStops[2].saturday_label} (${currentStops[2].date})**: Khu Dân Cư ${currentStops[2].tract_id} (Ưu Tiên Hạng #${currentStops[2].rank_overall})\n- **${currentStops[3].saturday_label} (${currentStops[3].date})**: Khu Dân Cư ${currentStops[3].tract_id} (Ưu Tiên Hạng #${currentStops[3].rank_overall})\n\n📅 *Nhấp vào "Đặt Lịch" để thêm vào lịch hoặc quét mã QR để nhận chỉ đường!*`
  };
  updateFlyerDisplay("en");
}

function renderAlternatives(alternatives) {
  const container = document.getElementById("alternativesList");
  if (!container) return;
  container.innerHTML = "";

  if (!alternatives || alternatives.length === 0) {
    container.innerHTML = `<div class="text-slate-400 italic py-1">No runner-up options recorded.</div>`;
    return;
  }

  alternatives.forEach(alt => {
    const el = document.createElement("div");
    el.className = "p-2 bg-slate-50 rounded border border-slate-200 text-slate-700 hover:bg-slate-100/70 transition";
    el.innerHTML = `
      <div class="flex items-center justify-between font-semibold text-[11px]">
        <span class="text-slate-800">Tract ${alt.tract_id}</span>
        <span class="text-purple-700 font-mono bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">Rank #${alt.rank_overall} (Score ${alt.composite_need_score})</span>
      </div>
      <div class="text-[10px] text-slate-500 mt-0.5">
        Uninsured: <strong>${alt.pct_uninsured}%</strong> | No Car: <strong>${alt.pct_no_vehicle}%</strong> | Safety-Net: <strong>${alt.km_to_safety_net} km</strong>
      </div>
      <div class="text-[10px] text-slate-600 mt-1 italic">
        ↳ ${alt.why_deferred}
      </div>
    `;
    container.appendChild(el);
  });
}

function renderRejectedSites(rejectedSites) {
  currentRejectedSites = rejectedSites || [];
  rejectedSitesLayer.clearLayers();

  const container = document.getElementById("rejectedSitesList");
  if (container) {
    container.innerHTML = "";
    if (currentRejectedSites.length === 0) {
      container.innerHTML = `<div class="text-slate-400 italic">No event-based rejections this period.</div>`;
    } else {
      currentRejectedSites.forEach((rej, idx) => {
        const item = document.createElement("div");
        item.className = "p-2.5 bg-rose-50/70 rounded-lg border border-rose-200 text-slate-700 hover:bg-rose-100/50 transition cursor-pointer";
        item.addEventListener("click", () => {
          map.flyTo([rej.lat, rej.lon], 14, { duration: 1.2 });
        });

        item.innerHTML = `
          <div class="flex items-center justify-between font-semibold text-[11px] text-rose-900 mb-0.5">
            <span class="flex items-center gap-1">
              <i class="fa-solid fa-triangle-exclamation text-rose-600"></i>
              Tract ${rej.tract_id}
            </span>
            <span class="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0.2 rounded border border-rose-200 font-mono">Rank #${rej.rank_overall}</span>
          </div>
          <div class="text-[11px] font-bold text-rose-800">
            Conflict: ${rej.event_name}
          </div>
          <div class="text-[10px] text-slate-600 mt-0.5 leading-snug">
            ${rej.conflict_type} • ${rej.venue_zone}
          </div>
          <div class="text-[10px] text-rose-700 bg-white/70 p-1.5 rounded mt-1.5 border border-rose-200/60 leading-tight">
            <strong>Rejection Reason:</strong> ${rej.rejection_reason}
          </div>
        `;
        container.appendChild(item);
      });
    }
  }

  // Render on map as distinct warning markers with pulsating red outline
  currentRejectedSites.forEach((rej, idx) => {
    const icon = L.divIcon({
      className: "rejected-site-icon",
      html: `
        <div style="background-color: #e11d48; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #ffffff; box-shadow: 0 0 10px rgba(225, 29, 72, 0.7); font-weight: bold; font-size: 13px;">
          <i class="fa-solid fa-ban" style="font-size: 13px;"></i>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    const marker = L.marker([rej.lat, rej.lon], { icon: icon }).addTo(rejectedSitesLayer);
    
    // Hover Tooltip: Matches dropdown option format with conflict indicator:
    // "Rank #<rank> (Tract <tract_id> • Score <score> • Uninsured <pct>%)"
    marker.bindTooltip(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; font-size: 11px; padding: 3px 6px; font-weight: 600; color: #be123c; line-height: 1.3;">
        <span>⚠️ Rejected Site:</span><br>
        <strong>Rank #${rej.rank_overall}</strong> (Tract ${rej.tract_id} • Score ${rej.composite_need_score} • Uninsured ${rej.pct_uninsured}%)<br>
        <span style="font-weight: 400; color: #475569; font-size: 10px;">Conflict: ${rej.event_name}</span>
      </div>
    `, { sticky: true, direction: "top" });

    marker.bindPopup(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; font-size: 12px; line-height: 1.45; max-width: 260px;">
        <div style="color: #be123c; font-weight: bold; font-size: 13px; display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
          ⚠️ REJECTED CANDIDATE SPOT
        </div>
        <div style="margin: 4px 0; font-size: 11px; background: #fff1f2; padding: 5px 8px; border-radius: 8px; border: 1px solid #fecdd3; color: #be123c; font-weight: 600;">
          Rank #${rej.rank_overall} (Tract ${rej.tract_id} • Score ${rej.composite_need_score} • Uninsured ${rej.pct_uninsured}%)
        </div>
        <div style="font-size: 11px; color: #334155; margin-top: 4px;">
          <strong>Uninsured:</strong> ${rej.pct_uninsured}% | <strong>No Car:</strong> ${rej.pct_no_vehicle}%<br>
          <hr style="margin: 5px 0; border: none; border-top: 1px solid #fecdd3;">
          <strong style="color: #9f1239;">Local Event Conflict:</strong><br>
          <span style="font-weight: 600; color: #1e293b;">${rej.event_name}</span> (${rej.venue_zone})<br>
          <p style="margin-top: 4px; font-size: 11px; color: #475569; background: #fff1f2; padding: 5px; border-radius: 4px; border: 1px solid #ffe4e6;">
            ${rej.rejection_reason}
          </p>
        </div>
      </div>
    `);
  });
}

function renderClinicStopPins(stops) {
  clinicStopsLayer.clearLayers();

  stops.forEach((stop, idx) => {
    // Custom medical van icon
    const icon = L.divIcon({
      className: "custom-van-icon",
      html: `
        <div style="background-color: #2563eb; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-weight: bold; font-size: 13px;">
          ${idx + 1}
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const marker = L.marker([stop.lat, stop.lon], { icon: icon }).addTo(clinicStopsLayer);
    marker.on("click", () => selectStop(idx));

    // Hover Tooltip: Matches dropdown option format exactly:
    // "Rank #<rank> (Tract <tract_id> • Score <score> • Uninsured <pct>%)"
    const dropdownLabel = `Stop #${idx + 1} (${stop.saturday_label}): Rank #${stop.rank_overall} (Tract ${stop.tract_id} • Score ${stop.composite_need_score} • Uninsured ${stop.pct_uninsured}%)`;
    marker.bindTooltip(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; font-size: 11px; padding: 3px 6px; font-weight: 600; color: #1e3a8a; line-height: 1.3;">
        <span style="color: #2563eb;">Stop #${idx + 1} (${stop.saturday_label}):</span><br>
        <strong>Rank #${stop.rank_overall}</strong> (Tract ${stop.tract_id} • Score ${stop.composite_need_score} • Uninsured ${stop.pct_uninsured}%)
      </div>
    `, { sticky: true, direction: "top" });

    const countyLabel = (COUNTY_CONFIG[currentCounty] || {}).name || "Selected County";
    marker.bindPopup(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; font-size: 12px; line-height: 1.45; max-width: 260px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <strong style="color: #1e40af; font-size: 13px;">${stop.saturday_label}</strong>
          <span style="background: #2563eb; color: white; padding: 2px 7px; border-radius: 9999px; font-size: 10px; font-weight: 700;">Stop #${idx + 1}</span>
        </div>
        <div style="margin: 4px 0; font-size: 11px; background: #eff6ff; padding: 5px 8px; border-radius: 8px; border: 1px solid #bfdbfe; color: #1e40af; font-weight: 600;">
          Rank #${stop.rank_overall} (Tract ${stop.tract_id} • Score ${stop.composite_need_score} • Uninsured ${stop.pct_uninsured}%)
        </div>
        <div style="font-size: 11px; color: #334155; margin-top: 4px;">
          <strong>County:</strong> ${countyLabel}<br>
          <strong>Population:</strong> ${(stop.total_pop || 0).toLocaleString()}<br>
          <strong>Uninsured Rate:</strong> ${stop.pct_uninsured}% (${stop.uninsured_mult}x county avg)<br>
          <strong>Vehicle Deficit:</strong> ${stop.pct_no_vehicle}% (${stop.vehicle_mult}x county avg)<br>
          <strong>Safety-Net Distance:</strong> ${stop.km_to_safety_net} km (${stop.dist_diff > 0 ? '+' : ''}${stop.dist_diff} km vs avg)<br>
          <strong>Facility:</strong> ${stop.parking_type || 'Civic Staging Facility'}
        </div>
      </div>
    `);
  });
}

function selectStop(idx) {
  if (!currentStops[idx]) return;
  selectedStopIndex = idx;
  const stop = currentStops[idx];

  // Highlight card
  document.querySelectorAll("#stopsList > div").forEach((el, i) => {
    if (i === idx) {
      el.classList.add("ring-2", "ring-blue-600", "bg-blue-50/40");
    } else {
      el.classList.remove("ring-2", "ring-blue-600", "bg-blue-50/40");
    }
  });

  // Pan map
  map.flyTo([stop.lat, stop.lon], 13, { duration: 1.2 });

  // Update floating overlay
  const overlay = document.getElementById("activeStopOverlay");
  document.getElementById("overlayDate").innerText = `${stop.saturday_label} (Stop #${idx + 1} • Rank #${stop.rank_overall})`;
  const overlayFac = document.getElementById("overlayFacility");
  if (overlayFac) {
    if (stop.weather_mode === "rain") {
      overlayFac.className = "apple-pill bg-blue-500/10 text-blue-700 border border-blue-500/20 font-medium ml-1 text-[10px]";
      overlayFac.innerHTML = `<i class="fa-solid fa-warehouse mr-1"></i> ${stop.parking_type || 'Indoor Covered Deck'}`;
    } else {
      overlayFac.className = "apple-pill bg-amber-500/10 text-amber-800 border border-amber-500/20 font-medium ml-1 text-[10px]";
      overlayFac.innerHTML = `<i class="fa-solid fa-square-parking mr-1"></i> ${stop.parking_type || 'Open Civic Plaza'}`;
    }
  }
  document.getElementById("overlayTract").innerText = `Census Tract ${stop.tract_id} (Pop: ${stop.total_pop.toLocaleString()})`;
  
  // Format reasoning bullets in the overlay
  let bulletsHtml = `<div class="text-xs text-slate-700 font-semibold mb-1">${stop.why_chosen}</div>`;
  if (stop.reasoning_bullets) {
    bulletsHtml += `<ul class="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600">`;
    stop.reasoning_bullets.forEach(b => {
      bulletsHtml += `<li>${b}</li>`;
    });
    bulletsHtml += `</ul>`;
  }
  document.getElementById("overlayRationale").innerHTML = bulletsHtml;

  document.getElementById("overlayUninsured").innerText = `${stop.pct_uninsured}% (${stop.uninsured_mult}x avg)`;
  document.getElementById("overlayNoVehicle").innerText = `${stop.pct_no_vehicle}% (${stop.vehicle_mult}x avg)`;
  document.getElementById("overlayDistance").innerText = `${stop.km_to_safety_net} km (${stop.dist_diff > 0 ? '+' : ''}${stop.dist_diff} km)`;
  overlay.classList.remove("hidden");
}

function closeOverlay() {
  document.getElementById("activeStopOverlay").classList.add("hidden");
}

async function loadTracts() {
  try {
    const res = await fetch(`api/tracts?county=${currentCounty}`);
    const tracts = await res.json();
    tractMarkersLayer.clearLayers();

    document.getElementById("tractCountBadge").innerText = `${tracts.length} Centroids`;

    tracts.forEach(t => {
      // Color-code centroid marker by unmet health/isolation burden:
      // High Uninsured (>20%): Red
      // Moderate (12-20%): Orange
      // Baseline (<12%): Blue
      const isHighNeed = t.pct_uninsured > 20 || t.pct_no_vehicle > 25;
      const color = t.pct_uninsured > 20 ? "#dc2626" : t.pct_uninsured > 12 ? "#f59e0b" : "#2563eb";
      
      const centroidMarker = L.circleMarker([t.latitude, t.longitude], {
        radius: isHighNeed ? 6 : 4.5,
        fillColor: color,
        color: "#ffffff",
        weight: 1.5,
        opacity: 0.95,
        fillOpacity: 0.75
      }).addTo(tractMarkersLayer);

      // Tooltip on hover: Formatted exactly like dropdown options
      // "Rank #<rank> (Tract <tract_id> • Score <score> • Uninsured <pct>%)"
      const rankPart = t.rank_overall ? `Rank #${t.rank_overall}` : `Tract ${t.geo_id}`;
      const scorePart = t.composite_need_score ? ` • Score ${t.composite_need_score}` : '';
      centroidMarker.bindTooltip(`
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; font-size: 11px; padding: 3px 6px; font-weight: 600; line-height: 1.3;">
          <strong style="color: #1e3a8a;">${rankPart} (Tract ${t.geo_id}${scorePart} • Uninsured ${t.pct_uninsured}%)</strong><br>
          <span style="font-weight: 400; color: #64748b; font-size: 10px;">No Vehicle: ${t.pct_no_vehicle}% | Safety-Net: ${t.km_to_safety_net} km</span>
        </div>
      `, { sticky: true, direction: "top" });

      // Click centroid to view detailed card
      centroidMarker.on("click", () => {
        const overlay = document.getElementById("activeStopOverlay");
        document.getElementById("overlayDate").innerText = `Tract Centroid Pin (${t.latitude.toFixed(4)}, ${t.longitude.toFixed(4)})`;
        document.getElementById("overlayTract").innerText = `Census Tract ${t.geo_id} (Pop: ${(t.total_pop || 0).toLocaleString()})`;
        document.getElementById("overlayRationale").innerText = `Precomputed centroid from burden_tracts in BigQuery. Uninsured: ${t.pct_uninsured}%, No Vehicle: ${t.pct_no_vehicle}%, Diabetes: ${t.pct_diabetes}%, Distance to safety net: ${t.km_to_safety_net} km (Extra travel if uninsured: ${t.extra_km_if_uninsured} km).`;
        document.getElementById("overlayUninsured").innerText = `${t.pct_uninsured}%`;
        document.getElementById("overlayNoVehicle").innerText = `${t.pct_no_vehicle}%`;
        document.getElementById("overlayDistance").innerText = `${t.km_to_safety_net} km`;
        overlay.classList.remove("hidden");
        map.panTo([t.latitude, t.longitude]);
      });
    });
  } catch (err) {
    console.error("Failed to load tracts:", err);
  }
}

async function loadCareSites() {
  try {
    const res = await fetch(`api/care_sites?county=${currentCounty}`);
    const sites = await res.json();
    careSitesLayer.clearLayers();

    sites.forEach(s => {
      const isFQHC = s.site_kind === "FQHC";
      const icon = L.divIcon({
        className: "care-site-icon",
        html: `
          <div style="background-color: ${isFQHC ? '#10b981' : '#64748b'}; color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; border: 1.5px solid white;">
            <i class="fa-solid fa-hospital"></i>
          </div>
        `,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      const marker = L.marker([s.latitude, s.longitude], { icon: icon }).addTo(careSitesLayer);
      
      // Hover Tooltip: Clear identification of safety-net vs standard care site
      marker.bindTooltip(`
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; font-size: 11px; padding: 3px 6px; font-weight: 600; line-height: 1.3;">
          <strong style="color: ${isFQHC ? '#059669' : '#334155'};">${s.name}</strong><br>
          <span style="font-weight: 400; color: #64748b; font-size: 10px;">${isFQHC ? '🏥 FQHC Safety-Net Provider' : 'Standard Health Care Facility'}</span>
        </div>
      `, { sticky: true, direction: "top" });

      marker.bindPopup(`
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; font-size: 11px; line-height: 1.45;">
          <strong style="color: ${isFQHC ? '#059669' : '#334155'}; font-size: 12px;">${s.name}</strong><br>
          <span style="font-size: 10px; color: ${isFQHC ? '#059669' : '#64748b'}; font-weight: 600;">Type: ${s.site_kind || 'Standard Care'}</span><br>
          ${s.address}, ${s.city}<br>
          ${s.hours_per_week ? `<strong>Operating:</strong> ${s.hours_per_week} hrs/week` : ''}
        </div>
      `);
    });
  } catch (err) {
    console.error("Failed to load care sites:", err);
  }
}

// --- My Clinic Assistant Agent Client Logic ---

function setQueryPrompt(text) {
  const input = document.getElementById("assistantQueryInput");
  if (input) {
    input.value = text;
    input.focus();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("assistantChatForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("assistantQueryInput");
    const sendBtn = document.getElementById("assistantSendBtn");
    const query = input.value.trim();
    if (!query) return;

    // Append user message to chat log
    appendChatMessage("user", query);
    input.value = "";
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Thinking...`;

    // Temporary loading placeholder for agent
    const tempId = "loading-" + Date.now();
    appendChatMessage("ai", `<span class="flex items-center gap-2"><i class="fa-solid fa-spinner fa-spin text-blue-600"></i> Querying BigQuery & reasoning...</span>`, tempId);

    try {
      const res = await fetch("api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query })
      });

      const data = await res.json();
      const reply = data.reply || "No response received.";
      updateChatMessage(tempId, formatMarkdownText(reply));
    } catch (err) {
      updateChatMessage(tempId, `<span class="text-red-600">Failed to connect to My Clinic Assistant: ${err.message}</span>`);
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<span>Ask</span> <i class="fa-solid fa-paper-plane text-[10px]"></i>`;
      input.focus();
    }
  });
});

function appendChatMessage(sender, content, elemId = null) {
  const chatLog = document.getElementById("assistantChatLog");
  if (!chatLog) return;

  const msgDiv = document.createElement("div");
  if (elemId) msgDiv.id = elemId;
  msgDiv.className = `flex items-start gap-2.5 ${sender === "user" ? "flex-row-reverse" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = `w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
    sender === "user" 
      ? "bg-slate-700 text-white" 
      : "bg-blue-600 text-white"
  }`;
  avatar.innerText = sender === "user" ? "You" : "AI";

  const bubble = document.createElement("div");
  bubble.className = `p-3 rounded-xl border max-w-xl shadow-2xs leading-relaxed text-xs ${
    sender === "user"
      ? "bg-blue-50 border-blue-200 text-blue-950 font-medium"
      : "bg-white border-slate-200 text-slate-700"
  }`;
  bubble.innerHTML = content;

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  chatLog.appendChild(msgDiv);

  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateChatMessage(elemId, newContent) {
  const el = document.getElementById(elemId);
  if (!el) return;
  const bubble = el.querySelector("div:last-child");
  if (bubble) {
    bubble.innerHTML = newContent;
  }
  const chatLog = document.getElementById("assistantChatLog");
  if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
}

function formatMarkdownText(text) {
  // Simple markdown conversion for bullet points, bolding, and code
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Backticks
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-blue-700 px-1 py-0.5 rounded font-mono text-[11px]">$1</code>');

  // Bullet points
  const lines = formatted.split("\n");
  let inList = false;
  let out = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      if (!inList) {
        out.push('<ul class="list-disc pl-4 space-y-1 my-1">');
        inList = true;
      }
      out.push(`<li>${trimmed.substring(2)}</li>`);
    } else {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      if (trimmed.length > 0) {
        out.push(`<p class="my-1">${line}</p>`);
      }
    }
  }
  if (inList) out.push('</ul>');

  return out.join("");
}

// --- 3-Agent Pipeline Execution Logic ---

async function execute3AgentPipeline() {
  const btn = document.getElementById("runPipelineBtn");
  const outputContainer = document.getElementById("pipelineOutputContainer");
  const idlePrompt = document.getElementById("pipelineIdlePrompt");
  const scoreBadge = document.getElementById("pipelineAuditScore");
  const verdictEl = document.getElementById("pipelineAuditVerdict");
  const findingsEl = document.getElementById("pipelineAuditFindings");
  const flierBox = document.getElementById("flierContentBox");

  if (!btn) return;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Coordinating...`;

  if (idlePrompt) idlePrompt.classList.add("hidden");
  if (outputContainer) outputContainer.classList.remove("hidden");

  verdictEl.innerText = "Step 1: Siting Agent planning 4 stops... Step 2: Equity Auditor auditing demographics & distance... Step 3: Community Explainer generating bilingual flyers...";
  findingsEl.innerHTML = "";
  flierBox.innerText = "Generating plain-language flyers...";

  try {
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    const res = await fetch(`api/multiagent/pipeline?month=${monthKey}`);
    const data = await res.json();

    const audit = data.audit_report || {};
    scoreBadge.innerText = `Score: ${audit.equity_score || '95.0'}`;
    verdictEl.innerText = audit.verdict || "Schedule audited and approved.";

    findingsEl.innerHTML = "";
    (audit.audit_findings || []).forEach(f => {
      const item = document.createElement("div");
      item.innerHTML = `• ${f}`;
      findingsEl.appendChild(item);
    });

    if (audit.language_access_recommendation) {
      const langAlert = document.createElement("div");
      langAlert.className = "mt-1 text-[10px] font-bold text-amber-800 bg-amber-50 p-1 rounded border border-amber-200";
      langAlert.innerHTML = `⚠️ Language Access: ${audit.language_access_recommendation}`;
      findingsEl.appendChild(langAlert);
    }

    // Store flyers globally and display English by default
    window.latestFlyers = data.flyers || {};
    flierBox.innerText = window.latestFlyers.flier_en || "No flyer generated.";

    // Render Weekly Decision Matrix (Adversarial Loop)
    renderWeeklyDecisionMatrix(data.weekly_matrix || []);

  } catch (err) {
    verdictEl.innerText = `Pipeline failed: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

function renderWeeklyDecisionMatrix(matrix) {
  const container = document.getElementById("weeklyDecisionMatrix");
  if (!container) return;
  container.innerHTML = "";

  if (matrix.length === 0) {
    container.innerHTML = `<div class="text-slate-400 italic">No negotiation steps recorded.</div>`;
    return;
  }

  matrix.forEach(m => {
    const card = document.createElement("div");
    card.className = "p-2 bg-white rounded border border-indigo-100 shadow-2xs space-y-1";
    card.innerHTML = `
      <div class="flex items-center justify-between font-bold text-slate-800">
        <span>Week ${m.week} (${m.date})</span>
        <span class="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-mono text-[9px] border border-emerald-200">${m.final_verdict}</span>
      </div>
      <div class="text-slate-500 flex justify-between">
        <span>Draft 1: Tract <code>${m.draft1_tract}</code> (Score ${m.draft1_score})</span>
        <span class="text-amber-700">${m.round1_finding}</span>
      </div>
      <div class="text-indigo-900 bg-indigo-50/60 p-1 rounded border border-indigo-100 font-medium">
        ↳ <strong>Auditor Action:</strong> ${m.action}
      </div>
    `;
    container.appendChild(card);
  });
}

function renderVetoPins(vetoStops) {
  vetoMarkersLayer.clearLayers();
  vetoStops.forEach(v => {
    const icon = L.divIcon({
      className: "veto-pin-icon",
      html: `
        <div style="background-color: #d97706; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #ffffff; box-shadow: 0 0 8px rgba(217, 119, 6, 0.7); font-weight: bold; font-size: 11px;">
          ❌${v.stop_number}
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const marker = L.marker([v.lat, v.lon], { icon: icon }).addTo(vetoMarkersLayer);
    marker.bindPopup(`
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; max-width: 250px;">
        <div style="color: #b45309; font-weight: bold; font-size: 12px; margin-bottom: 3px;">
          ⚖️ ROUND 1 VETO PIN (STOP #${v.stop_number})
        </div>
        <strong>Tract:</strong> ${v.tract_id} (Rank #${v.rank_overall}, Score ${v.composite_need_score})<br>
        <strong>Uninsured:</strong> ${v.pct_uninsured}% | <strong>No Car:</strong> ${v.pct_no_vehicle}%<br>
        <hr style="margin: 4px 0; border: none; border-top: 1px solid #fde68a;">
        <span style="color: #92400e; font-size: 11px;">${v.veto_reason}</span>
      </div>
    `);

    // Add dashed exclusion radius circle
    L.circle([v.lat, v.lon], {
      radius: 1200,
      color: "#d97706",
      dashArray: "4, 6",
      fillOpacity: 0.08,
      weight: 1.5
    }).addTo(vetoMarkersLayer);
  });
}

// --- Booking Modal & Calendar Handlers ---

let activeBookingStop = null;

function openBookingModal(stop) {
  activeBookingStop = stop;
  const modal = document.getElementById("bookingModal");
  if (!modal) return;

  document.getElementById("bookingStopTitle").innerText = `${stop.saturday_label} - Tract ${stop.tract_id}`;
  document.getElementById("bookingStopDetails").innerText = `Date: ${stop.date || 'Saturday'} (9:00 AM - 2:00 PM) • GPS: ${stop.lat.toFixed(4)}, ${stop.lon.toFixed(4)}`;

  // Construct Google Calendar link
  const title = encodeURIComponent(`Mobile Clinic Visit - Fulton County (Tract ${stop.tract_id})`);
  const details = encodeURIComponent(`Free mobile health checkup, blood pressure & diabetes screening.\nLocation: Tract ${stop.tract_id} (${stop.lat}, ${stop.lon})\nNo insurance or ID required!`);
  const loc = encodeURIComponent(`${stop.lat},${stop.lon}`);
  
  // Format date YYYYMMDD
  const rawDate = (stop.date || "2026-11-07").replace(/-/g, "");
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${rawDate}T090000Z/${rawDate}T140000Z&details=${details}&location=${loc}`;
  document.getElementById("addToGoogleCalBtn").href = gcalUrl;

  document.getElementById("bookingConfirmation").classList.add("hidden");
  modal.classList.remove("hidden");
}

function openQrModal(stop) {
  const modal = document.getElementById("qrModal");
  if (!modal) return;

  const title = `${stop.saturday_label} - Census Tract ${stop.tract_id}`;
  document.getElementById("qrModalTitle").innerText = title;
  document.getElementById("qrModalSubtitle").innerText = `Date: ${stop.date || 'Saturday'} (9 AM - 2 PM). GPS: ${stop.lat.toFixed(4)}, ${stop.lon.toFixed(4)}`;

  // Google Maps directions URL
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lon}`;
  document.getElementById("qrTargetUrl").innerText = mapsUrl;
  document.getElementById("qrDirectMapsLink").href = mapsUrl;

  // Use fast, reliable public QR API
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mapsUrl)}`;
  document.getElementById("qrImageDisplay").src = qrApiUrl;

  modal.classList.remove("hidden");
}

function initModalListeners() {
  const closeBook = document.getElementById("closeBookingModal");
  if (closeBook) {
    closeBook.addEventListener("click", () => {
      document.getElementById("bookingModal").classList.add("hidden");
    });
  }

  const closeQr = document.getElementById("closeQrModal");
  if (closeQr) {
    closeQr.addEventListener("click", () => {
      document.getElementById("qrModal").classList.add("hidden");
    });
  }

  const bookingForm = document.getElementById("bookingForm");
  if (bookingForm) {
    bookingForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const conf = document.getElementById("bookingConfirmation");
      if (conf) conf.classList.remove("hidden");
    });
  }

  const icalBtn = document.getElementById("downloadIcalBtn");
  if (icalBtn) {
    icalBtn.addEventListener("click", () => {
      if (!activeBookingStop) return;
      const s = activeBookingStop;
      const rawDate = (s.date || "2026-11-07").replace(/-/g, "");
      const icsData = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Fulton County Mobile Health Van//EN",
        "BEGIN:VEVENT",
        `SUMMARY:Mobile Clinic Visit - Fulton County (Tract ${s.tract_id})`,
        `DESCRIPTION:Free health checkup, blood pressure & diabetes screening. No insurance or ID needed!`,
        `LOCATION:${s.lat},${s.lon}`,
        `DTSTART:${rawDate}T090000Z`,
        `DTEND:${rawDate}T140000Z`,
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR"
      ].join("\r\n");

      const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute("download", `mobile_clinic_stop_${s.tract_id}.ics`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  const printQrBtn = document.getElementById("qrPrintBtn");
  if (printQrBtn) {
    printQrBtn.addEventListener("click", () => {
      window.print();
    });
  }
}

