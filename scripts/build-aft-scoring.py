#!/usr/bin/env python3
"""Build PIBASE AFT scoring data from the official Army scoring-scale PDF."""
import hashlib, json, re, sys, urllib.request
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    raise SystemExit("pdfplumber is required")

SOURCE_URL = "https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf"
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
    "SDC": ["2:28","3:15","2:31","3:15","2:32","3:15","2:36","3:22","2:39","3:25","2:43","3:39","2:50","3:48","2:57","4:00","3:09","4:45","3:13","4:45"],
    "PLK": ["1:30","1:30","1:25","1:25","1:20","1:20","1:15","1:15","1:10","1:10","1:10","1:10","1:10","1:10","1:10","1:10","1:10","1:10","1:10","1:10"],
    "2MR": ["19:57","22:55","19:45","22:45","19:45","22:45","20:44","22:50","20:44","22:59","22:04","23:15","22:04","23:30","22:50","24:00","23:36","24:48","23:36","25:00"],
}
TOKEN_RE = re.compile(r"---|\d+:\d{2}|\d+")

def download():
    req=urllib.request.Request(SOURCE_URL,headers={
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36",
        "Referer":"https://www.army.mil/aft/",
        "Accept":"application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
        "Accept-Language":"en-US,en;q=0.9",
    })
    with urllib.request.urlopen(req,timeout=30) as r:
        data=r.read()
    if not data.startswith(b"%PDF"):
        raise RuntimeError("Army scoring source did not return a PDF")
    return data

def parse_row(line):
    toks=TOKEN_RE.findall(line)
    if len(toks) >= 22 and toks[0].isdigit() and toks[-1] == toks[0]:
        pts=int(toks[0])
        vals=toks[1:21]
        if len(vals)==20:
            return pts, vals
    return None

def normalize_hrp_low(line):
    # The Army PDF compresses the 50/40/30/20/10/0 HRP rows into repeated
    # digits during text extraction. These rows are uniform across all columns.
    m=re.fullmatch(r"\s*(50|40|30|20|10|0)\s+([4-9]{20})\s+\1\s*",line)
    if not m:
        return None
    pts=int(m.group(1))
    return pts, list(m.group(2))

def main(out_path):
    pdf_bytes=download()
    source_sha=hashlib.sha256(pdf_bytes).hexdigest()
    tmp=Path(out_path).with_suffix(".source.pdf")
    tmp.write_bytes(pdf_bytes)
    rows_by_event={}
    try:
        with pdfplumber.open(str(tmp)) as pdf:
            if len(pdf.pages) < 8:
                raise RuntimeError(f"Expected at least 8 pages, got {len(pdf.pages)}")
            for event,pages in EVENT_PAGES.items():
                rows={}
                for p in pages:
                    text=pdf.pages[p].extract_text(x_tolerance=1,y_tolerance=3) or ""
                    for line in text.splitlines():
                        parsed=parse_row(line)
                        if not parsed and event=="HRP":
                            parsed=normalize_hrp_low(line)
                        if parsed:
                            pts,vals=parsed
                            rows[pts]=vals
                if 60 not in rows:
                    raise RuntimeError(f"{event}: 60-point row not parsed")
                if rows[60] != EXPECTED_60[event]:
                    raise RuntimeError(f"{event}: 60-point row mismatch: {rows[60]}")
                if 100 not in rows:
                    raise RuntimeError(f"{event}: 100-point row not parsed")
                rows_by_event[event]=rows
    finally:
        tmp.unlink(missing_ok=True)

    out={
        "version":"250601",
        "approved":"2025-05-15",
        "effective":"2025-06-01",
        "sourceUrl":SOURCE_URL,
        "sourceSha256":source_sha,
        "ageBands":AGE_BANDS,
        "events":{}
    }
    for event,rows in rows_by_event.items():
        columns={}
        for ai,age in enumerate(AGE_BANDS):
            columns[age]={"M":[],"F":[]}
            for pts in sorted(rows.keys(), reverse=True):
                vals=rows[pts]
                for sex,offset in (("M",ai*2),("F",ai*2+1)):
                    raw=vals[offset]
                    if raw!="---":
                        columns[age][sex].append([pts,raw])
        out["events"][event]={"direction":DIRECTION[event],"columns":columns}

    Path(out_path).write_text(json.dumps(out,separators=(",",":"),sort_keys=True)+"\n")
    print(f"Wrote {out_path}; Army source SHA-256 {source_sha}")
    for e in out["events"]:
        print(e, sum(len(v[s]) for v in out["events"][e]["columns"].values() for s in ("M","F")))

if __name__=="__main__":
    main(sys.argv[1] if len(sys.argv)>1 else "aft-scoring-data.json")
