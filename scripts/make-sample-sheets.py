#!/usr/bin/env python3
"""Generate sample training sheets for the Pdash muscle map.

Writes docs/sample-workouts.csv and docs/sample-workouts.xlsx (standard library
only). The xlsx has real date cells, two data tabs sharing the same columns and
one unrelated tab, so the importer's sheet handling can be exercised. One
exercise ("Zercher Carry") is deliberately not in the built-in library.

    python3 scripts/make-sample-sheets.py            # ends this week
    python3 scripts/make-sample-sheets.py 2026-11-10 # pretend today is this date
"""
import datetime as dt
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

TODAY = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else dt.date.today()
OUT = Path(__file__).resolve().parent.parent / "docs"

# (weekday offset from Monday, [(exercise as people type it, sets, reps, kg)])
PROGRAM = [
    (0, [("Bench Press (Barbell)", 4, 8, 80), ("Incline Dumbbell Press", 4, 10, 28), ("Overhead Press (Dumbbell)", 3, 8, 22),
         ("Lateral Raise", 4, 15, 10), ("Triceps Pushdown", 4, 12, 30), ("Plank", 3, 1, 0)]),
    (1, [("Lat Pulldown", 4, 10, 60), ("Seated Cable Row", 4, 10, 55), ("Barbell Curl", 4, 10, 30),
         ("Hammer Curl", 3, 12, 16), ("Face Pull", 3, 15, 20)]),
    (3, [("Squat (Barbell)", 4, 6, 100), ("Leg Press", 4, 10, 180), ("Leg Extension", 3, 12, 50),
         ("Seated Leg Curl", 3, 12, 40), ("Standing Calf Raise", 4, 15, 60), ("Zercher Carry", 3, 1, 40)]),
    (4, [("Bench Press (Barbell)", 3, 8, 80), ("Dips", 3, 10, 0), ("Hip Thrust", 4, 10, 90),
         ("Cable Crunch", 3, 15, 40)]),
]


def rows_for(week_starts):
    out = []
    for i, monday in enumerate(week_starts):
        for dow, lifts in PROGRAM:
            day = monday + dt.timedelta(days=dow)
            if day > TODAY:
                continue
            for name, sets, reps, kg in lifts:
                out.append((day, name, sets, reps, kg + (i * 0.5 if kg else 0)))
    return out


this_monday = TODAY - dt.timedelta(days=TODAY.weekday())
weeks = [this_monday - dt.timedelta(weeks=n) for n in range(5, -1, -1)]
older, newer = weeks[:3], weeks[3:]
HEADER = ["Date", "Exercise", "Sets", "Reps", "Weight (kg)"]

# ── CSV (everything, ISO dates) ─────────────────────────────────────────────
OUT.mkdir(exist_ok=True)
with open(OUT / "sample-workouts.csv", "w", encoding="utf-8", newline="") as f:
    f.write(",".join(HEADER) + "\n")
    for d, n, s, r, k in rows_for(weeks):
        f.write(f"{d.isoformat()},{n},{s},{r},{k:g}\n")

# ── XLSX ────────────────────────────────────────────────────────────────────
shared, index = [], {}


def sst(text):
    if text not in index:
        index[text] = len(shared)
        shared.append(text)
    return index[text]


def serial(d):
    return (d - dt.date(1899, 12, 30)).days


def cell(ref, value, date=False):
    if isinstance(value, str):
        return f'<c r="{ref}" t="s"><v>{sst(value)}</v></c>'
    style = ' s="1"' if date else ""
    return f'<c r="{ref}"{style}><v>{value}</v></c>'


def sheet_xml(table):
    out = []
    for r, row in enumerate(table, start=1):
        cells = []
        for c, v in enumerate(row):
            ref = f"{'ABCDEFGH'[c]}{r}"
            if isinstance(v, dt.date):
                cells.append(cell(ref, serial(v), date=True))
            else:
                cells.append(cell(ref, v))
        out.append(f'<row r="{r}">{"".join(cells)}</row>')
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{"".join(out)}</sheetData></worksheet>')


tabs = [
    ("Oct", [HEADER] + [list(r) for r in rows_for(older)]),
    ("Nov", [HEADER] + [list(r) for r in rows_for(newer)]),
    ("Notes", [["Idea", "Status", "Owner"], ["Try pause squats", "maybe", "me"]]),
]
sheets_xml = [sheet_xml(t) for _, t in tabs]  # builds the shared-string table

parts = {
    "[Content_Types].xml": (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, len(tabs) + 1))
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        "</Types>"
    ),
    "_rels/.rels": (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    ),
    "xl/workbook.xml": (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + "".join(f'<sheet name="{escape(n)}" sheetId="{i}" r:id="rId{i}"/>' for i, (n, _) in enumerate(tabs, start=1))
        + "</sheets></workbook>"
    ),
    "xl/_rels/workbook.xml.rels": (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(tabs) + 1))
        + f'<Relationship Id="rId{len(tabs) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        f'<Relationship Id="rId{len(tabs) + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
        "</Relationships>"
    ),
    # cellXfs[1] uses built-in number format 14 (a date), so those cells read back as dates.
    "xl/styles.xml": (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
        "</styleSheet>"
    ),
    "xl/sharedStrings.xml": (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(shared)}" uniqueCount="{len(shared)}">'
        + "".join(f"<si><t>{escape(s)}</t></si>" for s in shared)
        + "</sst>"
    ),
}
for i, xml in enumerate(sheets_xml, start=1):
    parts[f"xl/worksheets/sheet{i}.xml"] = xml

with zipfile.ZipFile(OUT / "sample-workouts.xlsx", "w", zipfile.ZIP_DEFLATED) as z:
    for name, data in parts.items():
        z.writestr(name, data)

print(f"wrote {OUT / 'sample-workouts.csv'} and {OUT / 'sample-workouts.xlsx'} (weeks of {weeks[0]} to {this_monday}, today {TODAY})")
