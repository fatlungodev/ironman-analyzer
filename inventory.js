import {
  SPLIT_KEYS,
  SPLIT_LABELS,
  applyFiltersAndSort,
  computeOverview,
  formatDuration,
  formatRank,
  getFilterValues,
  loadAthletes,
  readStoredSelection,
  shortName,
  splitPercentages,
  storeSelection,
} from "./data-model.js";

const MAX_SELECTION = 10;

const dom = {
  sourceLabel: document.getElementById("sourceLabel"),
  searchInput: document.getElementById("searchInput"),
  divisionFilter: document.getElementById("divisionFilter"),
  countryFilter: document.getElementById("countryFilter"),
  sortSelect: document.getElementById("sortSelect"),
  kpiGrid: document.getElementById("kpiGrid"),
  athleteList: document.getElementById("athleteList"),
  resultCount: document.getElementById("resultCount"),
  selectedCountLine: document.getElementById("selectedCountLine"),
  selectedPills: document.getElementById("selectedPills"),
  selectedDetails: document.getElementById("selectedDetails"),
  detailCount: document.getElementById("detailCount"),
  compareLink: document.getElementById("compareLink"),
  clearSelectionBtn: document.getElementById("clearSelectionBtn"),
  selectVisibleBtn: document.getElementById("selectVisibleBtn"),
};

const state = {
  allAthletes: [],
  filteredAthletes: [],
  selectedIds: new Set(),
};

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

function syncStoredSelection() {
  storeSelection(Array.from(state.selectedIds));
}

function setSelection(ids) {
  state.selectedIds = new Set(ids.slice(0, MAX_SELECTION));
  syncStoredSelection();
}

function applyFilters() {
  state.filteredAthletes = applyFiltersAndSort(state.allAthletes, {
    searchText: dom.searchInput.value,
    division: dom.divisionFilter.value,
    country: dom.countryFilter.value,
    sortBy: dom.sortSelect.value,
  });
}

function renderKpis() {
  const overview = computeOverview(state.allAthletes);
  dom.kpiGrid.innerHTML = `
    <article class="kpi-card">
      <p class="label">Participants</p>
      <p class="value">${overview.participants.toLocaleString()}</p>
    </article>
    <article class="kpi-card">
      <p class="label">Average Finish</p>
      <p class="value">${formatDuration(overview.averageTotal)}</p>
    </article>
    <article class="kpi-card">
      <p class="label">Fastest Overall</p>
      <p class="value">${formatDuration(overview.fastest?.totalSec)}</p>
      <p class="helper">${escapeHtml(shortName(overview.fastest?.athleteName ?? "--"))}</p>
    </article>
    <article class="kpi-card">
      <p class="label">Best Swim Split</p>
      <p class="value">${formatDuration(overview.bestSwim?.swimSec)}</p>
      <p class="helper">${escapeHtml(shortName(overview.bestSwim?.athleteName ?? "--"))}</p>
    </article>
    <article class="kpi-card">
      <p class="label">Best Bike Split</p>
      <p class="value">${formatDuration(overview.bestBike?.bikeSec)}</p>
      <p class="helper">${escapeHtml(shortName(overview.bestBike?.athleteName ?? "--"))}</p>
    </article>
    <article class="kpi-card">
      <p class="label">Best Run Split</p>
      <p class="value">${formatDuration(overview.bestRun?.runSec)}</p>
      <p class="helper">${escapeHtml(shortName(overview.bestRun?.athleteName ?? "--"))}</p>
    </article>
  `;
}

function renderAthleteList() {
  dom.resultCount.textContent = `${state.filteredAthletes.length.toLocaleString()} results`;

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

function renderSelectedPills() {
  const selected = selectedAthletes();
  dom.selectedCountLine.textContent = `${selected.length} selected (max ${MAX_SELECTION})`;
  dom.compareLink.textContent = `Compare ${selected.length} selected athlete${selected.length === 1 ? "" : "s"}`;

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
  [dom.searchInput, dom.divisionFilter, dom.countryFilter, dom.sortSelect].forEach((element) => {
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
    state.allAthletes = await loadAthletes();
    const { divisions, countries } = getFilterValues(state.allAthletes);

    fillSelect(dom.divisionFilter, divisions, "Divisions");
    fillSelect(dom.countryFilter, countries, "Countries");

    const validIds = new Set(state.allAthletes.map((athlete) => athlete.id));
    const restored = readStoredSelection().filter((id) => validIds.has(id));

    if (restored.length) {
      setSelection(restored);
    } else if (state.allAthletes[0]) {
      setSelection([state.allAthletes[0].id]);
    }

    dom.sourceLabel.textContent = `Preloaded: Hengqin text dataset (${state.allAthletes.length.toLocaleString()} athletes)`;

    renderKpis();
    renderAll();
    bindEvents();
    introMotion();
  } catch (error) {
    console.error(error);
    dom.sourceLabel.textContent = "Failed to load preloaded dataset";
    dom.athleteList.innerHTML = '<div class="empty-state">Unable to load athlete inventory.</div>';
    dom.selectedDetails.innerHTML = '<div class="empty-state">No details available.</div>';
  }
}

bootstrap();
