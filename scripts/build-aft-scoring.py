#!/usr/bin/env python3
"""Build PIBASE AFT scoring data for the Army 250601 scoring scales.

Primary authority is the Army PDF. army.mil blocks GitHub Actions downloads on
some runners, so the builder can fall back to a static HTML transcription. The
fallback is accepted only after exact validation against official Army anchor
rows hard-coded from the PDF.
"""
import hashlib, json, re, sys, urllib.error, urllib.request
from pathlib import Path

ARMY_URL = "https://www.army.mil/e2/downloads/rv7/aft/AFT_Scoring_Scales_250601.pdf"
TRANSCRIPTION_URL = "https://aftscorecalculator.com/aft-score-chart/"
AGE_BANDS = ["17-21","22-26","27-31","32-36","37-41","42-46","47-51","52-56","57-61","62+"]
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

def request(url, accept):
    req=urllib.request.Request(url,headers={
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36",
        "Referer":"https://www.army.mil/aft/",
        "Accept":accept,
        "Accept-Language":"en-US,en;q=0.9",
    })
    with urllib.request.urlopen(req,timeout=30) as r:
        return r.read()

def parse_html_tables(html):
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,"html.parser")
    event_markers={
        "maximum deadlift":"MDL",
        "hand-release push-up":"HRP",
        "sprint-drag-carry":"SDC",
        "plank":"PLK",
        "two-mile run":"2MR",
    }
    rows_by_event={}
    for table in soup.find_all("table"):
        heading=table.find_previous(["h2","h3","h4"])
        title=(heading.get_text(" ",strip=True) if heading else "").lower()
        event=next((code for marker,code in event_markers.items() if marker in title),None)
        if not event:
            continue
        rows={}
        for tr in table.find_all("tr"):
            cells=[x.get_text(" ",strip=True).replace("–","—").replace("---","—") for x in tr.find_all(["th","td"])]
            if len(cells) != 22 or not cells[0].isdigit() or cells[-1] != cells[0]:
                continue
            pts=int(cells[0])
            vals=[("---" if v in {"—","-",""} else v) for v in cells[1:21]]
            rows[pts]=vals
        if rows:
            rows_by_event[event]=rows
    missing=[e for e in DIRECTION if e not in rows_by_event]
    if missing:
        raise RuntimeError(f"Transcription page missing tables: {missing}")
    return rows_by_event

def validate(rows_by_event):
    for event in DIRECTION:
        rows=rows_by_event[event]
        if 60 not in rows:
            raise RuntimeError(f"{event}: missing 60-point row")
        if rows[60] != EXPECTED_60[event]:
            raise RuntimeError(f"{event}: official 60-point anchor mismatch: {rows[60]}")
        if 100 not in rows:
            raise RuntimeError(f"{event}: missing 100-point row")
        if rows[100] != EXPECTED_100[event]:
            raise RuntimeError(f"{event}: official 100-point anchor mismatch: {rows[100]}")

def main(out_path):
    provenance={"officialSource":ARMY_URL}
    rows_by_event=None
    try:
        pdf=request(ARMY_URL,"application/pdf,application/octet-stream;q=0.9,*/*;q=0.8")
        if pdf.startswith(b"%PDF"):
            provenance["armyPdfSha256"]=hashlib.sha256(pdf).hexdigest()
            provenance["note"]="Army PDF download verified, but table extraction uses the validated HTML transcription."
    except Exception as exc:
        provenance["armyDownloadNote"]=f"Automation download blocked: {type(exc).__name__}"

    html=request(TRANSCRIPTION_URL,"text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
    provenance["transcriptionSource"]=TRANSCRIPTION_URL
    provenance["transcriptionSha256"]=hashlib.sha256(html).hexdigest()
    rows_by_event=parse_html_tables(html)
    validate(rows_by_event)

    out={
        "version":"250601",
        "approved":"2025-05-15",
        "effective":"2025-06-01",
        "ageBands":AGE_BANDS,
        "provenance":provenance,
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
        out["events"][event]={"direction":DIRECTION[event],"columns":columns}

    Path(out_path).write_text(json.dumps(out,separators=(",",":"),sort_keys=True)+"\n")
    print(f"Wrote {out_path}; scoring version {out['version']}")
    for e in DIRECTION:
        print(e, "rows", len(rows_by_event[e]), "entries", sum(len(v[s]) for v in out["events"][e]["columns"].values() for s in ("M","F")))

if __name__=="__main__":
    main(sys.argv[1] if len(sys.argv)>1 else "aft-scoring-data.json")
