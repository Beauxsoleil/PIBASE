/* PIBASE Stripes for Skills generator.
 * Uses the official Army National Guard Stripes for Skills PDF as the source
 * document. The blank template is imported once per device (or loaded from the
 * optional bundled asset), validated by field name, filled, and flattened so
 * the finished PDF renders consistently across Adobe, iOS, and print viewers.
 * No applicant data is written to Firestore.
 */
(function () {
  'use strict';

  var PDF_LIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  var JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  var OFFICIAL_TEMPLATE_URL = './assets/stripes-for-skills-template.pdf';
  var AFT_SCORING_URL = './aft-scoring-data.json';
  var TEMPLATE_STORAGE_KEY = 'pibase.sfs.officialTemplate.v1';
  var INITIALS = 'JV';
  var RECRUITER_LINE = 'SSG VIOLA/ DET 3 RSP';
  var RANKS = ['PVT', 'PV2', 'PFC', 'SPC', 'CPL', 'SGT', 'SSG', 'SFC', 'MSG', '1SG', 'SGM', 'CSM'];

  var pdfLibPromise = null;
  var jsZipPromise = null;
  var generatedPdf = null;
  var batchApplicants = [];
  var templateState = null;
  var aftDataPromise = null;

  var ENLISTMENT_FIELDS = [
    'InitialsDate of CompletionEsatblish Bank Account',
    'InitialsDate of CompletionStart Direct Deposit',
    'InitialsDate of CompletionSet up AKO Account',
    'InitialsDate of CompletionSet up MyPay Account'
  ];

  // The current completed checklist leaves section-heading boxes blank and
  // dates the individual tasks. Keep that spacing rather than filling every
  // available AcroForm field.
  var OFFICIAL_RED_FIELDS = [
    'InitialsDate of CompletionMilitary Time STRM White Phase Stripes for Skills',
    'InitialsDate of CompletionExecute the Position of Attention',
    'InitialsDate of CompletionExecute the Hand Salute',
    'InitialsDate of CompletionKnow Who and When to Salute',
    'InitialsDate of CompletionParade Rest',
    'InitialsDate of CompletionStand at Ease',
    'InitialsDate of CompletionAt Ease',
    'InitialsDate of CompletionRest',
    'InitialsDate of CompletionRight Face',
    'InitialsDate of CompletionLeft Face',
    'InitialsDate of CompletionAbout Face',
    'InitialsDate of CompletionForward March',
    'InitialsDate of CompletionHalf Step',
    'InitialsDate of CompletionChange Step',
    'InitialsDate of CompletionColumn Left STRM White Phase',
    'InitialsDate of CompletionColumn Right STRM White Phase',
    'InitialsDate of CompletionHalt',
    'InitialsDate of CompletionEnlisted Ranks',
    'InitialsDate of CompletionOfficer Ranks',
    'InitialsDate of CompletionWarrant Officer Ranks',
    'InitialsDate of CompletionKnow  Recite Phonetic Alphabet',
    'Identify Terrain Features on a Map',
    'Determine Grid Coordinates on a Map',
    'Perform First Aid for Splinting a Fracture',
    'Basic Lead Qualification Skills APPLEMD'
  ];

  var OFFICIAL_WHITE_FIELDS = [
    'InitialsDate of CompletionFirst General Order',
    'InitialsDate of CompletionSecond General Order',
    'InitialsDate of CompletionThird General Order',
    'InitialsDate of CompletionEvaluate a Casualty',
    'InitialsDate of CompletionPerform First Aid and Prctice Individual Preventative Medicine Countermeasures',
    'InitialsDate of CompletionPerform First Aid for Bleeding Extremity',
    'InitialsDate of CompletionPerform First Aid for Splinting a Fracture'
  ];

  // This is still the legacy six-row ACFT artwork. The current AFT uses five
  // events, so the Standing Power Throw row (Meters / Points_2) stays blank.
  var AFT_FIELDS = {
    MDL: { raw: 'LBS', score: 'Text1', date: 'Points' },
    HRP: { raw: 'Repitions', score: 'Text3', date: 'Points_3' },
    SDC: { raw: 'Min  Sec', score: 'Text4', date: 'Points_4' },
    PLK: { raw: 'Repitions_2', score: 'Text2', date: 'Points_5' },
    '2MR': { raw: 'Min  Sec_2', score: 'Text5', date: 'Points_6' }
  };
  var AFT_EVENTS = ['MDL','HRP','SDC','PLK','2MR'];

  var EXPECTED_TEMPLATE_FIELDS = [
    'Date', 'NAME  RANK', 'PLATOON SGTUNIT', 'Meters', 'Points_2'
  ].concat(
    ENLISTMENT_FIELDS,
    OFFICIAL_RED_FIELDS,
    OFFICIAL_WHITE_FIELDS,
    AFT_EVENTS.flatMap(function (event) {
      var fields = AFT_FIELDS[event];
      return [fields.raw, fields.score, fields.date];
    })
  );

  var TASKS = [
    { text: 'Esatblish Bank Account', phase: 'E' },
    { text: 'Start Direct Deposit', phase: 'E' },
    { text: 'Set up AKO Account', phase: 'E' },
    { text: 'Set up MyPay Account', phase: 'E' },
    { text: 'Military Time (STRM White Phase Stripes for Skills)', phase: 'R' },
    { text: 'Drill and Ceremony tasks', phase: 'R' },
    { text: 'Column Left (STRM White Phase)', phase: 'R' },
    { text: 'Column Right (STRM White Phase)', phase: 'R' },
    { text: 'General Orders tasks', phase: 'W' },
    { text: 'Rank Structure tasks', phase: 'R' },
    { text: 'Phonetic Alphabet task', phase: 'R' },
    { text: 'First Aid/CLS tasks', phase: 'W' }
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

  function ageBand(age) {
    var n = Number(age);
    if (!Number.isFinite(n) || n < 17) return null;
    if (n <= 21) return '17-21';
    if (n <= 26) return '22-26';
    if (n <= 31) return '27-31';
    if (n <= 36) return '32-36';
    if (n <= 41) return '37-41';
    if (n <= 46) return '42-46';
    if (n <= 51) return '47-51';
    if (n <= 56) return '52-56';
    if (n <= 61) return '57-61';
    return '62+';
  }

  function timeToSeconds(value) {
    var match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    var minutes = Number(match[1]), seconds = Number(match[2]);
    if (seconds > 59) return null;
    return minutes * 60 + seconds;
  }

  function rawNumericValue(event, value) {
    if (event === 'MDL' || event === 'HRP') {
      var n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return timeToSeconds(value);
  }

  function thresholdNumericValue(event, value) {
    return rawNumericValue(event, value);
  }

  function scoreEventWithData(data, event, raw, age, sex, standard) {
    var band = ageBand(age);
    var eventData = data && data.events && data.events[event];
    if (!band || !eventData) return null;
    var columnSex = standard === 'combat' ? 'M' : String(sex || '').toUpperCase();
    if (columnSex !== 'M' && columnSex !== 'F') return null;
    var rows = eventData.columns && eventData.columns[band] && eventData.columns[band][columnSex];
    var value = rawNumericValue(event, raw);
    if (!rows || value === null) return null;

    for (var i = 0; i < rows.length; i++) {
      var points = Number(rows[i][0]);
      var threshold = thresholdNumericValue(event, rows[i][1]);
      if (threshold === null) continue;
      if (eventData.direction === 'higher' ? value >= threshold : value <= threshold) return points;
    }
    return 0;
  }

  function scoreAftWithData(data, options) {
    var raw = options && options.raw || {};
    var scores = {};
    var complete = true;
    AFT_EVENTS.forEach(function (event) {
      var points = scoreEventWithData(data, event, raw[event], options.age, options.sex, options.standard);
      scores[event] = points;
      if (points === null) complete = false;
    });
    if (!complete) return { complete: false, scores: scores, total: null, pass: false };
    var total = AFT_EVENTS.reduce(function (sum, event) { return sum + scores[event]; }, 0);
    var target = options.standard === 'combat' ? 350 : 300;
    var pass = total >= target && AFT_EVENTS.every(function (event) { return scores[event] >= 60; });
    return { complete: true, scores: scores, total: total, target: target, pass: pass };
  }

  function loadAftData() {
    if (aftDataPromise) return aftDataPromise;
    aftDataPromise = fetch(AFT_SCORING_URL, { cache: 'force-cache' }).then(function (response) {
      if (!response.ok) throw new Error('AFT scoring tables are unavailable.');
      return response.json();
    }).then(function (data) {
      if (!data || data.version !== '250601' || !data.events) throw new Error('AFT scoring table version is invalid.');
      return data;
    });
    return aftDataPromise;
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


  function ensureJsZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (jsZipPromise) return jsZipPromise;
    jsZipPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-pibase-jszip]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(window.JSZip); }, { once: true });
        existing.addEventListener('error', function () { reject(new Error('Could not load the batch ZIP generator.')); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = JSZIP_URL;
      script.defer = true;
      script.dataset.pibaseJszip = '1';
      script.onload = function () { resolve(window.JSZip); };
      script.onerror = function () { reject(new Error('Could not load the batch ZIP generator.')); };
      document.head.appendChild(script);
    });
    return jsZipPromise;
  }

  function bytesToBase64(bytes) {
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    var binary = atob(String(base64 || ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function validateTemplate(PDFLib, bytes) {
    var pdf = await PDFLib.PDFDocument.load(bytes);
    if (pdf.getPageCount() !== 1) throw new Error('This is not the one-page Stripes for Skills form.');
    var form = pdf.getForm();
    var fields = form.getFields();
    var names = new Set(fields.map(function (field) { return field.getName(); }));
    var missing = EXPECTED_TEMPLATE_FIELDS.filter(function (name) { return !names.has(name); });
    if (missing.length) {
      throw new Error('Wrong or incompatible Stripes for Skills PDF. Missing ' + missing.length + ' expected fields.');
    }
    return { fieldCount: fields.length };
  }

  async function readBundledTemplate(PDFLib) {
    try {
      var response = await fetch(OFFICIAL_TEMPLATE_URL, { cache: 'force-cache' });
      if (!response.ok) return null;
      var bytes = new Uint8Array(await response.arrayBuffer());
      var meta = await validateTemplate(PDFLib, bytes);
      return { bytes: bytes, source: 'bundled', fieldCount: meta.fieldCount };
    } catch (_) {
      return null;
    }
  }

  async function readSavedTemplate(PDFLib) {
    var saved = '';
    try { saved = localStorage.getItem(TEMPLATE_STORAGE_KEY) || ''; } catch (_) {}
    if (!saved) return null;
    try {
      var bytes = base64ToBytes(saved);
      var meta = await validateTemplate(PDFLib, bytes);
      return { bytes: bytes, source: 'saved', fieldCount: meta.fieldCount };
    } catch (err) {
      try { localStorage.removeItem(TEMPLATE_STORAGE_KEY); } catch (_) {}
      console.warn('Saved Stripes template was invalid and has been cleared.', err);
      return null;
    }
  }

  async function getOfficialTemplate(PDFLib) {
    if (templateState && templateState.bytes) return templateState;
    templateState = await readBundledTemplate(PDFLib);
    if (!templateState) templateState = await readSavedTemplate(PDFLib);
    return templateState;
  }

  async function saveImportedTemplate(file) {
    var PDFLib = await ensurePdfLib();
    var bytes = new Uint8Array(await file.arrayBuffer());
    var meta = await validateTemplate(PDFLib, bytes);
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, bytesToBase64(bytes));
    } catch (err) {
      throw new Error('The official PDF is valid, but this device could not save it for reuse.');
    }
    templateState = { bytes: bytes, source: 'saved', fieldCount: meta.fieldCount };
    return templateState;
  }

  function setText(form, name, value, size) {
    var field = form.getTextField(name);
    field.setText(value);
    if (size) {
      try { field.setFontSize(size); } catch (_) {}
    }
  }

  async function fillOfficialTemplate(PDFLib, options) {
    var template = await getOfficialTemplate(PDFLib);
    if (!template) {
      var err = new Error('Official Stripes for Skills template required.');
      err.code = 'SFS_TEMPLATE_REQUIRED';
      throw err;
    }

    var pdf = await PDFLib.PDFDocument.load(template.bytes);
    var form = pdf.getForm();
    var font = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    var soldier = (options.rank + ' ' + options.name).trim().toUpperCase();
    var enlistmentStamp = stamp(options.enlistmentDate);
    var redStamp = stamp(options.redDate);
    var whiteStamp = stamp(options.whiteDate);

    setText(form, 'Date', todayYmd(), 7);
    setText(form, 'NAME  RANK', soldier, 8);
    setText(form, 'PLATOON SGTUNIT', RECRUITER_LINE, 9);

    ENLISTMENT_FIELDS.forEach(function (name) { setText(form, name, enlistmentStamp, 7); });
    OFFICIAL_RED_FIELDS.forEach(function (name) { setText(form, name, redStamp, 7); });
    OFFICIAL_WHITE_FIELDS.forEach(function (name) { setText(form, name, whiteStamp, 7); });

    if (options.aft && options.aft.complete) {
      var aftStamp = stamp(options.aft.date);
      AFT_EVENTS.forEach(function (event) {
        var fields = AFT_FIELDS[event];
        setText(form, fields.raw, String(options.aft.raw[event]), 7);
        setText(form, fields.score, String(options.aft.scores[event]), 7);
        setText(form, fields.date, aftStamp, 7);
      });
    }

    // The Standing Power Throw row is not part of the current five-event AFT.
    setText(form, 'Meters', '', 7);
    setText(form, 'Points_2', '', 7);

    form.updateFieldAppearances(font);
    form.flatten();
    return pdf.save({ useObjectStreams: false });
  }

  async function makePdf(options) {
    var PDFLib = await ensurePdfLib();
    return fillOfficialTemplate(PDFLib, options);
  }

  function clearGeneratedPdf() {
    if (generatedPdf && generatedPdf.url) URL.revokeObjectURL(generatedPdf.url);
    generatedPdf = null;
    var actions = document.getElementById('sfsResultActions');
    var preview = document.getElementById('sfsPreviewBtn');
    if (actions) actions.classList.add('hidden');
    if (preview) preview.removeAttribute('href');
  }

  function storeGeneratedPdf(bytes, name) {
    clearGeneratedPdf();
    var blob = new Blob([bytes], { type: 'application/pdf' });
    generatedPdf = {
      bytes: bytes,
      name: name,
      blob: blob,
      url: URL.createObjectURL(blob)
    };
    var actions = document.getElementById('sfsResultActions');
    var preview = document.getElementById('sfsPreviewBtn');
    if (preview) preview.href = generatedPdf.url;
    if (actions) actions.classList.remove('hidden');
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
      '.sfs-panel{width:min(100%,540px);max-height:92vh;overflow:auto;background:var(--surface);border:1px solid var(--line-bright);border-radius:12px 12px 6px 6px;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.45)}',
      '.sfs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:8px}',
      '.sfs-head h2{font-family:var(--font-display);font-size:1.15rem;margin:0}',
      '.sfs-close{background:none;border:0;color:var(--text-muted);font-size:1.5rem;line-height:1;padding:0 2px}',
      '.sfs-template-card{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg-raised);border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin:12px 0}',
      '.sfs-template-card strong{display:block;font-size:.78rem}',
      '.sfs-template-card span{display:block;color:var(--text-muted);font-size:.7rem;margin-top:2px}',
      '.sfs-template-card .btn{width:auto;white-space:nowrap;margin:0}',
      '.sfs-stamp{font-family:var(--font-mono);font-size:.78rem;color:var(--brass);background:var(--bg-raised);border:1px solid var(--line);padding:8px 10px;border-radius:4px;margin-top:10px}',
      '.sfs-actions{display:grid;grid-template-columns:1fr 1.5fr;gap:8px;margin-top:16px}',
      '.sfs-actions .btn{width:100%;margin:0}',
      '.sfs-status{min-height:1.2em;margin-top:8px;font-size:.76rem;color:var(--teal)}',
      '.sfs-result-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}',
      '.sfs-result-actions .btn{width:100%;margin:0;text-align:center;text-decoration:none}',
      '.sfs-batch-list{display:grid;gap:7px;margin:12px 0;max-height:34vh;overflow:auto;padding-right:2px}',
      '.sfs-batch-row{display:grid;grid-template-columns:92px 1fr;gap:8px;align-items:end;background:var(--bg-raised);border:1px solid var(--line);border-radius:5px;padding:8px}',
      '.sfs-batch-row label{margin:0 0 3px;font-size:.64rem}',
      '.sfs-batch-row select,.sfs-batch-row input{margin:0;min-height:40px}',
      '.sfs-progress{height:7px;background:var(--bg-raised);border:1px solid var(--line);border-radius:99px;overflow:hidden;margin-top:8px}',
      '.sfs-progress>span{display:block;height:100%;width:0;background:var(--brass);transition:width .15s ease}',
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
    helper.textContent = 'Fills the official Army form with JV/YYYYMMDD Red/White phase stamps.';

    notesTitle.parentNode.insertBefore(title, notesTitle);
    notesTitle.parentNode.insertBefore(button, notesTitle);
    notesTitle.parentNode.insertBefore(helper, notesTitle);
    return button;
  }

  async function refreshTemplateStatus() {
    var status = document.getElementById('sfsTemplateStatus');
    var detail = document.getElementById('sfsTemplateDetail');
    var button = document.getElementById('sfsTemplateBtn');
    if (!status || !detail || !button) return;

    status.textContent = 'Checking official template…';
    detail.textContent = 'One-time setup on this device.';
    button.textContent = 'Import PDF';

    try {
      var PDFLib = await ensurePdfLib();
      var template = await getOfficialTemplate(PDFLib);
      if (template) {
        status.textContent = 'Official template ready';
        detail.textContent = template.source === 'bundled'
          ? 'Built into PIBASE • ' + template.fieldCount + ' fields verified'
          : 'Saved on this device • ' + template.fieldCount + ' fields verified';
        button.textContent = template.source === 'bundled' ? 'Template OK' : 'Replace';
        button.disabled = template.source === 'bundled';
        return;
      }
    } catch (err) {
      console.warn('Could not check Stripes template', err);
    }

    status.textContent = 'Official template required';
    detail.textContent = 'Import the blank Stripes for Skills PDF once; PIBASE will remember it.';
    button.textContent = 'Import PDF';
    button.disabled = false;
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
        '<div class="helper">PIBASE uses the official Army PDF, fills the selected Soldier and phase dates, then flattens the form for reliable viewing and printing.</div>' +
        '<div class="sfs-template-card"><div><strong id="sfsTemplateStatus">Checking official template…</strong><span id="sfsTemplateDetail">One-time setup on this device.</span></div><button class="btn btn-secondary" id="sfsTemplateBtn" type="button">Import PDF</button></div>' +
        '<input id="sfsTemplateFile" class="hidden" type="file" accept="application/pdf">' +
        '<label for="sfsRank">Rank</label><select id="sfsRank">' + RANKS.map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select>' +
        '<label for="sfsSoldierName">Soldier name</label><input id="sfsSoldierName" type="text" autocomplete="off">' +
        '<div class="field-row"><div><label for="sfsRedDate">Red Phase date</label><input id="sfsRedDate" type="date"></div><div><label for="sfsWhiteDate">White Phase date</label><input id="sfsWhiteDate" type="date"></div></div>' +
        '<div class="sfs-stamp"><div>Red: <span id="sfsRedPreview">JV/________</span></div><div style="margin-top:4px">White: <span id="sfsWhitePreview">JV/________</span></div><div style="margin-top:4px;color:var(--text-muted)">Recruiter: ' + RECRUITER_LINE + '</div></div>' +
        '<div class="sfs-actions"><button class="btn btn-secondary" id="sfsCancelBtn" type="button">Cancel</button><button class="btn btn-primary" id="sfsGenerateBtn" type="button">Generate Official PDF</button></div>' +
        '<div class="sfs-status" id="sfsStatus"></div>' +
        '<div class="sfs-result-actions hidden" id="sfsResultActions"><a class="btn btn-secondary" id="sfsPreviewBtn" target="_blank" rel="noopener">Preview PDF</a><button class="btn btn-primary" id="sfsShareBtn" type="button">Share / Save</button></div>' +
      '</div>';
    document.body.appendChild(modal);

    function close() {
      modal.classList.add('hidden');
      clearGeneratedPdf();
    }

    document.getElementById('sfsCloseBtn').addEventListener('click', close);
    document.getElementById('sfsCancelBtn').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });

    document.getElementById('sfsTemplateBtn').addEventListener('click', function () {
      document.getElementById('sfsTemplateFile').click();
    });

    document.getElementById('sfsTemplateFile').addEventListener('change', async function (e) {
      var file = e.target.files && e.target.files[0];
      var status = document.getElementById('sfsStatus');
      if (!file) return;

      status.style.color = '';
      status.textContent = 'Validating official form…';
      try {
        var template = await saveImportedTemplate(file);
        status.textContent = 'Official template saved. You will not need to import it again on this device.';
        document.getElementById('sfsTemplateStatus').textContent = 'Official template ready';
        document.getElementById('sfsTemplateDetail').textContent = 'Saved on this device • ' + template.fieldCount + ' fields verified';
        document.getElementById('sfsTemplateBtn').textContent = 'Replace';
      } catch (err) {
        console.error('Stripes template import failed', err);
        status.style.color = '#E08B77';
        status.textContent = err && err.message ? err.message : 'That PDF is not the expected Stripes for Skills form.';
      } finally {
        e.target.value = '';
      }
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
      status.textContent = 'Generating official PDF…';
      button.disabled = true;
      clearGeneratedPdf();

      try {
        var bytes = await makePdf({ rank: rank, name: name, redDate: redDate, whiteDate: whiteDate });
        storeGeneratedPdf(bytes, name);
        status.textContent = 'Official PDF ready. Preview it before sharing or saving.';
      } catch (err) {
        console.error('Stripes for Skills generation failed', err);
        status.style.color = '#E08B77';
        if (err && err.code === 'SFS_TEMPLATE_REQUIRED') {
          status.textContent = 'Import the official blank Stripes for Skills PDF first.';
          document.getElementById('sfsTemplateFile').click();
        } else {
          status.textContent = err && err.message ? err.message : 'Could not generate the PDF.';
        }
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById('sfsShareBtn').addEventListener('click', async function () {
      if (!generatedPdf) return;
      var status = document.getElementById('sfsStatus');
      var result = await shareOrDownload(generatedPdf.bytes, generatedPdf.name);
      if (result === 'cancelled') status.textContent = 'PDF ready. Share cancelled.';
      else status.textContent = result === 'shared' ? 'PDF shared.' : 'PDF saved/downloaded.';
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
    document.getElementById('sfsStatus').style.color = '';
    clearGeneratedPdf();
    modal.classList.remove('hidden');
    refreshTemplateStatus();
    setTimeout(function () { document.getElementById('sfsRedDate').focus(); }, 0);
  }


  function ensureBatchModal() {
    var modal = document.getElementById('sfsBatchModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'sfsBatchModal';
    modal.className = 'sfs-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'sfsBatchTitle');
    modal.innerHTML = '' +
      '<div class="sfs-panel">' +
        '<div class="sfs-head"><div><div class="eyebrow">BATCH DOCUMENTS</div><h2 id="sfsBatchTitle">Batch Stripes for Skills</h2></div><button class="sfs-close" id="sfsBatchCloseBtn" type="button" aria-label="Close">×</button></div>' +
        '<div class="helper">One Red Phase date and one White Phase date will be applied to every selected Soldier. Confirm each rank before generating.</div>' +
        '<div class="field-row"><div><label for="sfsBatchRedDate">Red Phase date</label><input id="sfsBatchRedDate" type="date"></div><div><label for="sfsBatchWhiteDate">White Phase date</label><input id="sfsBatchWhiteDate" type="date"></div></div>' +
        '<div class="sfs-stamp"><div>Red: <span id="sfsBatchRedPreview">JV/________</span></div><div style="margin-top:4px">White: <span id="sfsBatchWhitePreview">JV/________</span></div></div>' +
        '<div class="section-title" style="margin-top:14px">Selected Soldiers <span id="sfsBatchCount"></span></div>' +
        '<div class="sfs-batch-list" id="sfsBatchList"></div>' +
        '<div class="sfs-actions"><button class="btn btn-secondary" id="sfsBatchCancelBtn" type="button">Cancel</button><button class="btn btn-primary" id="sfsBatchGenerateBtn" type="button">Create ZIP</button></div>' +
        '<div class="sfs-progress hidden" id="sfsBatchProgress"><span id="sfsBatchProgressBar"></span></div>' +
        '<div class="sfs-status" id="sfsBatchStatus"></div>' +
      '</div>';
    document.body.appendChild(modal);

    function close() {
      modal.classList.add('hidden');
      batchApplicants = [];
    }

    document.getElementById('sfsBatchCloseBtn').addEventListener('click', close);
    document.getElementById('sfsBatchCancelBtn').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    ['sfsBatchRedDate', 'sfsBatchWhiteDate'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', function () {
        var red = document.getElementById('sfsBatchRedDate').value;
        var white = document.getElementById('sfsBatchWhiteDate').value;
        document.getElementById('sfsBatchRedPreview').textContent = red ? stamp(red) : 'JV/________';
        document.getElementById('sfsBatchWhitePreview').textContent = white ? stamp(white) : 'JV/________';
      });
    });

    document.getElementById('sfsBatchGenerateBtn').addEventListener('click', async function () {
      var button = this;
      var status = document.getElementById('sfsBatchStatus');
      var progress = document.getElementById('sfsBatchProgress');
      var progressBar = document.getElementById('sfsBatchProgressBar');
      var redDate = document.getElementById('sfsBatchRedDate').value;
      var whiteDate = document.getElementById('sfsBatchWhiteDate').value;
      if (!redDate || !whiteDate) {
        status.style.color = '#E08B77';
        status.textContent = 'Both phase dates are required.';
        return;
      }
      if (whiteDate < redDate) {
        status.style.color = '#E08B77';
        status.textContent = 'White Phase date cannot be before Red Phase date.';
        return;
      }

      var rows = Array.from(document.querySelectorAll('#sfsBatchList .sfs-batch-row'));
      var soldiers = rows.map(function (row) {
        return {
          id: row.dataset.id || '',
          rank: row.querySelector('[data-batch-rank]').value,
          name: cleanName(row.querySelector('[data-batch-name]').value)
        };
      }).filter(function (soldier) { return soldier.name; });
      if (!soldiers.length) {
        status.style.color = '#E08B77';
        status.textContent = 'No valid Soldier names are selected.';
        return;
      }

      status.style.color = '';
      status.textContent = 'Preparing official forms…';
      progress.classList.remove('hidden');
      progressBar.style.width = '0%';
      button.disabled = true;

      try {
        var pair = await Promise.all([ensurePdfLib(), ensureJsZip()]);
        var PDFLib = pair[0];
        var JSZip = pair[1];
        var template = await getOfficialTemplate(PDFLib);
        if (!template) {
          var missing = new Error('Official Stripes for Skills template required.');
          missing.code = 'SFS_TEMPLATE_REQUIRED';
          throw missing;
        }

        var zip = new JSZip();
        var usedNames = {};
        for (var i = 0; i < soldiers.length; i++) {
          var soldier = soldiers[i];
          status.textContent = 'Creating ' + (i + 1) + ' of ' + soldiers.length + ': ' + soldier.name;
          var bytes = await fillOfficialTemplate(PDFLib, {
            rank: soldier.rank,
            name: soldier.name,
            redDate: redDate,
            whiteDate: whiteDate
          });
          var filename = safeFilename(soldier.name);
          var key = filename.toLowerCase();
          if (usedNames[key]) {
            usedNames[key] += 1;
            filename = filename.replace(/\.pdf$/i, '_' + usedNames[key] + '.pdf');
          } else {
            usedNames[key] = 1;
          }
          zip.file(filename, bytes);
          progressBar.style.width = Math.round(((i + 1) / soldiers.length) * 82) + '%';
        }

        status.textContent = 'Packaging ' + soldiers.length + ' PDFs…';
        var blob = await zip.generateAsync(
          { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
          function (meta) { progressBar.style.width = (82 + Math.round(meta.percent * 0.18)) + '%'; }
        );
        progressBar.style.width = '100%';

        var zipName = 'Stripes_for_Skills_Batch_' + todayYmd() + '.zip';
        var file = null;
        try { file = new File([blob], zipName, { type: 'application/zip' }); } catch (_) {}
        var shared = false;
        if (file && navigator.share && navigator.canShare) {
          try {
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: 'Stripes for Skills batch' });
              shared = true;
            }
          } catch (err) {
            if (!(err && err.name === 'AbortError')) console.warn('Batch share unavailable; using download fallback.', err);
          }
        }
        if (!shared) {
          var url = URL.createObjectURL(blob);
          var link = document.createElement('a');
          link.href = url;
          link.download = zipName;
          link.rel = 'noopener';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        }

        status.textContent = shared
          ? soldiers.length + ' official PDFs created and shared.'
          : soldiers.length + ' official PDFs created in one ZIP.';
      } catch (err) {
        console.error('Batch Stripes generation failed', err);
        status.style.color = '#E08B77';
        status.textContent = err && err.message ? err.message : 'Could not create the batch.';
      } finally {
        button.disabled = false;
      }
    });

    return modal;
  }

  function renderBatchApplicants(records) {
    var list = document.getElementById('sfsBatchList');
    list.innerHTML = '';
    records.forEach(function (record, index) {
      var parsed = inferRankAndName(record && record.name ? record.name : '');
      var rank = RANKS.indexOf(String(record && record.rank || '').toUpperCase()) >= 0
        ? String(record.rank).toUpperCase()
        : parsed.rank;
      var row = document.createElement('div');
      row.className = 'sfs-batch-row';
      row.dataset.id = String(record && record.id || index);

      var rankWrap = document.createElement('div');
      var rankLabel = document.createElement('label');
      rankLabel.textContent = 'Rank';
      var select = document.createElement('select');
      select.setAttribute('data-batch-rank', '1');
      RANKS.forEach(function (value) {
        var option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        if (value === rank) option.selected = true;
        select.appendChild(option);
      });
      rankWrap.appendChild(rankLabel);
      rankWrap.appendChild(select);

      var nameWrap = document.createElement('div');
      var nameLabel = document.createElement('label');
      nameLabel.textContent = 'Soldier ' + (index + 1);
      var input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('data-batch-name', '1');
      input.value = parsed.name || cleanName(record && record.name || '');
      nameWrap.appendChild(nameLabel);
      nameWrap.appendChild(input);

      row.appendChild(rankWrap);
      row.appendChild(nameWrap);
      list.appendChild(row);
    });
    document.getElementById('sfsBatchCount').textContent = '(' + records.length + ')';
  }

  function openBatch(records) {
    var clean = Array.isArray(records) ? records.filter(function (record) {
      return record && cleanName(record.name);
    }) : [];
    if (!clean.length) return false;

    injectStyles();
    ensureBatchModal();
    batchApplicants = clean.slice();
    renderBatchApplicants(batchApplicants);
    document.getElementById('sfsBatchRedDate').value = '';
    document.getElementById('sfsBatchWhiteDate').value = '';
    document.getElementById('sfsBatchRedPreview').textContent = 'JV/________';
    document.getElementById('sfsBatchWhitePreview').textContent = 'JV/________';
    document.getElementById('sfsBatchStatus').textContent = '';
    document.getElementById('sfsBatchStatus').style.color = '';
    document.getElementById('sfsBatchProgress').classList.add('hidden');
    document.getElementById('sfsBatchProgressBar').style.width = '0%';
    document.getElementById('sfsBatchModal').classList.remove('hidden');
    setTimeout(function () { document.getElementById('sfsBatchRedDate').focus(); }, 0);
    return true;
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
    templateStorageKey: TEMPLATE_STORAGE_KEY,
    expectedTemplateFields: EXPECTED_TEMPLATE_FIELDS.slice(),
    tasks: TASKS.map(function (task) { return { text: task.text, phase: task.phase }; }),
    officialRedFields: OFFICIAL_RED_FIELDS.slice(),
    officialWhiteFields: OFFICIAL_WHITE_FIELDS.slice(),
    openBatch: openBatch,
    jsZipUrl: JSZIP_URL
  };
}());
