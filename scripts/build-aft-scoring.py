#!/usr/bin/env python3
"""Build PIBASE AFT scoring data from the official U.S. Army scoring PDF.

Source is the GoArmy-hosted HQDA EXORD scoring-table annex. The generated JSON
preserves every published scoring threshold; no interpolation is added.
"""
import argparse
import hashlib
import json
import re
import urllib.request
from pathlib import Path
import pdfplumber

SOURCE_URL = "https://www.goarmy.com/content/dam/goarmy/files/HQDA_EXORD_218-25__CC__Annex_B_-_Scoring_Tables__Final_.pdf"
SOURCE_SHA256 = "572a54ffce1a084bf935fc8e9ea80a316de7e6edc824d6d8517e8944872ad750"
AGE_BANDS = ["17-21","22-26","27-31","32-36","37-41","42-46","47-51","52-56","57-61","62+"]
EVENT_PAGES = {
    "MDL": [0],
    "HRP": [1],
    "SDC": [2,3],
    "PLK": [4,5],
    "2MR": [6,7],
}
DIRECTION = {"MDL":"higher","HRP":"higher","SDC":"lower","PLK":"higher","2MR":"lower"}
EXPECTED_60 = {
    "MDL": ["150","120","150","120","150","120","140","120","140","120","140","120","140","120","140","120","140","120","140","120"],
    "HRP": ["15","11","14","11","14","11","13","11","12","10","11","10","11","10","10","10","10","10","10","10"],
    "SDC": ["2:28","3:15","2:31","3:15","2:32","3:15","2:36","3:22","2:41","3:27","2:45","3:42","2:53","3:51","3:00","4:03","3:12","4:48","3:16","4:48"],
    "PLK": ["1:30","1:30","1:25","1:25","1:20","1:20","1:15","1:15","1:10","1:10","1:10","1:10","1:10","1:10","1:10","1:10","1:10","1:10","1:10","1:10"],
    "2MR": ["19:57","22:55","19:45","22:45","19:45","22:45","20:44","22:50","20:44","22:59","22:04","23:15","22:04","23:30","22:50","24:00","23:36","24:48","23:36","25:00"],
}
EXPECTED_100 = {
    "MDL": ["340","220","350","230","350","240","350","230","350","220","350","210","340","200","330","190","250","170","230","170"],
    "HRP": ["58","53","61","50","62","48","60","47","59","43","57","40","55","38","51","36","46","24","43","24"],
    "SDC": ["1:29","1:55","1:30","1:55","1:30","1:55","1:33","1:59","1:36","2:02","1:40","2:09","1:45","2:11","1:52","2:18","1:58","2:26","2:09","2:26"],
    "PLK": ["3:40","3:40","3:35","3:35","3:30","3:30","3:25","3:25","3:20","3:20","3:20","3:20","3:20","3:20","3:20","3:20","3:20","3:20","3:20","3:20"],
    "2MR": ["13:22","16:00","13:25","15:30","13:25","15:30","13:42","15:48","13:42","15:51","14:05","16:00","14:30","16:30","15:09","16:59","15:28","17:18","15:28","17:18"],
}
# MDL and HRP publish every row from 100 through 60, then the ten-point
# anchors below 60. The timed events publish every row from 100 through 0.
EXPECTED_POINTS = {
    "MDL": set(range(60, 101)) | {0, 10, 20, 30, 40, 50},
    "HRP": set(range(60, 101)) | {0, 10, 20, 30, 40, 50},
    "SDC": set(range(0, 101)),
    "PLK": set(range(0, 101)),
    "2MR": set(range(0, 101)),
}
TOKEN_RE = re.compile(r"---|\d+:\d{2}|\d+")

def download():
    req=urllib.request.Request(SOURCE_URL,headers={
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36",
        "Accept":"application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
        "Accept-Language":"en-US,en;q=0.9",
    })
    with urllib.request.urlopen(req,timeout=45) as r:
        data=r.read()
    if not data.startswith(b"%PDF"):
        raise RuntimeError("Official GoArmy scoring source did not return a PDF")
    return data

def parse_row(line):
    toks=TOKEN_RE.findall(line.replace("—","---"))
    if len(toks) < 22 or not toks[0].isdigit():
        return None
    pts=int(toks[0])
    # A valid row has the point value at both margins.
    if not toks[-1].isdigit() or int(toks[-1]) != pts:
        return None
    vals=toks[1:-1]
    if len(vals) != 20:
        return None
    return pts, vals

def extract_rows(pdf_path):
    rows_by_event={}
    with pdfplumber.open(str(pdf_path)) as pdf:
        if len(pdf.pages) < 8:
            raise RuntimeError(f"Expected at least 8 scoring pages, got {len(pdf.pages)}")
        for event,pages in EVENT_PAGES.items():
            rows={}
            for p in pages:
                text=pdf.pages[p].extract_text(x_tolerance=1,y_tolerance=3) or ""
                for line in text.splitlines():
                    parsed=parse_row(line)
                    if parsed:
                        pts,vals=parsed
                        rows[pts]=vals
            rows_by_event[event]=rows
    return rows_by_event

def validate(rows_by_event):
    for event in EVENT_PAGES:
        rows=rows_by_event[event]
        actual_points=set(rows)
        if actual_points != EXPECTED_POINTS[event]:
            missing=sorted(EXPECTED_POINTS[event] - actual_points, reverse=True)
            extra=sorted(actual_points - EXPECTED_POINTS[event], reverse=True)
            raise RuntimeError(f"{event}: point rows mismatch; missing={missing}, extra={extra}")
        if rows.get(60) != EXPECTED_60[event]:
            raise RuntimeError(f"{event}: official 60-point anchor mismatch: {rows.get(60)}")
        if rows.get(100) != EXPECTED_100[event]:
            raise RuntimeError(f"{event}: official 100-point anchor mismatch: {rows.get(100)}")
        if not all(0 <= p <= 100 for p in rows):
            raise RuntimeError(f"{event}: invalid point key found")

def main(out_path, source_pdf=None):
    pdf_bytes=Path(source_pdf).read_bytes() if source_pdf else download()
    source_sha=hashlib.sha256(pdf_bytes).hexdigest()
    if source_sha != SOURCE_SHA256:
        raise RuntimeError(
            f"Official scoring PDF SHA-256 changed: expected {SOURCE_SHA256}, got {source_sha}"
        )
    tmp=Path(out_path).with_suffix(".official.pdf")
    tmp.write_bytes(pdf_bytes)
    try:
        rows_by_event=extract_rows(tmp)
    finally:
        tmp.unlink(missing_ok=True)
    validate(rows_by_event)

    out={
        "version":"250601",
        "approved":"2025-05-01",
        "effective":"2025-06-01",
        "ageBands":AGE_BANDS,
        "provenance":{
            "officialSource":SOURCE_URL,
            "officialSha256":source_sha,
            "method":"pdfplumber table-row extraction; no interpolation"
        },
        "events":{}
    }
    for event,rows in rows_by_event.items():
        columns={}
        for ai,age in enumerate(AGE_BANDS):
            columns[age]={"M":[],"F":[]}
            for pts in sorted(rows.keys(),reverse=True):
                vals=rows[pts]
                for sex,offset in (("M",ai*2),("F",ai*2+1)):
                    raw=vals[offset]
                    if raw!="---":
                        columns[age][sex].append([pts,raw])
        out["events"][event]={
            "direction":DIRECTION[event],
            "publishedPointRows":sorted(rows.keys(),reverse=True),
            "columns":columns,
        }

    Path(out_path).write_text(json.dumps(out,separators=(",",":"),sort_keys=True)+"\n")
    print(f"Wrote {out_path}; official PDF SHA-256 {source_sha}")
    for event in EVENT_PAGES:
        print(event, "point rows", len(rows_by_event[event]),
              "stored cells", sum(len(v[s]) for v in out["events"][event]["columns"].values() for s in ("M","F")))

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("output",nargs="?",default="aft-scoring-data.json")
    parser.add_argument("--source-pdf",help="Use an already-downloaded copy of the pinned official PDF")
    args=parser.parse_args()
    main(args.output,args.source_pdf)
