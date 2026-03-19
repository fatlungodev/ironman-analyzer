import {
  SPLIT_KEYS,
  SPLIT_LABELS,
  applyFiltersAndSort,
  formatDuration,
  formatRank,
  getFilterValues,
  loadAthletes,
  readStoredSelection,
  shortName,
  storeSelection,
} from "./data-model.js";

const MAX_SELECTION = 8;
const palette = ["#ff7e4f", "#1fd6c0", "#ffd06f", "#9ba9ff", "#94f2ca", "#ff97b3", "#88d4ff", "#bce784"];

const dom = {
  searchInput: document.getElementById("cmpSearchInput"),
  divisionFilter: document.getElementById("cmpDivisionFilter"),
  countryFilter: document.getElementById("cmpCountryFilter"),
  pickerPanel: document.getElementById("cmpPickerPanel"),
  togglePickerBtn: document.getElementById("cmpTogglePickerBtn"),
  clearBtn: document.getElementById("cmpClearBtn"),
  athleteList: document.getElementById("cmpAthleteList"),
  selectedPills: document.getElementById("cmpSelectedPills"),
  selectionCount: document.getElementById("cmpSelectionCount"),
  resultCount: document.getElementById("cmpResultCount"),
  tableBody: document.querySelector("#comparisonTable tbody"),
  comparisonCards: document.getElementById("comparisonCards"),
  totalChartCanvas: document.getElementById("totalChart"),
  splitChartCanvas: document.getElementById("splitChart"),
};

const state = {
  allAthletes: [],
  filteredAthletes: [],
  selectedIds: new Set(),
  splitBenchmarks: {},
  pickerCollapsed: false,
};

let totalChart = null;
let splitChart = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fillSelect(select, values, label) {
  const previous = select.value || "all";
  select.innerHTML = `<option value="all">All ${label}</option>`;

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });

  if (["all", ...values].includes(previous)) {
    select.value = previous;
  }
}

function selectedAthletes() {
  return Array.from(state.selectedIds)
    .map((id) => state.allAthletes.find((athlete) => athlete.id === id))
    .filter(Boolean)
    .sort((a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER));
}

function syncStorage() {
  storeSelection(Array.from(state.selectedIds));
}

function setSelection(ids) {
  state.selectedIds = new Set(ids.slice(0, MAX_SELECTION));
  syncStorage();
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function updatePickerCollapsed(collapsed) {
  state.pickerCollapsed = Boolean(collapsed);
  dom.pickerPanel.classList.toggle("cmp-collapsed", state.pickerCollapsed);
  dom.togglePickerBtn.textContent = state.pickerCollapsed ? "Expand" : "Collapse";
}

function applyFilters() {
  state.filteredAthletes = applyFiltersAndSort(state.allAthletes, {
    searchText: dom.searchInput.value,
    division: dom.divisionFilter.value,
    country: dom.countryFilter.value,
    sortBy: "overall",
  });
}

function buildSplitBenchmarks(athletes) {
  const benchmarks = {};

  SPLIT_KEYS.forEach((splitKey) => {
    const values = athletes.map((athlete) => athlete[`${splitKey}Sec`]).filter((value) => Number.isFinite(value) && value > 0);

    if (!values.length) {
      benchmarks[splitKey] = {
        fastest: null,
        slowest: null,
        average: null,
      };
      return;
    }

    const fastest = Math.min(...values);
    const slowest = Math.max(...values);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;

    benchmarks[splitKey] = {
      fastest,
      slowest,
      average,
    };
  });

  return benchmarks;
}

function toSplitScore(seconds, benchmark) {
  if (!benchmark || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(benchmark.fastest) || !Number.isFinite(benchmark.slowest)) {
    return null;
  }

  if (benchmark.fastest === benchmark.slowest) {
    return 100;
  }

  const score = ((benchmark.slowest - seconds) / (benchmark.slowest - benchmark.fastest)) * 100;
  return Math.max(0, Math.min(100, Number(score.toFixed(1))));
}

function renderPickerList() {
  if (!state.filteredAthletes.length) {
    dom.athleteList.innerHTML = '<div class="empty-state">No athletes matched your filters.</div>';
    return;
  }

  dom.athleteList.innerHTML = state.filteredAthletes
    .map((athlete) => {
      const selected = state.selectedIds.has(athlete.id);
      return `
        <article class="athlete-row ${selected ? "selected" : ""}" data-id="${escapeHtml(athlete.id)}">
          <label class="check-wrap">
            <input type="checkbox" data-id="${escapeHtml(athlete.id)}" ${selected ? "checked" : ""} />
          </label>
          <div class="identity">
            <strong>${escapeHtml(athlete.athleteName)}</strong>
            <span>${escapeHtml(athlete.country)} · BIB ${escapeHtml(athlete.bib)} · ${escapeHtml(athlete.division)}</span>
          </div>
          <div class="mini-metric">
            <span>Overall</span>
            <strong>${formatRank(athlete.overallRank)}</strong>
          </div>
          <div class="mini-metric">
            <span>Total</span>
            <strong>${formatDuration(athlete.totalSec)}</strong>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderPills() {
  const selected = selectedAthletes();
  dom.selectionCount.textContent = `${selected.length} selected (max ${MAX_SELECTION})`;

  if (!selected.length) {
    dom.selectedPills.innerHTML = '<p class="muted">No athletes selected.</p>';
    return;
  }

  dom.selectedPills.innerHTML = selected
    .map(
      (athlete) =>
        `<span class="pill">${escapeHtml(shortName(athlete.athleteName))}<button type="button" data-remove-id="${escapeHtml(
          athlete.id,
        )}">x</button></span>`,
    )
    .join("");
}

function renderTable() {
  const selected = selectedAthletes();
  dom.resultCount.textContent = `${selected.length} athletes`;

  if (!selected.length) {
    dom.tableBody.innerHTML = '<tr><td colspan="10" class="muted">Select athletes to populate the table.</td></tr>';
    dom.comparisonCards.innerHTML = '<div class="empty-state">Select athletes to view mobile detail cards.</div>';
    return;
  }

  dom.tableBody.innerHTML = selected
    .map(
      (athlete) => `
        <tr>
          <td>${escapeHtml(athlete.athleteName)}<br /><span class="muted">BIB ${escapeHtml(athlete.bib)}</span></td>
          <td>${escapeHtml(athlete.country)}</td>
          <td>${escapeHtml(athlete.division)}</td>
          <td>${formatRank(athlete.overallRank)}</td>
          <td>${formatDuration(athlete.totalSec)}</td>
          <td>${formatDuration(athlete.swimSec)}</td>
          <td>${formatDuration(athlete.bikeSec)}</td>
          <td>${formatDuration(athlete.runSec)}</td>
          <td>${formatDuration(athlete.t1Sec)}</td>
          <td>${formatDuration(athlete.t2Sec)}</td>
        </tr>
      `,
    )
    .join("");

  dom.comparisonCards.innerHTML = selected
    .map(
      (athlete) => `
        <article class="comparison-card">
          <div class="comparison-card-head">
            <h4>${escapeHtml(athlete.athleteName)}</h4>
            <span>${formatRank(athlete.overallRank)}</span>
          </div>
          <p class="muted">${escapeHtml(athlete.country)} · BIB ${escapeHtml(athlete.bib)} · ${escapeHtml(athlete.division)}</p>
          <div class="comparison-card-grid">
            <p><span>Total</span><strong>${formatDuration(athlete.totalSec)}</strong></p>
            <p><span>Swim</span><strong>${formatDuration(athlete.swimSec)}</strong></p>
            <p><span>Bike</span><strong>${formatDuration(athlete.bikeSec)}</strong></p>
            <p><span>Run</span><strong>${formatDuration(athlete.runSec)}</strong></p>
            <p><span>T1</span><strong>${formatDuration(athlete.t1Sec)}</strong></p>
            <p><span>T2</span><strong>${formatDuration(athlete.t2Sec)}</strong></p>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderCharts() {
  const selected = selectedAthletes();
  const ChartLib = window.Chart;
  const isMobile = isMobileViewport();
  const isVerySmall = window.matchMedia("(max-width: 430px)").matches;

  if (!ChartLib) {
    return;
  }

  if (totalChart) {
    totalChart.destroy();
  }

  if (splitChart) {
    splitChart.destroy();
  }

  totalChart = new ChartLib(dom.totalChartCanvas, {
    type: "bar",
    data: {
      labels: selected.map((athlete) => shortName(athlete.athleteName)),
      datasets: [
        {
          label: "Total Time (min)",
          data: selected.map((athlete) => (Number.isFinite(athlete.totalSec) ? Number((athlete.totalSec / 60).toFixed(1)) : null)),
          borderRadius: 8,
          backgroundColor: selected.map((_, index) => palette[index % palette.length]),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: isMobile ? "x" : "y",
      scales: {
        x: {
          ticks: { color: "#deefff", font: { size: isVerySmall ? 10 : 11 } },
          grid: { color: "rgba(173,197,214,0.18)" },
        },
        y: {
          ticks: { color: "#deefff", font: { size: isVerySmall ? 10 : 11 } },
          grid: { display: false },
        },
      },
      plugins: {
        legend: { display: false, labels: { color: "#eff9ff" } },
      },
      animation: { duration: 760, easing: "easeOutQuart" },
    },
  });

  const benchmarkDataset = {
    label: "Field Average (preload)",
    data: SPLIT_KEYS.map((splitKey) => toSplitScore(state.splitBenchmarks[splitKey]?.average, state.splitBenchmarks[splitKey])),
    rawTimes: SPLIT_KEYS.map((splitKey) => state.splitBenchmarks[splitKey]?.average ?? null),
    fill: false,
    borderDash: [6, 4],
    borderColor: "#ffffff",
    pointBackgroundColor: "#ffffff",
    pointBorderColor: "#ffffff",
    pointRadius: 3,
    borderWidth: 2,
  };

  const athleteDatasets = selected.map((athlete, index) => ({
    label: shortName(athlete.athleteName),
    data: SPLIT_KEYS.map((splitKey) => toSplitScore(athlete[`${splitKey}Sec`], state.splitBenchmarks[splitKey])),
    rawTimes: SPLIT_KEYS.map((splitKey) => athlete[`${splitKey}Sec`]),
    fill: true,
    backgroundColor: `${palette[index % palette.length]}2d`,
    borderColor: palette[index % palette.length],
    pointBackgroundColor: palette[index % palette.length],
    borderWidth: 2,
    pointRadius: 3,
  }));

  splitChart = new ChartLib(dom.splitChartCanvas, {
    type: "radar",
    data: {
      labels: SPLIT_KEYS.map((splitKey) => SPLIT_LABELS[splitKey]),
      datasets: [benchmarkDataset, ...athleteDatasets],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          angleLines: { color: "rgba(173,197,214,0.22)" },
          grid: { color: "rgba(173,197,214,0.2)" },
          pointLabels: {
            color: "#deefff",
            font: { size: isVerySmall ? 10 : isMobile ? 11 : 12 },
          },
          ticks: {
            color: "#b9d4e8",
            backdropColor: "transparent",
            stepSize: isMobile ? 25 : 20,
            display: !isVerySmall,
            callback: (value) => `${value}%`,
          },
        },
      },
      plugins: {
        legend: {
          position: isMobile ? "bottom" : "top",
          labels: {
            color: "#eff9ff",
            boxWidth: isVerySmall ? 8 : 12,
            font: { size: isVerySmall ? 10 : 11 },
          },
        },
        tooltip: {
          bodyFont: { size: isVerySmall ? 11 : 12 },
          titleFont: { size: isVerySmall ? 11 : 12 },
          callbacks: {
            label: (context) => {
              const dataset = context.dataset;
              const raw = dataset.rawTimes?.[context.dataIndex];
              if (!Number.isFinite(raw)) {
                return `${dataset.label}: N/A`;
              }
              return `${dataset.label}: ${formatDuration(raw)} (Score ${context.raw})`;
            },
            afterLabel: (context) => {
              const splitKey = SPLIT_KEYS[context.dataIndex];
              const benchmark = state.splitBenchmarks[splitKey];
              if (!benchmark || !Number.isFinite(benchmark.fastest)) {
                return "";
              }
              return [
                `Fastest: ${formatDuration(benchmark.fastest)}`,
                `Average: ${formatDuration(benchmark.average)}`,
                `Slowest: ${formatDuration(benchmark.slowest)}`,
              ];
            },
          },
        },
      },
      animation: { duration: 760, easing: "easeOutQuart" },
    },
  });
}

function renderAll() {
  applyFilters();
  renderPickerList();
  renderPills();
  renderTable();
  renderCharts();
}

function toggleSelection(id, forceValue = null) {
  const nextChecked = forceValue === null ? !state.selectedIds.has(id) : Boolean(forceValue);

  if (nextChecked && !state.selectedIds.has(id) && state.selectedIds.size >= MAX_SELECTION) {
    alert(`You can compare up to ${MAX_SELECTION} athletes at once.`);
    return;
  }

  if (nextChecked) {
    state.selectedIds.add(id);
  } else {
    state.selectedIds.delete(id);
  }

  syncStorage();
  renderAll();
}

function bindEvents() {
  [dom.searchInput, dom.divisionFilter, dom.countryFilter].forEach((element) => {
    element.addEventListener("input", renderAll);
    element.addEventListener("change", renderAll);
  });

  dom.athleteList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[type='checkbox'][data-id]");
    if (!checkbox) {
      return;
    }
    toggleSelection(checkbox.dataset.id, checkbox.checked);
  });

  dom.athleteList.addEventListener("click", (event) => {
    const checkbox = event.target.closest("input[type='checkbox'][data-id]");
    if (checkbox) {
      return;
    }
    const row = event.target.closest(".athlete-row[data-id]");
    if (!row) {
      return;
    }
    toggleSelection(row.dataset.id);
  });

  dom.selectedPills.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-id]");
    if (!button) {
      return;
    }
    toggleSelection(button.dataset.removeId, false);
  });

  dom.clearBtn.addEventListener("click", () => {
    setSelection([]);
    renderAll();
  });

  dom.togglePickerBtn.addEventListener("click", () => {
    updatePickerCollapsed(!state.pickerCollapsed);
  });

  window.addEventListener("resize", () => {
    if (!isMobileViewport() && state.pickerCollapsed) {
      updatePickerCollapsed(false);
    }
  });
}

function introMotion() {
  if (!window.gsap) {
    return;
  }
  gsap.fromTo(
    ".site-top, .hero, .panel, .chart-card",
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.45, stagger: 0.05, ease: "power2.out" },
  );
}

async function bootstrap() {
  try {
    state.allAthletes = await loadAthletes();
    state.splitBenchmarks = buildSplitBenchmarks(state.allAthletes);

    const { divisions, countries } = getFilterValues(state.allAthletes);

    fillSelect(dom.divisionFilter, divisions, "Divisions");
    fillSelect(dom.countryFilter, countries, "Countries");

    const validIds = new Set(state.allAthletes.map((athlete) => athlete.id));
    const restored = readStoredSelection().filter((id) => validIds.has(id));

    if (restored.length) {
      setSelection(restored);
    } else {
      const defaults = applyFiltersAndSort(state.allAthletes, { sortBy: "overall" })
        .slice(0, 4)
        .map((athlete) => athlete.id);
      setSelection(defaults);
    }

    updatePickerCollapsed(isMobileViewport());

    renderAll();
    bindEvents();
    introMotion();
  } catch (error) {
    console.error(error);
    const reason = error instanceof Error ? error.message : "unknown error";
    dom.athleteList.innerHTML = `<div class="empty-state">Unable to load comparison data. (${escapeHtml(reason)})</div>`;
    dom.tableBody.innerHTML = '<tr><td colspan="10" class="muted">Dataset failed to load.</td></tr>';
  }
}

bootstrap();
