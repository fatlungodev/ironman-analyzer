#!/usr/bin/env python3
"""Convert an XLSX worksheet into a tab-separated plain text file (TSV)."""

from __future__ import annotations

import argparse
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def col_to_index(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref)
    letters = match.group(1) if match else "A"
    index = 0
    for ch in letters:
        index = index * 26 + (ord(ch) - 64)
    return index - 1


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []

    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for si in root.findall("a:si", NS):
        values.append("".join(node.text or "" for node in si.findall(".//a:t", NS)))
    return values


def resolve_first_sheet_path(archive: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheets = workbook.find("a:sheets", NS)
    if sheets is None or len(sheets) == 0:
        raise ValueError("Workbook has no sheets")

    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
    first_rel = sheets[0].attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
    return "xl/" + rel_map[first_rel]


def extract_rows(xlsx_path: Path) -> list[list[str]]:
    with zipfile.ZipFile(xlsx_path) as archive:
        shared_strings = load_shared_strings(archive)
        worksheet_path = resolve_first_sheet_path(archive)
        worksheet = ET.fromstring(archive.read(worksheet_path))

        sheet_data = worksheet.find("a:sheetData", NS)
        if sheet_data is None:
            return []

        table: list[list[str]] = []
        for row in sheet_data.findall("a:row", NS):
            cells_by_index: dict[int, str] = {}
            max_index = -1

            for cell in row.findall("a:c", NS):
                cell_ref = cell.attrib.get("r", "A1")
                index = col_to_index(cell_ref)
                max_index = max(max_index, index)

                cell_type = cell.attrib.get("t")
                value_node = cell.find("a:v", NS)
                value = ""
                if value_node is not None and value_node.text is not None:
                    value = value_node.text
                    if cell_type == "s":
                        shared_index = int(value)
                        if 0 <= shared_index < len(shared_strings):
                            value = shared_strings[shared_index]

                cells_by_index[index] = str(value)

            if max_index >= 0:
                table.append([cells_by_index.get(i, "") for i in range(max_index + 1)])

    return table


def sanitize_cell(value: str) -> str:
    return str(value).replace("\t", " ").replace("\n", " ").replace("\r", " ").strip()


def write_tsv(rows: list[list[str]], output_path: Path) -> int:
    if not rows:
        output_path.write_text("", encoding="utf-8")
        return 0

    headers = rows[0][:]
    if headers:
        headers[0] = "Index"

    lines = ["\t".join(sanitize_cell(cell) for cell in headers)]
    written = 0

    for row in rows[1:]:
        if not any(str(cell).strip() for cell in row):
            continue

        padded = row[:]
        if len(padded) < len(headers):
            padded += [""] * (len(headers) - len(padded))
        padded = padded[: len(headers)]

        lines.append("\t".join(sanitize_cell(cell) for cell in padded))
        written += 1

    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert XLSX to plain text TSV")
    parser.add_argument("input_xlsx", type=Path, help="Path to source XLSX workbook")
    parser.add_argument("output_txt", type=Path, help="Path to output plain text TSV")
    args = parser.parse_args()

    rows = extract_rows(args.input_xlsx)
    count = write_tsv(rows, args.output_txt)
    print(f"Wrote {count} records to {args.output_txt}")


if __name__ == "__main__":
    main()
