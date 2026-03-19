const DATASET_PATH = `${import.meta.env.BASE_URL}data/hengqin-results.txt`;
const SELECTION_STORAGE_KEY = "ironman:selected-athletes";
export const MAX_SELECTION = 10;

export const SPLIT_KEYS = ["swim", "bike", "run", "t1", "t2"];
export const SPLIT_LABELS = {
  swim: "Swim",
  bike: "Bike",
  run: "Run",
  t1: "T1",
  t2: "T2",
};

let cachedAthletes = null;

function normalizeHeader(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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

function isPositiveTime(value) {
  return Number.isFinite(value) && value > 0;
}

function inferGenderFromDivision(division) {
  const normalized = String(division ?? "")
    .trim()
    .toUpperCase();

  if (normalized.startsWith("M")) {
    return "Male";
  }
  if (normalized.startsWith("F")) {
    return "Female";
  }
  return "Unknown";
}

function shouldIgnoreAthlete(athlete) {
  if (!athlete) {
    return true;
  }
  if (athlete.overallRank === 99999) {
    return true;
  }
  if (!isPositiveTime(athlete.totalSec)) {
    return true;
  }
  return false;
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

function normalizeAthlete(row, rowIndex) {
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
  const gender = inferGenderFromDivision(division);

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

  const token = `${athleteName}-${bib}-${rowIndex}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");

  return {
    id: token,
    athleteName,
    country,
    bib,
    division,
    gender,
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

function assertStorage() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

export async function loadAthletes({ forceReload = false } = {}) {
  if (cachedAthletes && !forceReload) {
    return cachedAthletes;
  }

  const response = await fetch(DATASET_PATH);
  if (!response.ok) {
    throw new Error(`Unable to load dataset (${response.status})`);
  }

  const text = await response.text();
  const rows = parseTabSeparatedText(text);
  const athletes = rows.map((row, index) => normalizeAthlete(row, index)).filter((athlete) => !shouldIgnoreAthlete(athlete));

  cachedAthletes = athletes;
  return athletes;
}

export function formatDuration(seconds) {
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

export function formatRank(rank) {
  if (!Number.isFinite(rank) || rank <= 0 || rank >= 99999) {
    return "--";
  }
  return `#${Math.round(rank)}`;
}

export function shortName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length <= 2) {
    return parts.join(" ");
  }
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function getFilterValues(athletes) {
  const divisions = [...new Set(athletes.map((athlete) => athlete.division).filter((value) => value && value !== "--"))].sort();
  const countries = [...new Set(athletes.map((athlete) => athlete.country).filter((value) => value && value !== "--"))].sort();
  const genderOrder = { Male: 0, Female: 1, Unknown: 2 };
  const genders = [...new Set(athletes.map((athlete) => athlete.gender).filter((value) => value))]
    .sort((a, b) => (genderOrder[a] ?? 99) - (genderOrder[b] ?? 99) || a.localeCompare(b));
  return { divisions, countries, genders };
}

export function applyFiltersAndSort(athletes, { searchText = "", division = "all", gender = "all", country = "all", sortBy = "overall" }) {
  const query = String(searchText).trim().toLowerCase();

  const filtered = athletes.filter((athlete) => {
    const searchTarget = `${athlete.athleteName} ${athlete.bib}`.toLowerCase();
    const matchesSearch = !query || searchTarget.includes(query);
    const matchesDivision = division === "all" || athlete.division === division;
    const matchesGender = gender === "all" || athlete.gender === gender;
    const matchesCountry = country === "all" || athlete.country === country;
    return matchesSearch && matchesDivision && matchesGender && matchesCountry;
  });

  const sorters = {
    overall: (a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER),
    totalAsc: (a, b) =>
      (isPositiveTime(a.totalSec) ? a.totalSec : Number.MAX_SAFE_INTEGER) -
      (isPositiveTime(b.totalSec) ? b.totalSec : Number.MAX_SAFE_INTEGER),
    totalDesc: (a, b) =>
      (isPositiveTime(b.totalSec) ? b.totalSec : Number.MIN_SAFE_INTEGER) -
      (isPositiveTime(a.totalSec) ? a.totalSec : Number.MIN_SAFE_INTEGER),
    swim: (a, b) =>
      (isPositiveTime(a.swimSec) ? a.swimSec : Number.MAX_SAFE_INTEGER) -
      (isPositiveTime(b.swimSec) ? b.swimSec : Number.MAX_SAFE_INTEGER),
    bike: (a, b) =>
      (isPositiveTime(a.bikeSec) ? a.bikeSec : Number.MAX_SAFE_INTEGER) -
      (isPositiveTime(b.bikeSec) ? b.bikeSec : Number.MAX_SAFE_INTEGER),
    run: (a, b) =>
      (isPositiveTime(a.runSec) ? a.runSec : Number.MAX_SAFE_INTEGER) -
      (isPositiveTime(b.runSec) ? b.runSec : Number.MAX_SAFE_INTEGER),
  };

  filtered.sort(sorters[sortBy] || sorters.overall);
  return filtered;
}

export function computeOverview(athletes) {
  const validTotals = athletes.filter((athlete) => isPositiveTime(athlete.totalSec));
  const validSwims = athletes.filter((athlete) => isPositiveTime(athlete.swimSec));
  const validBikes = athletes.filter((athlete) => isPositiveTime(athlete.bikeSec));
  const validRuns = athletes.filter((athlete) => isPositiveTime(athlete.runSec));

  const averageTotal = validTotals.reduce((sum, athlete) => sum + athlete.totalSec, 0) / Math.max(1, validTotals.length);
  const averageSwim = validSwims.reduce((sum, athlete) => sum + athlete.swimSec, 0) / Math.max(1, validSwims.length);
  const averageBike = validBikes.reduce((sum, athlete) => sum + athlete.bikeSec, 0) / Math.max(1, validBikes.length);
  const averageRun = validRuns.reduce((sum, athlete) => sum + athlete.runSec, 0) / Math.max(1, validRuns.length);
  const fastest = [...validTotals].sort((a, b) => a.totalSec - b.totalSec)[0] || null;
  const bestSwim = [...validSwims].sort((a, b) => a.swimSec - b.swimSec)[0] || null;
  const bestBike = [...validBikes].sort((a, b) => a.bikeSec - b.bikeSec)[0] || null;
  const bestRun = [...validRuns].sort((a, b) => a.runSec - b.runSec)[0] || null;

  return {
    participants: athletes.length,
    averageTotal,
    averageSwim,
    averageBike,
    averageRun,
    fastest,
    bestSwim,
    bestBike,
    bestRun,
  };
}

export function readStoredSelection() {
  if (!assertStorage()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function storeSelection(ids) {
  if (!assertStorage()) {
    return;
  }
  try {
    const normalized = Array.from(new Set(ids)).slice(0, MAX_SELECTION);
    window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage failures (private mode / policy restrictions).
  }
}

export function splitPercentages(athlete) {
  const total = athlete.totalSec || 1;
  return SPLIT_KEYS.map((key) => {
    const seconds = athlete[`${key}Sec`];
    const ratio = Number.isFinite(seconds) ? Math.min(100, Math.max(0, (seconds / total) * 100)) : 0;
    return {
      key,
      label: SPLIT_LABELS[key],
      seconds,
      ratio,
    };
  });
}
