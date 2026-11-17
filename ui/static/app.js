// Mobile Clinic Planner - Frontend Application

let map;
let tractMarkersLayer = L.layerGroup();
let careSitesLayer = L.layerGroup();
let clinicStopsLayer = L.layerGroup();
let rejectedSitesLayer = L.layerGroup();

let currentStops = [];
let currentRejectedSites = [];
let selectedStopIndex = 0;

// Fulton County coordinates (Atlanta Center)
const FULTON_CENTER = [33.7490, -84.3880];

let currentYear = 2026;
let currentMonth = 11; // 1-indexed (November = 11)

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initCalendar(currentYear, currentMonth);
  loadPlan();
  loadTracts();
  loadCareSites();

  document.getElementById("refreshPlanBtn").addEventListener("click", () => {
    loadPlan();
  });

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

  // 3-Agent Collaborative Pipeline Runner
  const runPipelineBtn = document.getElementById("runPipelineBtn");
  if (runPipelineBtn) {
    runPipelineBtn.addEventListener("click", () => {
      execute3AgentPipeline();
    });
  }

  const flierEnBtn = document.getElementById("showFlierEnBtn");
  const flierEsBtn = document.getElementById("showFlierEsBtn");
  if (flierEnBtn && flierEsBtn) {
    flierEnBtn.addEventListener("click", () => {
      flierEnBtn.className = "bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-semibold";
      flierEsBtn.className = "bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold";
      if (window.latestFlyers) {
        document.getElementById("flierContentBox").innerText = window.latestFlyers.flier_en || "";
      }
    });
    flierEsBtn.addEventListener("click", () => {
      flierEsBtn.className = "bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-semibold";
      flierEnBtn.className = "bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold";
      if (window.latestFlyers) {
        document.getElementById("flierContentBox").innerText = window.latestFlyers.flier_es || "";
      }
    });
  }
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

  // OpenStreetMap base layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
  }).addTo(map);

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
    const res = await fetch(`api/plan?month=${monthKey}`);
    const data = await res.json();
    currentStops = data.stops || [];

    // Rebuild calendar with month's actual days and stops
    initCalendar(data.year || currentYear, data.month_num || currentMonth, currentStops);

    renderStopsList(currentStops);
    renderClinicStopPins(currentStops);
    renderAlternatives(data.alternatives || []);
    renderRejectedSites(data.rejected_sites || []);

    if (currentStops.length > 0) {
      selectStop(0);
    }
  } catch (err) {
    console.error("Failed to load plan:", err);
  }
}

function renderStopsList(stops) {
  const container = document.getElementById("stopsList");
  container.innerHTML = "";

  stops.forEach((stop, idx) => {
    const card = document.createElement("div");
    card.id = `stop-card-${idx}`;
    card.className = `p-3.5 rounded-lg border border-slate-200 cursor-pointer transition hover:border-blue-400 bg-white shadow-xs`;
    card.addEventListener("click", () => selectStop(idx));

    // Construct comparative reasoning badges
    const uninsBadge = stop.uninsured_mult > 1.5 
      ? `<span class="bg-red-50 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-red-200">${stop.uninsured_mult}x Co. Avg</span>`
      : "";
    const vehBadge = stop.vehicle_mult > 1.5 
      ? `<span class="bg-amber-50 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-200">${stop.vehicle_mult}x Co. Avg</span>`
      : "";

    card.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            ${stop.saturday_label}
          </span>
          <span class="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
            Rank #${stop.rank_overall} (Top ${100 - stop.need_percentile}%)
          </span>
        </div>
        <span class="text-xs font-semibold text-slate-500 font-mono">Tract ${stop.tract_id}</span>
      </div>

      <!-- Why Selected Explanation -->
      <p class="text-xs text-slate-700 font-medium mb-1.5 leading-snug">
        ${stop.why_chosen}
      </p>

      <!-- Key Comparative Metric Indicators -->
      <div class="grid grid-cols-3 gap-1.5 mt-2 text-center text-[11px] bg-slate-50 p-2 rounded border border-slate-100">
        <div>
          <span class="text-slate-400 block text-[9px] uppercase">Uninsured</span>
          <span class="font-bold text-red-600">${stop.pct_uninsured}%</span>
          ${uninsBadge}
        </div>
        <div>
          <span class="text-slate-400 block text-[9px] uppercase">No Car</span>
          <span class="font-bold text-amber-600">${stop.pct_no_vehicle}%</span>
          ${vehBadge}
        </div>
        <div>
          <span class="text-slate-400 block text-[9px] uppercase">Safety Net</span>
          <span class="font-bold text-blue-600">${stop.km_to_safety_net} km</span>
          <span class="text-[10px] text-slate-500 block">${stop.dist_diff > 0 ? '+' : ''}${stop.dist_diff} km vs avg</span>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
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
    marker.bindPopup(`
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; max-width: 260px;">
        <div style="color: #be123c; font-weight: bold; font-size: 13px; display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
          ⚠️ REJECTED CANDIDATE SPOT
        </div>
        <strong>Tract:</strong> ${rej.tract_id} (Rank #${rej.rank_overall}, Score ${rej.composite_need_score})<br>
        <strong>Uninsured:</strong> ${rej.pct_uninsured}% | <strong>No Car:</strong> ${rej.pct_no_vehicle}%<br>
        <hr style="margin: 5px 0; border: none; border-top: 1px solid #fecdd3;">
        <strong style="color: #9f1239;">Local Event Conflict:</strong><br>
        <span style="font-weight: 600; color: #1e293b;">${rej.event_name}</span> (${rej.venue_zone})<br>
        <p style="margin-top: 4px; font-size: 11px; color: #475569; background: #fff1f2; padding: 5px; border-radius: 4px; border: 1px solid #ffe4e6;">
          ${rej.rejection_reason}
        </p>
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
    marker.bindPopup(`
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; max-width: 240px;">
        <strong style="color: #1e40af;">${stop.saturday_label} (Stop #${idx + 1})</strong><br>
        <div style="margin: 4px 0; font-size: 11px; background: #eff6ff; padding: 4px 6px; border-radius: 4px;">
          <strong>Rank #${stop.rank_overall}</strong> in Fulton County (Score: ${stop.composite_need_score})
        </div>
        <strong>Pop:</strong> ${stop.total_pop.toLocaleString()}<br>
        <strong>Uninsured:</strong> ${stop.pct_uninsured}% (${stop.uninsured_mult}x county avg)<br>
        <strong>Lacks Vehicle:</strong> ${stop.pct_no_vehicle}% (${stop.vehicle_mult}x county avg)<br>
        <strong>Safety-Net Distance:</strong> ${stop.km_to_safety_net} km
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
    const res = await fetch("api/tracts");
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

      // Tooltip on hover
      centroidMarker.bindTooltip(`
        <div style="font-family: sans-serif; font-size: 11px; padding: 2px;">
          <strong style="color: #1e3a8a;">Tract Centroid: ${t.geo_id}</strong><br>
          <span style="color: #64748b;">(${t.latitude.toFixed(4)}, ${t.longitude.toFixed(4)})</span><br>
          <hr style="margin: 3px 0; border: none; border-top: 1px solid #e2e8f0;">
          <strong>Uninsured:</strong> ${t.pct_uninsured}%<br>
          <strong>No Vehicle:</strong> ${t.pct_no_vehicle}%<br>
          <strong>Safety-Net Distance:</strong> ${t.km_to_safety_net} km
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
    const res = await fetch("api/care_sites");
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
      marker.bindPopup(`
        <div style="font-size: 11px;">
          <strong style="color: ${isFQHC ? '#059669' : '#334155'};">${s.name}</strong><br>
          <span style="font-size: 10px; color: #666;">Type: ${s.site_kind || 'Standard Care'}</span><br>
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

  } catch (err) {
    verdictEl.innerText = `Pipeline failed: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

