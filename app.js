const MAX_COMPARE = 6;
const splitOrder = ["swim", "bike", "run", "t1", "t2"];
const splitLabels = {
  swim: "Swim",
  bike: "Bike",
  run: "Run",
  t1: "T1",
  t2: "T2",
};
const chartPalette = ["#ff6a3d", "#31d0d3", "#ffb33c", "#8ff0b6", "#95a6ff", "#ff8ab1"];
const PRELOADED_TEXT_DATASET_PATH = "/data/hengqin-results.txt";

const dom = {
  sourceLabel: document.getElementById("sourceLabel"),
  searchInput: document.getElementById("searchInput"),
  divisionFilter: document.getElementById("divisionFilter"),
  countryFilter: document.getElementById("countryFilter"),
  sortSelect: document.getElementById("sortSelect"),
  resultCount: document.getElementById("resultCount"),
  statsGrid: document.getElementById("statsGrid"),
  athleteGrid: document.getElementById("athleteGrid"),
  detailContent: document.getElementById("detailContent"),
  comparisonPills: document.getElementById("comparisonPills"),
  totalChartCanvas: document.getElementById("totalChart"),
  splitChartCanvas: document.getElementById("splitChart"),
};

const state = {
  allAthletes: [],
  filteredAthletes: [],
  selectedAthleteId: null,
  compareIds: new Set(),
};

let totalChart = null;
let splitChart = null;
let firstLoad = true;

function normalizeHeader(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function parseDurationToSec(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return null;
    }
    // Excel often stores times as day fractions.
    if (value > 0 && value < 1) {
      return Math.round(value * 24 * 60 * 60);
    }
    return Math.round(value);
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const decimal = Number(raw);
  if (Number.isFinite(decimal) && !raw.includes(":")) {
    if (decimal > 0 && decimal < 1) {
      return Math.round(decimal * 24 * 60 * 60);
    }
    return Math.round(decimal);
  }

  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--";
  }
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((whole % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(whole % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${secs}`;
}

function formatRank(rank) {
  if (!Number.isFinite(rank) || rank <= 0) {
    return "--";
  }
  return `#${Math.round(rank)}`;
}

function shortName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length <= 2) {
    return parts.join(" ");
  }
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function parseTabSeparatedText(text) {
  const lines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    return [];
  }

  const headerCounts = new Map();
  const headers = lines[0].split("\t").map((header, index) => {
    const base = String(header).trim() || `Column${index + 1}`;
    const seen = headerCounts.get(base) || 0;
    headerCounts.set(base, seen + 1);
    return seen === 0 ? base : `${base}_${seen + 1}`;
  });
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function resolveField(rowEntries, candidates) {
  const candidateList = Array.isArray(candidates) ? candidates : [candidates];

  for (const candidate of candidateList) {
    const lookup = normalizeHeader(candidate);
    const direct = rowEntries.find(([key]) => key === lookup);
    if (direct && String(direct[1] ?? "").trim() !== "") {
      return direct[1];
    }
  }

  for (const candidate of candidateList) {
    const lookup = normalizeHeader(candidate);
    const fuzzy = rowEntries.find(([key, value]) => {
      if (String(value ?? "").trim() === "") {
        return false;
      }
      return key.includes(lookup) || lookup.includes(key);
    });
    if (fuzzy) {
      return fuzzy[1];
    }
  }

  return "";
}

function normalizeAthlete(row, rowIndex = 0) {
  const rowEntries = Object.entries(row).map(([k, v]) => [normalizeHeader(k), v]);

  const athleteName = String(
    resolveField(rowEntries, ["athlete", "athelete", "name", "participant", "athletename"]),
  ).trim();

  if (!athleteName) {
    return null;
  }

  const country = String(resolveField(rowEntries, ["country", "nation", "nationality"])).trim().toUpperCase() || "--";
  const bib = String(resolveField(rowEntries, ["bib", "bibnumber", "bib#", "number"])).trim() || "--";
  const division = String(resolveField(rowEntries, ["division", "agegroup", "category"])).trim() || "--";

  const overallRank = toNumber(resolveField(rowEntries, ["overallrank", "overallrank1", "overall", "rank"]));
  const genderRank = toNumber(resolveField(rowEntries, ["genderrank", "sexrank"]));
  const divRank = toNumber(resolveField(rowEntries, ["divrank", "divisionrank", "agerank"]));

  const swimSec = parseDurationToSec(resolveField(rowEntries, ["swim", "swimtime", "swimsplit"]));
  const bikeSec = parseDurationToSec(resolveField(rowEntries, ["bike", "biketime", "bikesplit", "cycle"]));
  const runSec = parseDurationToSec(resolveField(rowEntries, ["run", "runtime", "runsplit"]));
  const t1Sec = parseDurationToSec(resolveField(rowEntries, ["t1", "transition1"]));
  const t2Sec = parseDurationToSec(resolveField(rowEntries, ["t2", "transition2"]));

  let totalSec = parseDurationToSec(resolveField(rowEntries, ["totaltime", "total", "racetime", "overalltime"]));
  if (!Number.isFinite(totalSec)) {
    const computed = [swimSec, bikeSec, runSec, t1Sec, t2Sec].reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    totalSec = computed > 0 ? computed : null;
  }

  const rawIndex = toNumber(resolveField(rowEntries, ["index", "id", "no"]));
  const id = `${athleteName}-${bib}-${rawIndex ?? rowIndex}-${overallRank ?? "na"}`;

  return {
    id,
    athleteName,
    country,
    bib,
    division,
    overallRank,
    genderRank,
    divRank,
    swimSec,
    bikeSec,
    runSec,
    t1Sec,
    t2Sec,
    totalSec,
  };
}

function buildDivisionFilter() {
  const previous = dom.divisionFilter.value || "all";
  const divisions = [...new Set(state.allAthletes.map((athlete) => athlete.division).filter((value) => value && value !== "--"))].sort();

  dom.divisionFilter.innerHTML = '<option value="all">All Divisions</option>';
  divisions.forEach((division) => {
    const option = document.createElement("option");
    option.value = division;
    option.textContent = division;
    dom.divisionFilter.append(option);
  });

  if (["all", ...divisions].includes(previous)) {
    dom.divisionFilter.value = previous;
  }
}

function buildCountryFilter() {
  const previous = dom.countryFilter.value || "all";
  const countries = [...new Set(state.allAthletes.map((athlete) => athlete.country).filter((value) => value && value !== "--"))].sort();

  dom.countryFilter.innerHTML = '<option value="all">All Countries</option>';
  countries.forEach((country) => {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    dom.countryFilter.append(option);
  });

  if (["all", ...countries].includes(previous)) {
    dom.countryFilter.value = previous;
  }
}

function applyFiltersAndSort() {
  const searchText = dom.searchInput.value.trim().toLowerCase();
  const selectedDivision = dom.divisionFilter.value;
  const selectedCountry = dom.countryFilter.value;
  const sortBy = dom.sortSelect.value;

  const filtered = state.allAthletes.filter((athlete) => {
    const searchTarget = `${athlete.athleteName} ${athlete.bib}`.toLowerCase();
    const matchesSearch = !searchText || searchTarget.includes(searchText);
    const matchesDivision = selectedDivision === "all" || athlete.division === selectedDivision;
    const matchesCountry = selectedCountry === "all" || athlete.country === selectedCountry;
    return matchesSearch && matchesDivision && matchesCountry;
  });

  const sorters = {
    overall: (a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER),
    totalAsc: (a, b) => (a.totalSec ?? Number.MAX_SAFE_INTEGER) - (b.totalSec ?? Number.MAX_SAFE_INTEGER),
    totalDesc: (a, b) => (b.totalSec ?? Number.MIN_SAFE_INTEGER) - (a.totalSec ?? Number.MIN_SAFE_INTEGER),
    swim: (a, b) => (a.swimSec ?? Number.MAX_SAFE_INTEGER) - (b.swimSec ?? Number.MAX_SAFE_INTEGER),
    bike: (a, b) => (a.bikeSec ?? Number.MAX_SAFE_INTEGER) - (b.bikeSec ?? Number.MAX_SAFE_INTEGER),
    run: (a, b) => (a.runSec ?? Number.MAX_SAFE_INTEGER) - (b.runSec ?? Number.MAX_SAFE_INTEGER),
  };

  filtered.sort(sorters[sortBy] || sorters.overall);
  state.filteredAthletes = filtered;

  if (!filtered.find((athlete) => athlete.id === state.selectedAthleteId)) {
    state.selectedAthleteId = filtered[0]?.id ?? null;
  }

  const validIds = new Set(state.allAthletes.map((athlete) => athlete.id));
  state.compareIds.forEach((id) => {
    if (!validIds.has(id)) {
      state.compareIds.delete(id);
    }
  });
}

function getSelectedAthlete() {
  return state.allAthletes.find((athlete) => athlete.id === state.selectedAthleteId) || null;
}

function getComparedAthletes() {
  const selected = Array.from(state.compareIds)
    .map((id) => state.allAthletes.find((athlete) => athlete.id === id))
    .filter(Boolean);

  if (selected.length > 0) {
    return selected;
  }

  const focused = getSelectedAthlete();
  return focused ? [focused] : [];
}

function renderStats() {
  if (!state.allAthletes.length) {
    dom.statsGrid.innerHTML = "";
    return;
  }

  const participants = state.allAthletes.length;
  const averageTotal =
    state.allAthletes.reduce((sum, athlete) => sum + (athlete.totalSec ?? 0), 0) /
    Math.max(
      1,
      state.allAthletes.filter((athlete) => Number.isFinite(athlete.totalSec)).length,
    );

  const fastestTotal = [...state.allAthletes].filter((athlete) => Number.isFinite(athlete.totalSec)).sort((a, b) => a.totalSec - b.totalSec)[0];
  const fastestSwim = [...state.allAthletes].filter((athlete) => Number.isFinite(athlete.swimSec)).sort((a, b) => a.swimSec - b.swimSec)[0];

  dom.statsGrid.innerHTML = `
    <article class="stat-card">
      <p class="label">Participants</p>
      <p class="value">${participants.toLocaleString()}</p>
    </article>
    <article class="stat-card">
      <p class="label">Average Finish Time</p>
      <p class="value">${formatDuration(averageTotal)}</p>
    </article>
    <article class="stat-card">
      <p class="label">Fastest Overall</p>
      <p class="value">${formatDuration(fastestTotal?.totalSec)}</p>
      <p class="muted">${escapeHtml(fastestTotal?.athleteName ?? "--")}</p>
    </article>
    <article class="stat-card">
      <p class="label">Best Swim Split</p>
      <p class="value">${formatDuration(fastestSwim?.swimSec)}</p>
      <p class="muted">${escapeHtml(fastestSwim?.athleteName ?? "--")}</p>
    </article>
  `;
}

function renderAthleteGrid() {
  dom.resultCount.textContent = `${state.filteredAthletes.length.toLocaleString()} results`;

  if (!state.filteredAthletes.length) {
    dom.athleteGrid.innerHTML = '<div class="no-results">No athletes matched your filter settings.</div>';
    return;
  }

  dom.athleteGrid.innerHTML = state.filteredAthletes
    .map((athlete) => {
      const isActive = athlete.id === state.selectedAthleteId;
      const isCompared = state.compareIds.has(athlete.id);

      return `
        <article class="athlete-card ${isActive ? "active" : ""}" data-id="${escapeHtml(athlete.id)}">
          <div class="athlete-top">
            <div class="athlete-name">${escapeHtml(athlete.athleteName)}</div>
            <span class="rank-tag">${formatRank(athlete.overallRank)}</span>
          </div>

          <div class="athlete-meta">
            <div class="meta-item"><span>Country</span><strong>${escapeHtml(athlete.country)}</strong></div>
            <div class="meta-item"><span>BIB</span><strong>${escapeHtml(athlete.bib)}</strong></div>
            <div class="meta-item"><span>Division</span><strong>${escapeHtml(athlete.division)}</strong></div>
          </div>

          <div class="athlete-times">
            <div class="time-item"><span>Swim</span><strong>${formatDuration(athlete.swimSec)}</strong></div>
            <div class="time-item"><span>Bike</span><strong>${formatDuration(athlete.bikeSec)}</strong></div>
            <div class="time-item"><span>Run</span><strong>${formatDuration(athlete.runSec)}</strong></div>
          </div>

          <div class="compare-row">
            <strong>Total ${formatDuration(athlete.totalSec)}</strong>
            <label class="compare-toggle">
              <input class="compare-input" type="checkbox" data-id="${escapeHtml(athlete.id)}" ${isCompared ? "checked" : ""} />
              Compare
            </label>
          </div>
        </article>
      `;
    })
    .join("");

  if (window.gsap) {
    gsap.fromTo(
      ".athlete-card",
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.28, stagger: 0.01, ease: "power2.out" },
    );
  }
}

function renderDetailPanel() {
  const athlete = getSelectedAthlete();

  if (!athlete) {
    dom.detailContent.innerHTML = '<div class="empty-state">Select an athlete to inspect split pacing and ranks.</div>';
    return;
  }

  const total = athlete.totalSec || 1;
  const splitRows = splitOrder
    .map((splitKey) => {
      const value = athlete[`${splitKey}Sec`];
      const percentage = Number.isFinite(value) ? Math.max(0, (value / total) * 100) : 0;
      return `
        <div class="split-item">
          <strong>${splitLabels[splitKey]}</strong>
          <div class="split-track"><div class="split-fill" style="width: ${percentage.toFixed(2)}%"></div></div>
          <span>${formatDuration(value)}</span>
        </div>
      `;
    })
    .join("");

  dom.detailContent.innerHTML = `
    <article class="detail-main">
      <div class="detail-header">
        <div>
          <h3>${escapeHtml(athlete.athleteName)}</h3>
          <p class="muted">${escapeHtml(athlete.country)} | BIB ${escapeHtml(athlete.bib)} | ${escapeHtml(athlete.division)}</p>
        </div>
        <div class="detail-totaltime">${formatDuration(athlete.totalSec)}</div>
      </div>

      <div class="detail-metrics">
        <div class="meta-item"><span>Overall Rank</span><strong>${formatRank(athlete.overallRank)}</strong></div>
        <div class="meta-item"><span>Gender Rank</span><strong>${formatRank(athlete.genderRank)}</strong></div>
        <div class="meta-item"><span>Division Rank</span><strong>${formatRank(athlete.divRank)}</strong></div>
      </div>

      <div class="split-bars">${splitRows}</div>
    </article>
  `;

  if (window.gsap) {
    gsap.fromTo(
      ".detail-main",
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.34, ease: "power2.out" },
    );
  }
}

function renderComparisonPills() {
  const compared = Array.from(state.compareIds)
    .map((id) => state.allAthletes.find((athlete) => athlete.id === id))
    .filter(Boolean);

  if (!compared.length) {
    dom.comparisonPills.innerHTML = '<p class="muted">No athletes selected.</p>';
    return;
  }

  dom.comparisonPills.innerHTML = compared
    .map(
      (athlete) =>
        `<span class="pill">${escapeHtml(shortName(athlete.athleteName))}<button type="button" data-remove-id="${escapeHtml(
          athlete.id,
        )}">x</button></span>`,
    )
    .join("");
}

function buildTotalChart(athletes) {
  const labels = athletes.map((athlete) => shortName(athlete.athleteName));
  const values = athletes.map((athlete) => (Number.isFinite(athlete.totalSec) ? athlete.totalSec / 60 : null));

  if (totalChart) {
    totalChart.destroy();
  }

  totalChart = new Chart(dom.totalChartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Total Time (minutes)",
          data: values,
          borderRadius: 8,
          backgroundColor: athletes.map((_, index) => chartPalette[index % chartPalette.length]),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      scales: {
        x: {
          ticks: { color: "#d5e7f8" },
          grid: { color: "rgba(255,255,255,0.09)" },
        },
        y: {
          ticks: { color: "#d5e7f8" },
          grid: { display: false },
        },
      },
      plugins: {
        legend: { labels: { color: "#edf7ff" } },
      },
      animation: { duration: 700, easing: "easeOutQuart" },
    },
  });
}

function buildSplitChart(athletes) {
  if (splitChart) {
    splitChart.destroy();
  }

  splitChart = new Chart(dom.splitChartCanvas, {
    type: "radar",
    data: {
      labels: splitOrder.map((splitKey) => splitLabels[splitKey]),
      datasets: athletes.map((athlete, index) => ({
        label: shortName(athlete.athleteName),
        data: splitOrder.map((splitKey) => {
          const seconds = athlete[`${splitKey}Sec`];
          return Number.isFinite(seconds) ? Number((seconds / 60).toFixed(2)) : null;
        }),
        fill: true,
        backgroundColor: `${chartPalette[index % chartPalette.length]}33`,
        borderColor: chartPalette[index % chartPalette.length],
        pointBackgroundColor: chartPalette[index % chartPalette.length],
        borderWidth: 2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { color: "rgba(255,255,255,0.13)" },
          grid: { color: "rgba(255,255,255,0.1)" },
          pointLabels: { color: "#e2f2ff" },
          ticks: {
            color: "#c3d5e6",
            backdropColor: "transparent",
          },
        },
      },
      plugins: {
        legend: {
          labels: { color: "#edf7ff" },
        },
      },
      animation: { duration: 750, easing: "easeOutQuart" },
    },
  });
}

function renderCharts() {
  const compared = getComparedAthletes();
  buildTotalChart(compared);
  buildSplitChart(compared);
}

function refreshView() {
  applyFiltersAndSort();
  renderStats();
  renderAthleteGrid();
  renderDetailPanel();
  renderComparisonPills();
  renderCharts();
}

function ingestRows(rows, sourceName) {
  const athletes = rows
    .map((row, index) => normalizeAthlete(row, index))
    .filter(Boolean)
    .map((athlete, index) => ({ ...athlete, id: `${athlete.id}-${index}` }));

  state.allAthletes = athletes;
  state.selectedAthleteId = athletes[0]?.id ?? null;
  state.compareIds.clear();

  buildDivisionFilter();
  buildCountryFilter();
  refreshView();

  dom.sourceLabel.textContent = `Source: ${sourceName} (${athletes.length.toLocaleString()} athletes)`;

  if (window.gsap && firstLoad) {
    gsap.fromTo(".hero", { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" });
    gsap.fromTo(".panel", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: "power2.out" });
    firstLoad = false;
  }
}

async function loadPreloadedData() {
  const response = await fetch(PRELOADED_TEXT_DATASET_PATH);
  if (!response.ok) {
    throw new Error(`Failed to load preloaded text data (${response.status})`);
  }
  const rawText = await response.text();
  const rows = parseTabSeparatedText(rawText);
  ingestRows(rows, "Hengqin preloaded text file");
}

function initializeEventBindings() {
  dom.searchInput.addEventListener("input", () => refreshView());
  dom.divisionFilter.addEventListener("change", () => refreshView());
  dom.countryFilter.addEventListener("change", () => refreshView());
  dom.sortSelect.addEventListener("change", () => refreshView());

  dom.athleteGrid.addEventListener("click", (event) => {
    const compareInput = event.target.closest(".compare-input");
    if (compareInput) {
      return;
    }

    const card = event.target.closest(".athlete-card");
    if (!card) {
      return;
    }

    state.selectedAthleteId = card.dataset.id;
    renderAthleteGrid();
    renderDetailPanel();
    renderCharts();
  });

  dom.athleteGrid.addEventListener("change", (event) => {
    const compareInput = event.target.closest(".compare-input");
    if (!compareInput) {
      return;
    }

    const athleteId = compareInput.dataset.id;
    const checked = compareInput.checked;

    if (checked && state.compareIds.size >= MAX_COMPARE) {
      compareInput.checked = false;
      alert(`You can compare up to ${MAX_COMPARE} athletes at one time.`);
      return;
    }

    if (checked) {
      state.compareIds.add(athleteId);
    } else {
      state.compareIds.delete(athleteId);
    }

    renderComparisonPills();
    renderCharts();
  });

  dom.comparisonPills.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-id]");
    if (!button) {
      return;
    }
    const id = button.dataset.removeId;
    state.compareIds.delete(id);
    renderComparisonPills();
    renderAthleteGrid();
    renderCharts();
  });
}

async function bootstrap() {
  initializeEventBindings();

  try {
    await loadPreloadedData();
  } catch (error) {
    console.error(error);
    dom.sourceLabel.textContent = "Source: failed to load preloaded text data";
    dom.detailContent.innerHTML = '<div class="empty-state">Preloaded dataset could not be loaded.</div>';
  }
}

bootstrap();
