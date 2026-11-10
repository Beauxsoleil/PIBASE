/* PIBASE Stripes for Skills generator.
 * Recreates the current one-page Stripes for Skills checklist client-side.
 * No applicant data leaves the browser and no Firestore writes are performed.
 */
(function () {
  'use strict';

  var PDF_LIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
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
    { text: 'Execute Rest Positions While at the Halt (STRM Red Phase)', phase: 'R', group: true },
    { text: 'Parade Rest', phase: 'R', indent: 1 },
    { text: 'Stand at Ease', phase: 'R', indent: 1 },
    { text: 'At Ease', phase: 'R', indent: 1 },
    { text: 'Rest', phase: 'R', indent: 1 },
    { text: 'Execute Facing Movements While at the Halt (STRM Red Phase)', phase: 'R', group: true },
    { text: 'Right Face', phase: 'R', indent: 1 },
    { text: 'Left Face', phase: 'R', indent: 1 },
    { text: 'About Face', phase: 'R', indent: 1 },
    { text: 'Marching (STRM Red Phase)', phase: 'R', group: true },
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

  function drawCentered(page, text, font, size, y, width) {
    var w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: Math.max(18, (width - w) / 2), y: y, size: size, font: font });
  }

  function drawLine(page, x1, y1, x2, y2, width) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: width || 0.5 });
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

  async function makePdf(options) {
    var PDFLib = await ensurePdfLib();
    var pdf = await PDFLib.PDFDocument.create();
    var page = pdf.addPage([612, 792]);
    var regular = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    var bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    var mono = await pdf.embedFont(PDFLib.StandardFonts.Courier);
    var width = page.getWidth();
    var redStamp = stamp(options.redDate);
    var whiteStamp = stamp(options.whiteDate);
    var soldier = (options.rank + ' ' + options.name).trim().toUpperCase();

    drawCentered(page, 'ARMY NATIONAL GUARD', bold, 10.5, 765, width);
    drawCentered(page, 'STRIPES FOR SKILLS PROGRAM', bold, 10.5, 752, width);
    page.drawText('Date:', { x: 489, y: 735, size: 7.2, font: regular });
    page.drawText(todayYmd(), { x: 515, y: 735, size: 7.2, font: mono });
    drawLine(page, 512, 733, 573, 733, 0.45);

    page.drawText('NAME & RANK:', { x: 39, y: 720, size: 7.2, font: bold });
    page.drawText('PLATOON SGT/UNIT:', { x: 292, y: 720, size: 7.2, font: bold });
    page.drawText(soldier, { x: 105, y: 720, size: fitText(regular, soldier, 170, 7.4, 5.5), font: regular });
    page.drawText(RECRUITER_LINE, { x: 382, y: 720, size: 7.1, font: regular });
    drawLine(page, 103, 718, 275, 718, 0.45);
    drawLine(page, 379, 718, 573, 718, 0.45);

    var taskX = 40;
    var stampX = 420;
    var rightX = 573;
    var y = 701;
    page.drawText('Required Task:', { x: taskX, y: y, size: 7.2, font: bold });
    page.drawText('Initials/Date of Completion:', { x: stampX, y: y, size: 7.2, font: bold });
    y -= 11;

    TASKS.forEach(function (task) {
      var font = task.group ? bold : regular;
      var size = task.indent ? 6.05 : 6.15;
      var text = (task.indent ? '•  ' : '') + task.text;
      var x = taskX + (task.indent ? 11 : 0);
      var maxWidth = stampX - x - 10;
      size = fitText(font, text, maxWidth, size, 4.9);
      page.drawText(text, { x: x, y: y, size: size, font: font });
      page.drawText(task.phase === 'W' ? whiteStamp : redStamp, { x: 487, y: y, size: 6.25, font: mono });
      y -= 8.15;
    });

    y -= 1.2;
    var acftHeader = 'Army Combat Fitness Test (ACFT) (Aplicant must achieve minimum score for soldiers physical demand of their unit/MOS with all events';
    var acftHeader2 = 'being completed on the same day. Events must be performed to standard outlined in the Army Field Testing Manual ACFT.)';
    page.drawText(acftHeader, { x: taskX, y: y, size: 5.45, font: bold });
    y -= 7.1;
    page.drawText(acftHeader2, { x: taskX, y: y, size: 5.45, font: bold });
    y -= 9;
    ACFT.forEach(function (row) {
      page.drawText(row.event, { x: 86, y: y, size: 5.9, font: regular });
      page.drawText(row.metric, { x: 219, y: y, size: 5.9, font: regular });
      drawLine(page, 250, y - 1, 301, y - 1, 0.35);
      page.drawText('Points:', { x: 315, y: y, size: 5.9, font: regular });
      drawLine(page, 352, y - 1, 401, y - 1, 0.35);
      page.drawText(whiteStamp, { x: 487, y: y, size: 6.25, font: mono });
      y -= 8.7;
    });

    page.drawText('Land Navigation', { x: taskX, y: y, size: 6.2, font: bold });
    page.drawText(whiteStamp, { x: 487, y: y, size: 6.25, font: mono });
    y -= 8.2;
    [
      'Identify Terrain Features on a Map',
      'Determine Grid Coordinates on a Map',
      'Perform First Aid for Splinting a Fracture'
    ].forEach(function (text) {
      page.drawText('•  ' + text, { x: taskX + 11, y: y, size: 6.0, font: regular });
      page.drawText(whiteStamp, { x: 487, y: y, size: 6.25, font: mono });
      y -= 8.2;
    });

    page.drawText('Basic Lead Qualification Skills (APPLE-MD)', { x: taskX, y: y, size: 6.2, font: bold });
    page.drawText(redStamp, { x: 487, y: y, size: 6.25, font: mono });
    y -= 10.5;

    var scoring1 = 'Score Soldier a GO if the task is performed successfully (Sustainment training should continue during all succeeding months.)';
    var scoring2 = 'Score Soldier a NO-GO if the Soldier fails one or more areas and the instructor cannot correct the deficiency on the spot (Retraining required at the next military formation.)';
    wrap(regular, scoring1, 5.1, rightX - taskX).forEach(function (line) {
      page.drawText(line, { x: taskX, y: y, size: 5.1, font: regular });
      y -= 6;
    });
    wrap(regular, scoring2, 5.1, rightX - taskX).forEach(function (line) {
      page.drawText(line, { x: taskX, y: y, size: 5.1, font: regular });
      y -= 6;
    });

    y -= 5;
    drawLine(page, 73, y, 247, y, 0.55);
    drawLine(page, 330, y, 505, y, 0.55);
    page.drawText("Trainer's Signature", { x: 119, y: y - 10, size: 5.9, font: regular });
    page.drawText("Commander's Verification", { x: 370, y: y - 10, size: 5.9, font: regular });

    return pdf.save();
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
    helper.textContent = 'Uses JV/YYYYMMDD for the Red and White phase completion dates. Signature and commander verification remain blank.';
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
        '<div class="helper">PIBASE fills the Soldier, recruiter line, and Red/White completion dates. Trainer signature and commander verification remain blank for normal signing.</div>' +
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
    tasks: TASKS.map(function (task) { return { text: task.text, phase: task.phase }; })
  };
}());
