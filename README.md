# IRONMAN 70.3 Analyzer

Interactive two-page race analytics web app for preloaded IRONMAN 70.3 result data.

## Live Website
- https://fatlungodev.github.io/ironman-analyzer/
- https://fatlungodev.github.io/ironman-analyzer/index.html
- https://fatlungodev.github.io/ironman-analyzer/comparison.html

## Feature Summary
### 1) Athlete Inventory (`index.html`)
- Full athlete roster browsing from preloaded dataset
- Search by name or BIB
- Filter by division and country
- Sort by overall rank, total time, swim, bike, run
- Multi-select athletes and persist selection
- Detailed cards for selected athletes:
  - Overall/Gender/Division rank
  - Total time + Swim/Bike/Run/T1/T2
  - Split ratio bars
- KPI cards (calculated from **current filtered roster**):
  - Filtered Athletes
  - Average Finish
  - Avg. Swim / Avg. Bike / Avg. Run
  - Fastest Overall
  - Best Swim / Bike / Run split

### 2) Comparison Lab (`comparison.html`)
- Shares selected athletes from Inventory via `localStorage`
- Athlete picker with filter/search
- Total Time horizontal bar chart
- Split Breakdown 5-axis radar chart
- Side-by-side comparison table for selected athletes

### 3) Split Breakdown Radar Benchmark
- Radar chart uses **preloaded full dataset** as benchmark source
- For each split (Swim, Bike, Run, T1, T2), benchmark includes:
  - Fastest
  - Average
  - Slowest
- Athlete split values are normalized to score (0-100), where faster = higher score
- Tooltip displays raw athlete time + benchmark values

### 4) Data Quality Rules
- Records are excluded if:
  - `Total Time` is `00:00:00` or non-positive
  - `Overall Rank` is `99999`
- Zero split values are not treated as valid “best” values

### 5) UI / UX
- Animated glass-style UI with gradient atmosphere
- Desktop layout preserved
- Mobile responsive support optimized for:
  - General small screens
  - iPhone 16 Pro / iPhone 16 Pro Max
  - Comparison chart/table readability
- Footer credit shown on both pages:
  - `This Website made by Alan Leung 🇭🇰`

## Technical Specification
- Frontend: Vanilla HTML/CSS/JS (ES modules)
- Build tool: Vite
- Charts: Chart.js
- Motion: GSAP
- Multi-page build inputs:
  - `index.html`
  - `comparison.html`
- Shared logic:
  - `data-model.js` (loading, parsing, filtering, formatting, storage utilities)
- Data source:
  - `public/data/hengqin-results.txt` (TSV plain text, preloaded at startup)

## Runtime Requirements
- Node.js (recommended: 20+)
- npm (recommended: 10+)
- Python 3 (for dataset regeneration script)
- Modern browser with ES module support

## Local Development
```bash
npm install
npm run dev
```

Open:
- http://127.0.0.1:5173/
- http://127.0.0.1:5173/index.html
- http://127.0.0.1:5173/comparison.html

## Local Production Preview
```bash
npm run deploy:local
```

Open:
- http://127.0.0.1:4273/

## Deployment Requirement (GitHub Pages)
- Repo visibility: public
- Auto deploy on push to `main`
- Workflow file: `./.github/workflows/deploy-pages.yml`
- Vite base path is configured for project pages deployment

## Regenerate Preloaded Text Data
```bash
python3 ./scripts/convert_xlsx_to_tsv.py \
  "/Users/alanleung/Downloads/2026 IRONMAN 70.3 Hengqin_record_T_2.xlsx" \
  "./public/data/hengqin-results.txt"
```
