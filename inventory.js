import {
  MAX_SELECTION,
  SPLIT_KEYS,
  SPLIT_LABELS,
  applyFiltersAndSort,
  computeOverview,
  formatDuration,
  formatRank,
  getFilterValues,
  listDatasets,
  loadAthletes,
  readStoredDatasetId,
  readStoredSelection,
  resolveDatasetId,
  shortName,
  storeDatasetId,
  splitPercentages,
  storeSelection,
} from "./data-model.js";

const dom = {
  datasetSelect: document.getElementById("datasetSelect"),
  comparisonNavLink: document.getElementById("invComparisonNavLink"),
  searchInput: document.getElementById("searchInput"),
  divisionFilter: document.getElementById("divisionFilter"),
  genderFilter: document.getElementById("genderFilter"),
  countryFilter: document.getElementById("countryFilter"),
  sortSelect: document.getElementById("sortSelect"),
  inventoryLayout: document.getElementById("inventoryLayout"),
  kpiGrid: document.getElementById("kpiGrid"),
  heroCompareLink: document.getElementById("heroCompareLink"),
  openComparisonLink: document.getElementById("openComparisonLink"),
  toggleColumnsBtn: document.getElementById("toggleColumnsBtn"),
  columnPicker: document.getElementById("columnPicker"),
  athleteList: document.getElementById("athleteList"),
  resultCount: document.getElementById("resultCount"),
  expandDetailsBtn: document.getElementById("expandDetailsBtn"),
  selectedCountLine: document.getElementById("selectedCountLine"),
  selectedPills: document.getElementById("selectedPills"),
  detailPanel: document.getElementById("detailPanel"),
  toggleDetailsBtn: document.getElementById("toggleDetailsBtn"),
  selectedDetails: document.getElementById("selectedDetails"),
  detailCount: document.getElementById("detailCount"),
  compareLink: document.getElementById("compareLink"),
  clearSelectionBtn: document.getElementById("clearSelectionBtn"),
  selectVisibleBtn: document.getElementById("selectVisibleBtn"),
};

const state = {
  activeDatasetId: "",
  allAthletes: [],
  filteredAthletes: [],
  selectedIds: new Set(),
  datasetSwitchToken: 0,
  detailsCollapsed: false,
  columnPickerOpen: false,
  visibleColumns: {
    overall: true,
    swim: false,
    bike: false,
    run: false,
    t1: false,
    t2: false,
    total: true,
  },
};

const ROSTER_METRIC_COLUMNS = [
  { key: "overall", label: "Overall", format: (athlete) => formatRank(athlete.overallRank) },
  { key: "swim", label: "Swim", format: (athlete) => formatDuration(athlete.swimSec) },
  { key: "bike", label: "Bike", format: (athlete) => formatDuration(athlete.bikeSec) },
  { key: "run", label: "Run", format: (athlete) => formatDuration(athlete.runSec) },
  { key: "t1", label: "T1", format: (athlete) => formatDuration(athlete.t1Sec) },
  { key: "t2", label: "T2", format: (athlete) => formatDuration(athlete.t2Sec) },
  { key: "total", label: "Total", format: (athlete) => formatDuration(athlete.totalSec) },
];

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

function fillDatasetSelect(select, datasets, datasetId) {
  const resolvedId = resolveDatasetId(datasetId);
  select.innerHTML = "";

  datasets.forEach((dataset) => {
    const option = document.createElement("option");
    option.value = dataset.id;
    option.textContent = dataset.label;
    select.append(option);
  });

  select.value = resolvedId;
}

function readDatasetFromQuery() {
  try {
    const queryId = new URLSearchParams(window.location.search).get("dataset");
    return queryId ? resolveDatasetId(queryId) : "";
  } catch {
    return "";
  }
}

function syncDatasetQuery(datasetId) {
  const resolvedId = resolveDatasetId(datasetId);
  try {
    const current = new URL(window.location.href);
    if (current.searchParams.get("dataset") === resolvedId) {
      return;
    }
    current.searchParams.set("dataset", resolvedId);
    const nextRelative = `${current.pathname}${current.search}${current.hash}`;
    window.history.replaceState({}, "", nextRelative);
  } catch {
    // Ignore URL update failures.
  }
}

function buildDatasetAwareHref(path, datasetId) {
  try {
    const url = new URL(path, window.location.href);
    url.searchParams.set("dataset", resolveDatasetId(datasetId));
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

function updateComparisonLinks(datasetId) {
  const href = buildDatasetAwareHref("./comparison.html", datasetId);
  [dom.comparisonNavLink, dom.heroCompareLink, dom.openComparisonLink, dom.compareLink].forEach((link) => {
    if (link) {
      link.setAttribute("href", href);
    }
  });
}

function selectedAthletes() {
  return Array.from(state.selectedIds)
    .map((id) => state.allAthletes.find((athlete) => athlete.id === id))
    .filter(Boolean)
    .sort((a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER));
}

function syncStoredSelection() {
  storeSelection(Array.from(state.selectedIds), state.activeDatasetId);
}

function setSelection(ids) {
  state.selectedIds = new Set(ids.slice(0, MAX_SELECTION));
  syncStoredSelection();
}

function updateColumnPicker(open) {
  state.columnPickerOpen = Boolean(open);
  dom.columnPicker.hidden = !state.columnPickerOpen;
  dom.toggleColumnsBtn.setAttribute("aria-expanded", String(state.columnPickerOpen));
}

function syncColumnPickerUI() {
  dom.columnPicker.querySelectorAll("input[type='checkbox'][data-column]").forEach((checkbox) => {
    checkbox.checked = Boolean(state.visibleColumns[checkbox.dataset.column]);
  });
}

function ensureSortColumnVisible() {
  const sortColumnMap = { swim: "swim", bike: "bike", run: "run", t1: "t1", t2: "t2" };
  const sortColumn = sortColumnMap[dom.sortSelect.value];
  if (sortColumn && !state.visibleColumns[sortColumn]) {
    state.visibleColumns[sortColumn] = true;
    syncColumnPickerUI();
  }
}

function updateDetailsCollapsed(collapsed) {
  state.detailsCollapsed = Boolean(collapsed);
  dom.inventoryLayout.classList.toggle("details-collapsed", state.detailsCollapsed);
  dom.detailPanel.classList.toggle("is-collapsed", state.detailsCollapsed);
  dom.toggleDetailsBtn.textContent = "Collapse";
  dom.toggleDetailsBtn.setAttribute("aria-expanded", "true");
  dom.expandDetailsBtn.hidden = !state.detailsCollapsed;
  dom.expandDetailsBtn.setAttribute("aria-expanded", String(!state.detailsCollapsed));
}

async function switchDataset(nextDatasetId) {
  const requestedDatasetId = resolveDatasetId(nextDatasetId);
  const previousDatasetId = state.activeDatasetId ? resolveDatasetId(state.activeDatasetId) : "";
  const requestToken = ++state.datasetSwitchToken;

  dom.datasetSelect.disabled = true;
  dom.datasetSelect.value = requestedDatasetId;

  try {
    const athletes = await loadAthletes({ datasetId: requestedDatasetId });
    if (requestToken !== state.datasetSwitchToken) {
      return false;
    }

    state.activeDatasetId = requestedDatasetId;
    state.allAthletes = athletes;

    storeDatasetId(state.activeDatasetId);
    syncDatasetQuery(state.activeDatasetId);
    updateComparisonLinks(state.activeDatasetId);

    const { divisions, genders, countries } = getFilterValues(state.allAthletes);
    fillSelect(dom.divisionFilter, divisions, "Divisions");
    fillSelect(dom.genderFilter, genders, "Genders");
    fillSelect(dom.countryFilter, countries, "Countries");

    const validIds = new Set(state.allAthletes.map((athlete) => athlete.id));
    const restored = readStoredSelection(state.activeDatasetId).filter((id) => validIds.has(id));

    if (restored.length) {
      setSelection(restored);
    } else if (state.allAthletes[0]) {
      setSelection([state.allAthletes[0].id]);
    } else {
      setSelection([]);
    }

    ensureSortColumnVisible();
    updateDetailsCollapsed(false);
    renderAll();
    return true;
  } catch (error) {
    if (requestToken === state.datasetSwitchToken) {
      dom.datasetSelect.value = previousDatasetId || requestedDatasetId;
      updateComparisonLinks(previousDatasetId || requestedDatasetId);
    }
    throw error;
  } finally {
    if (requestToken === state.datasetSwitchToken) {
      dom.datasetSelect.disabled = false;
    }
  }
}

function applyFilters() {
  state.filteredAthletes = applyFiltersAndSort(state.allAthletes, {
    searchText: dom.searchInput.value,
    division: dom.divisionFilter.value,
    gender: dom.genderFilter.value,
    country: dom.countryFilter.value,
    sortBy: dom.sortSelect.value,
  });
}

function renderKpis() {
  const overview = computeOverview(state.filteredAthletes);
  const hasFilteredResults = overview.participants > 0;
  const averageDisplay = hasFilteredResults ? formatDuration(overview.averageTotal) : "--";
  const averageSwim = hasFilteredResults ? formatDuration(overview.averageSwim) : "--";
  const averageBike = hasFilteredResults ? formatDuration(overview.averageBike) : "--";
  const averageRun = hasFilteredResults ? formatDuration(overview.averageRun) : "--";

  dom.kpiGrid.innerHTML = `
    <article class="kpi-card">
      <p class="label">Filtered Athletes</p>
      <p class="value">${overview.participants.toLocaleString()}</p>
      <p class="helper">of ${state.allAthletes.length.toLocaleString()} total</p>
    </article>
    <article class="kpi-card">
      <p class="label">Average Finish</p>
      <p class="value">${averageDisplay}</p>
      <div class="avg-splits">
        <p><span>Avg. Swim</span><strong>${averageSwim}</strong></p>
        <p><span>Avg. Bike</span><strong>${averageBike}</strong></p>
        <p><span>Avg. Run</span><strong>${averageRun}</strong></p>
      </div>
    </article>
    <article class="kpi-card">
      <p class="label">Fastest Overall</p>
      <p class="value">${formatDuration(overview.fastest?.totalSec)}</p>
      <p class="helper">${escapeHtml(overview.fastest?.athleteName ?? "--")}</p>
    </article>
    <article class="kpi-card">
      <p class="label">Best Swim Split</p>
      <p class="value">${formatDuration(overview.bestSwim?.swimSec)}</p>
      <p class="helper">${escapeHtml(overview.bestSwim?.athleteName ?? "--")}</p>
    </article>
    <article class="kpi-card">
      <p class="label">Best Bike Split</p>
      <p class="value">${formatDuration(overview.bestBike?.bikeSec)}</p>
      <p class="helper">${escapeHtml(overview.bestBike?.athleteName ?? "--")}</p>
    </article>
    <article class="kpi-card">
      <p class="label">Best Run Split</p>
      <p class="value">${formatDuration(overview.bestRun?.runSec)}</p>
      <p class="helper">${escapeHtml(overview.bestRun?.athleteName ?? "--")}</p>
    </article>
  `;
}

function renderAthleteList() {
  dom.resultCount.textContent = `${state.filteredAthletes.length.toLocaleString()} results`;

  if (!state.filteredAthletes.length) {
    dom.athleteList.innerHTML = '<div class="empty-state">No athletes matched your filters.</div>';
    return;
  }

  const metricColumns = ROSTER_METRIC_COLUMNS.filter((column) => state.visibleColumns[column.key]);

  dom.athleteList.innerHTML = state.filteredAthletes
    .map((athlete) => {
      const selected = state.selectedIds.has(athlete.id);
      const metricCells = metricColumns
        .map(
          (column) => `
          <div class="mini-metric">
            <span>${column.label}</span>
            <strong>${column.format(athlete)}</strong>
          </div>
        `,
        )
        .join("");

      return `
        <article class="athlete-row ${selected ? "selected" : ""}" style="--metric-cols:${metricColumns.length}" data-id="${escapeHtml(
          athlete.id,
        )}">
          <label class="check-wrap">
            <input type="checkbox" data-id="${escapeHtml(athlete.id)}" ${selected ? "checked" : ""} />
          </label>
          <div class="identity">
            <strong>${escapeHtml(athlete.athleteName)}</strong>
            <span>${escapeHtml(athlete.country)} · BIB ${escapeHtml(athlete.bib)} · ${escapeHtml(athlete.division)}</span>
          </div>
          ${metricCells}
        </article>
      `;
    })
    .join("");
}

function renderSelectedPills() {
  const selected = selectedAthletes();
  dom.selectedCountLine.textContent = `${selected.length} selected (max ${MAX_SELECTION})`;
  const compareCtaText = `Compare ${selected.length} selected athlete${selected.length === 1 ? "" : "s"}`;
  dom.compareLink.textContent = compareCtaText;
  dom.heroCompareLink.textContent = compareCtaText;

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

function renderSelectedDetails() {
  const selected = selectedAthletes();
  dom.detailCount.textContent = `${selected.length} detail cards`;

  if (!selected.length) {
    dom.selectedDetails.innerHTML = '<div class="empty-state">Select one or multiple athletes to display all details.</div>';
    return;
  }

  dom.selectedDetails.innerHTML = selected
    .map((athlete) => {
      const splits = splitPercentages(athlete)
        .map(
          (split) => `
            <div class="split-row">
              <strong>${split.label}</strong>
              <div class="split-track"><div class="split-fill" style="width: ${split.ratio.toFixed(2)}%"></div></div>
              <span>${formatDuration(split.seconds)}</span>
            </div>
          `,
        )
        .join("");

      return `
        <article class="detail-card">
          <div class="detail-header">
            <div>
              <h3>${escapeHtml(athlete.athleteName)}</h3>
              <p class="detail-sub">${escapeHtml(athlete.country)} · BIB ${escapeHtml(athlete.bib)} · ${escapeHtml(athlete.division)}</p>
            </div>
            <span class="total-chip">Total ${formatDuration(athlete.totalSec)}</span>
          </div>

          <div class="detail-grid">
            <div class="cell"><span>Overall Rank</span><strong>${formatRank(athlete.overallRank)}</strong></div>
            <div class="cell"><span>Gender Rank</span><strong>${formatRank(athlete.genderRank)}</strong></div>
            <div class="cell"><span>Division Rank</span><strong>${formatRank(athlete.divRank)}</strong></div>
            <div class="cell"><span>Division</span><strong>${escapeHtml(athlete.division)}</strong></div>
            <div class="cell"><span>Swim</span><strong>${formatDuration(athlete.swimSec)}</strong></div>
            <div class="cell"><span>Bike</span><strong>${formatDuration(athlete.bikeSec)}</strong></div>
            <div class="cell"><span>Run</span><strong>${formatDuration(athlete.runSec)}</strong></div>
            <div class="cell"><span>T1 / T2</span><strong>${formatDuration(athlete.t1Sec)} / ${formatDuration(athlete.t2Sec)}</strong></div>
          </div>

          <div class="split-stack">${splits}</div>
        </article>
      `;
    })
    .join("");

  if (window.gsap) {
    gsap.fromTo(".detail-card", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, ease: "power2.out" });
  }
}

function renderAll() {
  applyFilters();
  renderKpis();
  renderAthleteList();
  renderSelectedPills();
  renderSelectedDetails();
}

function toggleSelection(id, forceValue = null) {
  const nextChecked = forceValue === null ? !state.selectedIds.has(id) : Boolean(forceValue);

  if (nextChecked && !state.selectedIds.has(id) && state.selectedIds.size >= MAX_SELECTION) {
    alert(`You can select up to ${MAX_SELECTION} athletes.`);
    return;
  }

  if (nextChecked) {
    state.selectedIds.add(id);
  } else {
    state.selectedIds.delete(id);
  }

  syncStoredSelection();
  renderAll();
}

function bindEvents() {
  dom.datasetSelect.addEventListener("change", async () => {
    try {
      await switchDataset(dom.datasetSelect.value);
    } catch (error) {
      console.error(error);
      alert("Unable to switch dataset right now.");
    }
  });

  [dom.searchInput, dom.divisionFilter, dom.genderFilter, dom.countryFilter].forEach((element) => {
    element.addEventListener("input", renderAll);
    element.addEventListener("change", renderAll);
  });

  dom.sortSelect.addEventListener("change", () => {
    ensureSortColumnVisible();
    renderAll();
  });

  dom.toggleColumnsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    updateColumnPicker(!state.columnPickerOpen);
  });

  dom.columnPicker.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  dom.columnPicker.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[type='checkbox'][data-column]");
    if (!checkbox) {
      return;
    }
    state.visibleColumns[checkbox.dataset.column] = checkbox.checked;
    renderAthleteList();
  });

  document.addEventListener("click", () => {
    if (state.columnPickerOpen) {
      updateColumnPicker(false);
    }
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

  dom.clearSelectionBtn.addEventListener("click", () => {
    setSelection([]);
    renderAll();
  });

  dom.selectVisibleBtn.addEventListener("click", () => {
    const nextIds = [...state.selectedIds];
    for (const athlete of state.filteredAthletes) {
      if (nextIds.length >= MAX_SELECTION) {
        break;
      }
      if (!nextIds.includes(athlete.id)) {
        nextIds.push(athlete.id);
      }
    }
    setSelection(nextIds);
    renderAll();
  });

  dom.toggleDetailsBtn.addEventListener("click", () => {
    updateDetailsCollapsed(true);
  });

  dom.expandDetailsBtn.addEventListener("click", () => {
    updateDetailsCollapsed(false);
  });
}

function introMotion() {
  if (!window.gsap) {
    return;
  }
  gsap.fromTo(
    ".site-top, .hero, .kpi-card, .panel",
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.42, stagger: 0.05, ease: "power2.out" },
  );
}

async function bootstrap() {
  try {
    const datasets = listDatasets();
    const queryDatasetId = readDatasetFromQuery();
    state.activeDatasetId = resolveDatasetId(queryDatasetId || readStoredDatasetId());
    fillDatasetSelect(dom.datasetSelect, datasets, state.activeDatasetId);
    updateComparisonLinks(state.activeDatasetId);

    await switchDataset(state.activeDatasetId);
    syncColumnPickerUI();
    updateColumnPicker(false);
    bindEvents();
    introMotion();
  } catch (error) {
    console.error(error);
    dom.datasetSelect.innerHTML = '<option value="">Failed to load dataset</option>';
    dom.datasetSelect.disabled = true;
    dom.athleteList.innerHTML = '<div class="empty-state">Unable to load athlete inventory.</div>';
    dom.selectedDetails.innerHTML = '<div class="empty-state">No details available.</div>';
  }
}

bootstrap();
