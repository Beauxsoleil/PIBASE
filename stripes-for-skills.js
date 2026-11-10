/* PIBASE Stripes for Skills generator.
 * Fills the official one-page Stripes for Skills AcroForm client-side.
 * No applicant data leaves the browser and no Firestore writes are performed.
 */
(function () {
  'use strict';

  var PDF_LIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  var TEMPLATE_PARTS = [
    './assets/stripes-for-skills-template-1.b64',
    './assets/stripes-for-skills-template-2.b64',
    './assets/stripes-for-skills-template-3.b64',
    './assets/stripes-for-skills-template-4.b64'
  ];
  var INITIALS = 'JV';
  var RECRUITER_LINE = 'SSG VIOLA/ DET 3 RSP';

  var RED_FIELDS = [
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
    'Basic Lead Qualification Skills APPLEMD'
  ];

  var WHITE_FIELDS = [
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
    'Points',
    'Points_2',
    'Points_3',
    'Points_4',
    'Points_5',
    'Points_6',
    'Land Navigation',
    'Identify Terrain Features on a Map',
    'Determine Grid Coordinates on a Map',
    'Perform First Aid for Splinting a Fracture'
  ];

  var RANKS = ['PVT', 'PV2', 'PFC', 'SPC', 'CPL', 'SGT', 'SSG', 'SFC', 'MSG', '1SG', 'SGM', 'CSM'];
  var pdfLibPromise = null;
  var templatePromise = null;

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

  function base64ToBytes(base64) {
    var clean = String(base64 || '').replace(/\s+/g, '');
    var binary = atob(clean);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function loadTemplate() {
    if (templatePromise) return templatePromise;
    templatePromise = Promise.all(TEMPLATE_PARTS.map(function (url) {
      return fetch(url, { cache: 'force-cache' }).then(function (res) {
        if (!res.ok) throw new Error('Stripes for Skills template is unavailable.');
        return res.text();
      });
    })).then(function (parts) { return base64ToBytes(parts.join('')); });
    return templatePromise;
  }

  function setText(form, fieldName, value, fontSize) {
    var field = form.getTextField(fieldName);
    field.setText(value);
    if (fontSize) {
      try { field.setFontSize(fontSize); } catch (_) {}
    }
  }

  async function makePdf(options) {
    var pair = await Promise.all([ensurePdfLib(), loadTemplate()]);
    var PDFLib = pair[0];
    var template = pair[1];
    var pdf = await PDFLib.PDFDocument.load(template);
    var form = pdf.getForm();
    var redStamp = stamp(options.redDate);
    var whiteStamp = stamp(options.whiteDate);
    var nameRank = (options.rank + ' ' + options.name).trim().toUpperCase();

    setText(form, 'Date', todayYmd(), 8);
    setText(form, 'NAME  RANK', nameRank, 8);
    setText(form, 'PLATOON SGTUNIT', RECRUITER_LINE, 8);

    RED_FIELDS.forEach(function (fieldName) { setText(form, fieldName, redStamp, 7); });
    WHITE_FIELDS.forEach(function (fieldName) { setText(form, fieldName, whiteStamp, 7); });

    // Leave Trainer's Signature and Commander's Verification untouched so the
    // finished document can still be signed/verified through the normal process.
    try { form.updateFieldAppearances(); } catch (_) {}
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
        '<div class="helper">PIBASE will fill the Soldier name, your recruiter line, and every Red/White completion box. Trainer signature and commander verification stay blank.</div>' +
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
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });

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
        status.textContent = 'Could not generate the PDF. Reconnect and try again.';
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
    var button = document.getElementById('stripesForSkillsBtn');
    if (!button) return;
    injectStyles();
    ensureModal();
    button.addEventListener('click', openModal);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  // Small test hook used by repository smoke tests; no applicant data is exposed.
  window.__PIBASE_SFS__ = { ymd: ymd, stamp: stamp, redFields: RED_FIELDS.slice(), whiteFields: WHITE_FIELDS.slice() };
}());
