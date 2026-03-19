# IRONMAN 70.3 Analyzer

Two-page web app with a redesigned animated UI for athlete inventory and side-by-side comparison analytics.

## Pages
- `index.html` (Page 1: Athlete Inventory)
  - Browse full roster with search/filter/sort
  - Select one or multiple athletes
  - Display complete details for every selected athlete
- `comparison.html` (Page 2: Comparison Lab)
  - Shared selection state from Page 1
  - Total-time and split comparison charts
  - Side-by-side detail table

## NPM Local Deployment
From this folder:

```bash
npm install
npm run deploy:local
```

Then open:
- http://127.0.0.1:4273/
- http://127.0.0.1:4273/index.html
- http://127.0.0.1:4273/comparison.html

## Development Mode
```bash
npm run dev
```
Open:
- http://127.0.0.1:5173/
- http://127.0.0.1:5173/index.html
- http://127.0.0.1:5173/comparison.html

## Data Inputs
- Preloaded dataset: `./public/data/hengqin-results.txt`
- File format: tab-separated plain text (TSV), generated from your Hengqin workbook

The app loads this file automatically at startup.

## Regenerate Preloaded Text Data
```bash
python3 ./scripts/convert_xlsx_to_tsv.py \
  "/Users/alanleung/Downloads/2026 IRONMAN 70.3 Hengqin_record_T_2.xlsx" \
  "./public/data/hengqin-results.txt"
```
