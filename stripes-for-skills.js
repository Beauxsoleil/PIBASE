/* PIBASE Stripes for Skills generator.
 * Generates a completed one-page checklist entirely in the browser.
 * If assets/stripes-for-skills-template.pdf is present, the official AcroForm is
 * filled directly; otherwise PIBASE renders a faithful printable fallback.
 * No applicant data leaves the browser and no Firestore writes are performed.
 */
(function () {
  'use strict';

  var PDF_LIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  var OFFICIAL_TEMPLATE_URL = './assets/stripes-for-skills-template.pdf';
  var INITIALS = 'JV';
  var RECRUITER_LINE = 'SSG VIOLA/ DET 3 RSP';
  var RANKS = ['PVT', 'PV2', 'PFC', 'SPC', 'CPL', 'SGT', 'SSG', 'SFC', 'MSG', '1SG', 'SGM', 'CSM'];
  var pdfLibPromise = null;

  var TASKS = [
    { text: 'Esatblish Bank Account', phase: 'R' },
    { text: 'Start Direct Deposit', phase: 'R' },
    { text: 'Set up AKO Account', phase: 'R' },
    { text: 'Set up MyPay Account', phase: 'R' },
    { text: 'Military Time (STRM White Phase Stripes for Skills)', phase: 'W' },
    { text: 'Drill and Ceremony (STRM Red Phase)', phase: 'R', group: true },
    { text: 'Execute the Position of Attention', phase: 'R', indent: 1 },
    { text: 'Execute the Hand Salute', phase: 'R', indent: 1 },
    { text: 'Know Who and When to Salute', phase: 'R', indent: 1 },
    { text: 'Execute Rest Positions While at the Halt (STRM Red Phase)', phase: 'R', group: true, groupBullet: true },
    { text: 'Parade Rest', phase: 'R', indent: 1 },
    { text: 'Stand at Ease', phase: 'R', indent: 1 },
    { text: 'At Ease', phase: 'R', indent: 1 },
    { text: 'Rest', phase: 'R', indent: 1 },
    { text: 'Execute Facing Movements While at the Halt (STRM Red Phase)', phase: 'R', group: true, groupBullet: true },
    { text: 'Right Face', phase: 'R', indent: 1 },
    { text: 'Left Face', phase: 'R', indent: 1 },
    { text: 'About Face', phase: 'R', indent: 1 },
    { text: 'Marching (STRM Red Phase)', phase: 'R', group: true, groupBullet: true },
    { text: 'Forward March', phase: 'R', indent: 1 },
    { text: 'Half Step', phase: 'R', indent: 1 },
    { text: 'Change Step', phase: 'R', indent: 1 },
    { text: 'Column Left (STRM White Phase)', phase: 'W', indent: 1 },
    { text: 'Column Right (STRM White Phase)', phase: 'W', indent: 1 },
    { text: 'Halt', phase: 'R', indent: 1 },
    { text: 'Recite General Orders (STRM White Phase Stripes for Skills)', phase: 'W', group: true },
    { text: 'First General Order', phase: 'W', indent: 1 },
    { text: 'Second General Order', phase: 'W', indent: 1 },
    { text: 'Third General Order', phase: 'W', indent: 1 },
    { text: 'Idenitfy Rank Structure (STRM Red Phase)', phase: 'R', group: true },
    { text: 'Enlisted Ranks', phase: 'R', indent: 1 },
    { text: 'Officer Ranks', phase: 'R', indent: 1 },
    { text: 'Warrant Officer Ranks', phase: 'R', indent: 1 },
    { text: 'Phonetic Alphabet (STRM Red Phase)', phase: 'R', group: true },
    { text: 'Know / Recite Phonetic Alphabet', phase: 'R', indent: 1 },
    { text: 'First Aid/CLS (STRM White Phase)', phase: 'W', group: true },
    { text: 'Evaluate a Casualty', phase: 'W', indent: 1 },
    { text: 'Perform First Aid and Prctice Individual Preventative Medicine Countermeasures', phase: 'W', indent: 1 },
    { text: 'Perform First Aid for Bleeding Extremity', phase: 'W', indent: 1 },
    { text: 'Perform First Aid for Splinting a Fracture', phase: 'W', indent: 1 }
  ];

  var ACFT = [
    { event: '3RM Deadlift', metric: 'LBS:' },
    { event: 'Standing Power Throw', metric: 'Meters:' },
    { event: 'Hand Release Push-Up', metric: 'Repitions:' },
    { event: 'Sprint, Drag, Carry', metric: 'Min : Sec:' },
    { event: 'Plank', metric: 'Min : Sec:' },
    { event: '2.0-Mile Run', metric: 'Min : Sec:' }
  ];

  var OFFICIAL_RED_FIELDS = [
    'InitialsDate of CompletionEsatblish Bank Account',
    'InitialsDate of CompletionStart Direct Deposit',
    'InitialsDate of CompletionSet up AKO Account',
    'InitialsDate of CompletionSet up MyPay Account',
    'InitialsDate of CompletionDrill and Ceremony STRM Red Phase',
    'InitialsDate of CompletionExecute the Position of Attention',
    'InitialsDate of CompletionExecute the Hand Salute',
    'InitialsDate of CompletionKnow Who and When to Salute',
    'InitialsDate of CompletionExecute Rest Positions While at the Halt STRM Red Phase',
    'InitialsDate of CompletionParade Rest',
    'InitialsDate of CompletionStand at Ease',
    'InitialsDate of CompletionAt Ease',
    'InitialsDate of CompletionRest',
    'InitialsDate of CompletionExecute Facing Movements While at the Halt STRM Red Phase',
    'InitialsDate of CompletionRight Face',
    'InitialsDate of CompletionLeft Face',
    'InitialsDate of CompletionAbout Face',
    'InitialsDate of CompletionMarching STRM Red Phase',
    'InitialsDate of CompletionForward March',
    'InitialsDate of CompletionHalf Step',
    'InitialsDate of CompletionChange Step',
    'InitialsDate of CompletionHalt',
    'InitialsDate of CompletionIdenitfy Rank Structure STRM Red Phase',
    'InitialsDate of CompletionEnlisted Ranks',
    'InitialsDate of CompletionOfficer Ranks',
    'InitialsDate of CompletionWarrant Officer Ranks',
    'InitialsDate of CompletionPhonetic Alphabet STRM Red Phase',
    'InitialsDate of CompletionKnow  Recite Phonetic Alphabet',
    'Identify Terrain Features on a Map',
    'Determine Grid Coordinates on a Map',
    'Perform First Aid for Splinting a Fracture',
    'Basic Lead Qualification Skills APPLEMD'
  ];

  var OFFICIAL_WHITE_FIELDS = [
    'InitialsDate of CompletionMilitary Time STRM White Phase Stripes for Skills',
    'InitialsDate of CompletionColumn Left STRM White Phase',
    'InitialsDate of CompletionColumn Right STRM White Phase',
    'InitialsDate of CompletionRecite General Orders STRM White Phase Stripes for Skills',
    'InitialsDate of CompletionFirst General Order',
    'InitialsDate of CompletionSecond General Order',
    'InitialsDate of CompletionThird General Order',
    'InitialsDate of CompletionFirst AidCLS STRM White Phase',
    'InitialsDate of CompletionEvaluate a Casualty',
    'InitialsDate of CompletionPerform First Aid and Prctice Individual Preventative Medicine Countermeasures',
    'InitialsDate of CompletionPerform First Aid for Bleeding Extremity',
    'InitialsDate of CompletionPerform First Aid for Splinting a Fracture',
    'Points', 'Points_2', 'Points_3', 'Points_4', 'Points_5', 'Points_6',
    'Land Navigation'
  ];

  function ymd(dateValue) {
    return String(dateValue || '').replace(/[^0-9]/g, '').slice(0, 8);
  }

  function todayYmd() {
    var d = new Date();
    return String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  function stamp(dateValue) {
    return INITIALS + '/' + ymd(dateValue);
  }

  function cleanName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function inferRankAndName(raw) {
    var name = cleanName(raw);
    var upper = name.toUpperCase();
    for (var i = 0; i < RANKS.length; i++) {
      var rank = RANKS[i];
      if (upper === rank) return { rank: rank, name: '' };
      if (upper.indexOf(rank + ' ') === 0) return { rank: rank, name: name.slice(rank.length).trim() };
    }
    return { rank: 'PVT', name: name };
  }

  function safeFilename(name) {
    var base = cleanName(name).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Soldier';
    return 'Stripes_for_Skills_' + base + '_' + todayYmd() + '.pdf';
  }

  function ensurePdfLib() {
    if (window.PDFLib && window.PDFLib.PDFDocument) return Promise.resolve(window.PDFLib);
    if (pdfLibPromise) return pdfLibPromise;
    pdfLibPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-pibase-pdf-lib]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(window.PDFLib); }, { once: true });
        existing.addEventListener('error', function () { reject(new Error('Could not load the PDF generator.')); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = PDF_LIB_URL;
      script.defer = true;
      script.dataset.pibasePdfLib = '1';
      script.onload = function () { resolve(window.PDFLib); };
      script.onerror = function () { reject(new Error('Could not load the PDF generator.')); };
      document.head.appendChild(script);
    });
    return pdfLibPromise;
  }

  function fitText(font, text, maxWidth, startSize, minSize) {
    var size = startSize;
    while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
    return size;
  }

  function centerX(font, text, size, left, right) {
    return left + Math.max(0, (right - left - font.widthOfTextAtSize(text, size)) / 2);
  }

  function drawLine(page, x1, y1, x2, y2, width) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: width || 0.45 });
  }

  function drawCellText(page, text, font, size, left, right, y) {
    page.drawText(text, { x: centerX(font, text, size, left, right), y: y, size: size, font: font });
  }

  function wrap(font, text, size, maxWidth) {
    var words = String(text).split(/\s+/);
    var lines = [];
    var line = '';
    words.forEach(function (word) {
      var next = line ? line + ' ' + word : word;
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    if (line) lines.push(line);
    return lines;
  }

  function trySetText(form, name, value, size) {
    var field = form.getTextField(name);
    field.setText(value);
    if (size) {
      try { field.setFontSize(size); } catch (_) {}
    }
  }

  async function fillOfficialTemplate(PDFLib, options) {
    var response;
    try {
      response = await fetch(OFFICIAL_TEMPLATE_URL, { cache: 'force-cache' });
      if (!response.ok) return null;
    } catch (_) {
      return null;
    }
    var bytes = new Uint8Array(await response.arrayBuffer());
    var pdf = await PDFLib.PDFDocument.load(bytes);
    var form = pdf.getForm();
    var soldier = (options.rank + ' ' + options.name).trim().toUpperCase();
    var redStamp = stamp(options.redDate);
    var whiteStamp = stamp(options.whiteDate);

    trySetText(form, 'Date', todayYmd(), 8);
    trySetText(form, 'NAME  RANK', soldier, 8);
    trySetText(form, 'PLATOON SGTUNIT', RECRUITER_LINE, 8);
    OFFICIAL_RED_FIELDS.forEach(function (name) { trySetText(form, name, redStamp, 7); });
    OFFICIAL_WHITE_FIELDS.forEach(function (name) { trySetText(form, name, whiteStamp, 7); });
    try { form.updateFieldAppearances(); } catch (_) {}
    return pdf.save();
  }

  async function makeFallbackPdf(PDFLib, options) {
    var pdf = await PDFLib.PDFDocument.create();
    var page = pdf.addPage([612, 792]);
    var regular = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    var bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    var mono = await pdf.embedFont(PDFLib.StandardFonts.Courier);
    var soldier = (options.rank + ' ' + options.name).trim().toUpperCase();
    var redStamp = stamp(options.redDate);
    var whiteStamp = stamp(options.whiteDate);

    var left = 50, right = 562, split = 397.8;
    var top = 738, bottom = 72;
    // Draw the form border as four strokes. pdf-lib fills rectangles black by
    // default when only borderWidth is supplied, which hid the entire checklist.
    drawLine(page, left, bottom, right, bottom, 0.65);
    drawLine(page, left, top, right, top, 0.65);
    drawLine(page, left, bottom, left, top, 0.65);
    drawLine(page, right, bottom, right, top, 0.65);

    drawLine(page, left, 696, right, 696, 0.55);
    drawLine(page, left, 676, right, 676, 0.55);
    drawLine(page, 264, 676, 264, 696, 0.55);
    drawLine(page, left, 666.6, right, 666.6, 0.55);
    drawLine(page, split, 132.4, split, 676, 0.55);

    drawCellText(page, 'ARMY NATIONAL GUARD', bold, 8.2, left, right, 725);
    drawCellText(page, 'STRIPES FOR SKILLS PROGRAM', bold, 8.2, left, right, 712);
    page.drawText('Date:', { x: 480, y: 700, size: 6.7, font: regular });
    page.drawText(todayYmd(), { x: 508, y: 700, size: 6.7, font: mono });
    drawLine(page, 505, 698, 535, 698, 0.4);

    page.drawText('NAME & RANK:', { x: 51, y: 683, size: 6.7, font: bold });
    page.drawText('PLATOON SGT/UNIT:', { x: 265, y: 683, size: 6.7, font: bold });
    page.drawText(soldier, { x: 105, y: 683, size: fitText(regular, soldier, 150, 7, 5.4), font: regular });
    page.drawText(RECRUITER_LINE, { x: 333, y: 683, size: 6.8, font: regular });

    page.drawText('Required Task:', { x: 51, y: 668.6, size: 6.7, font: bold });
    page.drawText('Initials/Date of Completion:', { x: 399.5, y: 668.6, size: 6.7, font: bold });

    var yTop = 666.6;
    var row = 10.08;
    TASKS.forEach(function (task, index) {
      var rowBottom = yTop - row;
      drawLine(page, left, rowBottom, right, rowBottom, 0.38);
      var baseline = rowBottom + 2.35;
      var font = task.group ? bold : regular;
      var x = 52;
      if (task.indent) {
        page.drawCircle({ x: 72, y: baseline + 2.1, size: 1.15 });
        x = 83;
      } else if (task.groupBullet) {
        page.drawCircle({ x: 54.5, y: baseline + 2.1, size: 1.15 });
        x = 65;
      }
      var max = split - x - 4;
      var size = fitText(font, task.text, max, 6.2, 4.7);
      page.drawText(task.text, { x: x, y: baseline, size: size, font: font });
      var st = task.phase === 'W' ? whiteStamp : redStamp;
      drawCellText(page, st, mono, 6.4, split, right, baseline);
      yTop = rowBottom;
    });

    var acftTop = yTop;
    var acftHeaderBottom = acftTop - 20.16;
    drawLine(page, left, acftHeaderBottom, right, acftHeaderBottom, 0.45);
    var acft1 = 'Army Combat Fitness Test (ACFT) (Aplicant must achieve minimum score for soldiers physical demand of their unit/MOS with all events';
    var acft2 = 'being completed on the same day. Events must be performed to standard outlined in the Army Field Testing Manual ACFT.)';
    page.drawText(acft1, { x: 52, y: acftTop - 7.3, size: 5.6, font: bold });
    page.drawText(acft2, { x: 52, y: acftTop - 15.5, size: 5.6, font: bold });

    var eventSplit = 159, metricSplit = 232;
    drawLine(page, eventSplit, acftHeaderBottom - (6 * row), eventSplit, acftHeaderBottom, 0.4);
    drawLine(page, metricSplit, acftHeaderBottom - (6 * row), metricSplit, acftHeaderBottom, 0.4);
    for (var i = 0; i < ACFT.length; i++) {
      var rTop = acftHeaderBottom - (i * row);
      var rBottom = rTop - row;
      drawLine(page, left, rBottom, right, rBottom, 0.38);
      var b = rBottom + 2.35;
      var e = ACFT[i];
      drawCellText(page, e.event, i === 0 || i === 1 || i === 2 || i === 3 || i === 4 || i === 5 ? bold : regular, 5.8, left, eventSplit, b);
      page.drawText(e.metric, { x: eventSplit + 3, y: b, size: 5.8, font: regular });
      page.drawText('Points:', { x: metricSplit + 3, y: b, size: 5.8, font: regular });
      drawCellText(page, whiteStamp, mono, 6.4, split, right, b);
    }

    yTop = acftHeaderBottom - (6 * row);
    var landRows = [
      { text: 'Land Navigation', phase: 'W', group: true },
      { text: 'Identify Terrain Features on a Map', phase: 'R', indent: 1 },
      { text: 'Determine Grid Coordinates on a Map', phase: 'R', indent: 1 },
      { text: 'Perform First Aid for Splinting a Fracture', phase: 'R', indent: 1 },
      { text: 'Basic Lead Qualification Skills (APPLE-MD)', phase: 'R', group: true }
    ];
    landRows.forEach(function (task) {
      var rb = yTop - row;
      drawLine(page, left, rb, right, rb, 0.38);
      var base = rb + 2.35;
      var tx = 52;
      if (task.indent) {
        page.drawCircle({ x: 72, y: base + 2.1, size: 1.15 });
        tx = 83;
      }
      page.drawText(task.text, { x: tx, y: base, size: task.group ? 6.1 : 5.9, font: task.group ? bold : regular });
      drawCellText(page, task.phase === 'W' ? whiteStamp : redStamp, mono, 6.4, split, right, base);
      yTop = rb;
    });

    var scoreY = yTop - 10;
    var scoring1 = 'Score Soldier a GO if the task is performed successfully (Sustainment training should continue during all succeeding months.)';
    var scoring2 = 'Soldier a NO-GO if the Soldier fails one or more areas and the instructor cannot correct the deficiency on the spot (Retraining required at the next military formation.)';
    wrap(regular, scoring1, 5.6, right - left - 42).forEach(function (line) {
      page.drawText(line, { x: 52, y: scoreY, size: 5.6, font: regular });
      scoreY -= 7;
    });
    page.drawText('Score', { x: 522, y: yTop - 10, size: 5.6, font: regular });
    wrap(regular, scoring2, 5.6, right - left - 4).forEach(function (line) {
      page.drawText(line, { x: 52, y: scoreY, size: 5.6, font: regular });
      scoreY -= 7;
    });

    drawLine(page, 84, 89, 234, 89, 0.5);
    drawLine(page, 328, 89, 478, 89, 0.5);
    drawCellText(page, "Trainer's Signature", bold, 5.9, 84, 234, 79);
    drawCellText(page, "Commander's Verification", bold, 5.9, 328, 478, 79);

    return pdf.save();
  }

  async function makePdf(options) {
    var PDFLib = await ensurePdfLib();
    var official = await fillOfficialTemplate(PDFLib, options);
    return official || makeFallbackPdf(PDFLib, options);
  }

  async function shareOrDownload(bytes, name) {
    var filename = safeFilename(name);
    var blob = new Blob([bytes], { type: 'application/pdf' });
    var file = null;
    try { file = new File([blob], filename, { type: 'application/pdf' }); } catch (_) {}

    if (file && navigator.share && navigator.canShare) {
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Stripes for Skills - ' + name });
          return 'shared';
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        console.warn('File share unavailable; using download fallback.', err);
      }
    }

    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return 'downloaded';
  }

  function injectStyles() {
    if (document.getElementById('sfsStyles')) return;
    var style = document.createElement('style');
    style.id = 'sfsStyles';
    style.textContent = [
      '.sfs-modal{position:fixed;inset:0;z-index:1500;background:rgba(4,8,7,.82);display:flex;align-items:flex-end;justify-content:center;padding:14px}',
      '.sfs-panel{width:min(100%,520px);max-height:92vh;overflow:auto;background:var(--surface);border:1px solid var(--line-bright);border-radius:12px 12px 6px 6px;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.45)}',
      '.sfs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:8px}',
      '.sfs-head h2{font-family:var(--font-display);font-size:1.15rem;margin:0}',
      '.sfs-close{background:none;border:0;color:var(--text-muted);font-size:1.5rem;line-height:1;padding:0 2px}',
      '.sfs-stamp{font-family:var(--font-mono);font-size:.78rem;color:var(--brass);background:var(--bg-raised);border:1px solid var(--line);padding:8px 10px;border-radius:4px;margin-top:10px}',
      '.sfs-actions{display:grid;grid-template-columns:1fr 1.5fr;gap:8px;margin-top:16px}',
      '.sfs-actions .btn{width:100%;margin:0}',
      '.sfs-status{min-height:1.2em;margin-top:8px;font-size:.76rem;color:var(--teal)}',
      '@media(min-width:600px){.sfs-modal{align-items:center}.sfs-panel{border-radius:12px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureButton() {
    var button = document.getElementById('stripesForSkillsBtn');
    if (button) return button;
    var notesTitle = Array.from(document.querySelectorAll('#detailScreen .section-title')).find(function (el) {
      return el.textContent.trim() === 'Notes';
    });
    if (!notesTitle) return null;
    var title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Documents';
    button = document.createElement('button');
    button.className = 'btn btn-secondary btn-block';
    button.id = 'stripesForSkillsBtn';
    button.type = 'button';
    button.textContent = 'Generate Stripes for Skills';
    var helper = document.createElement('div');
    helper.className = 'helper';
    helper.textContent = 'Uses JV/YYYYMMDD for Red and White phase completion dates. Trainer signature and commander verification remain blank.';
    notesTitle.parentNode.insertBefore(title, notesTitle);
    notesTitle.parentNode.insertBefore(button, notesTitle);
    notesTitle.parentNode.insertBefore(helper, notesTitle);
    return button;
  }

  function ensureModal() {
    var modal = document.getElementById('sfsModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'sfsModal';
    modal.className = 'sfs-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'sfsTitle');
    modal.innerHTML = '' +
      '<div class="sfs-panel">' +
        '<div class="sfs-head"><div><div class="eyebrow">RSP DOCUMENT</div><h2 id="sfsTitle">Stripes for Skills</h2></div><button class="sfs-close" id="sfsCloseBtn" type="button" aria-label="Close">×</button></div>' +
        '<div class="helper">PIBASE fills the Soldier name, recruiter line, and Red/White completion dates. The document date is today.</div>' +
        '<label for="sfsRank">Rank</label><select id="sfsRank">' + RANKS.map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select>' +
        '<label for="sfsSoldierName">Soldier name</label><input id="sfsSoldierName" type="text" autocomplete="off">' +
        '<div class="field-row"><div><label for="sfsRedDate">Red Phase date</label><input id="sfsRedDate" type="date"></div><div><label for="sfsWhiteDate">White Phase date</label><input id="sfsWhiteDate" type="date"></div></div>' +
        '<div class="sfs-stamp"><div>Red: <span id="sfsRedPreview">JV/________</span></div><div style="margin-top:4px">White: <span id="sfsWhitePreview">JV/________</span></div><div style="margin-top:4px;color:var(--text-muted)">Recruiter: ' + RECRUITER_LINE + '</div></div>' +
        '<div class="sfs-actions"><button class="btn btn-secondary" id="sfsCancelBtn" type="button">Cancel</button><button class="btn btn-primary" id="sfsGenerateBtn" type="button">Generate / Share PDF</button></div>' +
        '<div class="sfs-status" id="sfsStatus"></div>' +
      '</div>';
    document.body.appendChild(modal);

    function close() { modal.classList.add('hidden'); }
    document.getElementById('sfsCloseBtn').addEventListener('click', close);
    document.getElementById('sfsCancelBtn').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });

    ['sfsRedDate', 'sfsWhiteDate'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', function () {
        var red = document.getElementById('sfsRedDate').value;
        var white = document.getElementById('sfsWhiteDate').value;
        document.getElementById('sfsRedPreview').textContent = red ? stamp(red) : 'JV/________';
        document.getElementById('sfsWhitePreview').textContent = white ? stamp(white) : 'JV/________';
      });
    });

    document.getElementById('sfsGenerateBtn').addEventListener('click', async function () {
      var status = document.getElementById('sfsStatus');
      var button = document.getElementById('sfsGenerateBtn');
      var rank = document.getElementById('sfsRank').value;
      var name = cleanName(document.getElementById('sfsSoldierName').value);
      var redDate = document.getElementById('sfsRedDate').value;
      var whiteDate = document.getElementById('sfsWhiteDate').value;
      if (!name || !redDate || !whiteDate) {
        status.style.color = '#E08B77';
        status.textContent = 'Soldier name and both phase dates are required.';
        return;
      }
      if (whiteDate < redDate) {
        status.style.color = '#E08B77';
        status.textContent = 'White Phase date cannot be before Red Phase date.';
        return;
      }
      status.style.color = '';
      status.textContent = 'Generating PDF…';
      button.disabled = true;
      try {
        var bytes = await makePdf({ rank: rank, name: name, redDate: redDate, whiteDate: whiteDate });
        var result = await shareOrDownload(bytes, name);
        if (result === 'cancelled') status.textContent = 'PDF created. Share cancelled.';
        else status.textContent = result === 'shared' ? 'PDF created and shared.' : 'PDF created.';
      } catch (err) {
        console.error('Stripes for Skills generation failed', err);
        status.style.color = '#E08B77';
        status.textContent = 'Could not generate the PDF. Reconnect once and try again.';
      } finally {
        button.disabled = false;
      }
    });
    return modal;
  }

  function openModal() {
    injectStyles();
    var modal = ensureModal();
    var info = inferRankAndName(document.getElementById('f_name') ? document.getElementById('f_name').value : '');
    document.getElementById('sfsRank').value = info.rank;
    document.getElementById('sfsSoldierName').value = info.name;
    document.getElementById('sfsRedDate').value = '';
    document.getElementById('sfsWhiteDate').value = '';
    document.getElementById('sfsRedPreview').textContent = 'JV/________';
    document.getElementById('sfsWhitePreview').textContent = 'JV/________';
    document.getElementById('sfsStatus').textContent = '';
    modal.classList.remove('hidden');
    setTimeout(function () { document.getElementById('sfsRedDate').focus(); }, 0);
  }

  function init() {
    injectStyles();
    ensureModal();
    var button = ensureButton();
    if (button && !button.dataset.sfsReady) {
      button.dataset.sfsReady = '1';
      button.addEventListener('click', openModal);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.__PIBASE_SFS__ = {
    ymd: ymd,
    stamp: stamp,
    inferRankAndName: inferRankAndName,
    initials: INITIALS,
    recruiterLine: RECRUITER_LINE,
    tasks: TASKS.map(function (task) { return { text: task.text, phase: task.phase }; }),
    officialRedFields: OFFICIAL_RED_FIELDS.slice(),
    officialWhiteFields: OFFICIAL_WHITE_FIELDS.slice()
  };
}());
