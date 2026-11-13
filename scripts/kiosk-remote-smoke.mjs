// Behavioral tests for the kiosk remote screen routing (events-ui.js) —
// no browser or Firebase required. Node built-ins only.
//
// events-ui.js is imported as a real ES module; the DOM underneath it is
// a hand-rolled shim in the style of scripts/ipad-smoke.mjs. The shim
// covers exactly what initEventsUi touches: element lookup by id,
// .screen queries, classList, innerHTML id registration, and
// window/document event dispatch.
//
// display.html itself cannot be imported (its inline module pulls in
// firebase-config.js, which imports the Firebase CDN), so the test
// simulates display.html's remote-screen handler — activate the
// requested native screen — and asserts the events-ui side of the
// contract: which screens end up active, and which remote-screen events
// a local key exit requests. The display.html handler is covered by
// static assertions in scripts/smoke.mjs.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const NATIVE = ['boardScreen', 'todayScreen', 'calendarScreen', 'pipelineScreen'];
const TITLES = ['Applicant Board', 'Today', 'Calendar', 'Pipeline / Mission'];

// --- Minimal DOM -------------------------------------------------------
const allElements = [];
const registry = new Map();

function escapeText(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function makeElement(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    _classes: new Set(),
    _id: '',
    _innerHTML: '',
    _text: '',
    children: [],
    parentNode: null,
    style: {},
  };
  el.classList = {
    add(...names) { for (const n of names) el._classes.add(n); },
    remove(...names) { for (const n of names) el._classes.delete(n); },
    contains(name) { return el._classes.has(name); },
  };
  Object.defineProperty(el, 'className', {
    get() { return [...el._classes].join(' '); },
    set(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  Object.defineProperty(el, 'id', {
    get() { return el._id; },
    set(v) { el._id = v; if (v) registry.set(v, el); },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._innerHTML; },
    set(v) {
      el._innerHTML = String(v);
      // Register stub elements for ids declared in the markup so
      // getElementById keeps working after a render.
      for (const m of String(v).matchAll(/id="([^"]+)"/g)) {
        if (!registry.has(m[1])) {
          const child = makeElement('div');
          child.id = m[1];
          child.parentNode = el;
          el.children.push(child);
        }
      }
    },
  });
  Object.defineProperty(el, 'textContent', {
    get() { return el._text; },
    set(v) { el._text = String(v); el._innerHTML = escapeText(v); },
  });
  el.appendChild = child => { child.parentNode = el; el.children.push(child); return child; };
  el.insertBefore = (child, ref) => {
    child.parentNode = el;
    const i = ref ? el.children.indexOf(ref) : -1;
    if (i >= 0) el.children.splice(i, 0, child); else el.children.push(child);
    return child;
  };
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  el.setAttribute = (k, v) => { el[k] = v; };
  el.getAttribute = () => null;
  allElements.push(el);
  return el;
}

const documentTarget = new EventTarget();
const windowTarget = new EventTarget();

function matchSelector(el, sel) {
  // Only the selectors events-ui.js uses: '.board', '.screen',
  // '.screen.active', '.screen.active:not(...)' is not used.
  if (sel === '.board') return el.classList.contains('board');
  if (sel === '.screen') return el.classList.contains('screen');
  if (sel === '.screen.active') return el.classList.contains('screen') && el.classList.contains('active');
  return false;
}

const documentShim = {
  readyState: 'complete',
  head: makeElement('head'),
  body: makeElement('body'),
  createElement: tag => makeElement(tag),
  getElementById: id => registry.get(id) || null,
  querySelector: sel => allElements.find(el => matchSelector(el, sel)) || null,
  querySelectorAll: sel => allElements.filter(el => matchSelector(el, sel)),
  addEventListener: (...a) => documentTarget.addEventListener(...a),
  removeEventListener: (...a) => documentTarget.removeEventListener(...a),
  dispatchEvent: e => documentTarget.dispatchEvent(e),
};

const windowShim = {
  location: { pathname: '/PIBASE/display.html' },
  addEventListener: (...a) => windowTarget.addEventListener(...a),
  removeEventListener: (...a) => windowTarget.removeEventListener(...a),
  dispatchEvent: e => windowTarget.dispatchEvent(e),
};

globalThis.window = windowShim;
globalThis.document = documentShim;
// events-ui announces native screen changes on the next frame; run them
// synchronously so assertions see the settled state.
globalThis.requestAnimationFrame = fn => { fn(); return 0; };

// --- Fixture: the display.html skeleton --------------------------------
const board = makeElement('div');
board.className = 'board';
documentShim.body.appendChild(board);
const titleEl = makeElement('h1');
titleEl.id = 'screenTitle';
titleEl.textContent = 'Pipeline / Mission';
board.appendChild(titleEl);
const screens = {};
for (const id of NATIVE) {
  const s = makeElement('section');
  s.className = 'screen';
  s.id = id;
  board.appendChild(s);
  screens[id] = s;
}
screens.pipelineScreen.classList.add('active');
const detailView = makeElement('div');
detailView.id = 'detailView';
board.appendChild(detailView);

// --- Simulated display.html remote-screen handler ----------------------
// Mirrors the fixed handler in display.html: reset the detail view, and
// for native indices activate that screen and announce the change.
// (events-ui's own listener handles 4/5; this one handles 0-3.)
const remoteRequests = [];
windowShim.addEventListener('pibase:remote-screen', e => {
  const n = e.detail?.index;
  remoteRequests.push(n);
  if (!Number.isInteger(n) || n < 0 || n > 3) return;
  detailView.classList.remove('open');
  detailView.innerHTML = '';
  for (const id of NATIVE) screens[id].classList.remove('active');
  screens[NATIVE[n]].classList.add('active');
  titleEl.textContent = TITLES[n];
  windowShim.dispatchEvent(new CustomEvent('pibase:screen-change', { detail: { id: NATIVE[n] } }));
});

// --- Import the real module --------------------------------------------
const { initEventsUi } = await import(join(root, 'events-ui.js'));
initEventsUi({
  db: {},
  collection: () => ({}),
  query: () => ({}),
  orderBy: () => ({}),
  onSnapshot: () => () => {},
});

// --- Helpers ------------------------------------------------------------
function activeScreens() {
  return allElements
    .filter(el => el.classList.contains('screen') && el.classList.contains('active'))
    .map(el => el.id);
}
function remote(n) {
  windowShim.dispatchEvent(new CustomEvent('pibase:remote-screen', { detail: { index: n } }));
}
function key(k) {
  documentShim.dispatchEvent(Object.assign(new Event('keydown'), { key: k }));
}
function assertOneActive(id, msg) {
  assert.deepStrictEqual(activeScreens(), [id], msg);
}

let tests = 0;
function test(name, fn) { fn(); tests++; console.log('PASS ' + name); }

// --- Tests --------------------------------------------------------------
test('init creates the extra screens without activating them', () => {
  assert.ok(documentShim.getElementById('eventsScreen'), 'eventsScreen exists');
  assert.ok(documentShim.getElementById('territoryScreen'), 'territoryScreen exists');
  assertOneActive('pipelineScreen', 'pipeline stays active after init');
});

test('remote selects Recruiting Events and Territory Analytics', () => {
  remote(4);
  assertOneActive('eventsScreen', 'remote 4 shows events');
  assert.strictEqual(titleEl.textContent, 'Recruiting Events');
  remote(5);
  assertOneActive('territoryScreen', 'remote 5 shows territory');
  assert.strictEqual(titleEl.textContent, 'Territory Analytics');
});

test('remote back to a native screen clears the extras', () => {
  remote(4);
  remote(0);
  assertOneActive('boardScreen', 'remote 0 restores the board');
  assert.strictEqual(titleEl.textContent, 'Applicant Board');
  remote(5);
  remote(3);
  assertOneActive('pipelineScreen', 'remote 3 restores pipeline');
});

test('local exit from remotely selected Events returns to the last native screen', () => {
  remote(3);
  remote(4);
  assertOneActive('eventsScreen', 'precondition: events active');
  remoteRequests.length = 0;
  key('ArrowUp');
  assert.ok(remoteRequests.includes(3), 'exit requests the last native screen (pipeline)');
  assertOneActive('pipelineScreen', 'no blank screen: pipeline is active again');
  assert.strictEqual(titleEl.textContent, 'Pipeline / Mission');
});

test('local exit from remotely selected Territory returns to the last native screen', () => {
  remote(0);
  remote(5);
  assertOneActive('territoryScreen', 'precondition: territory active');
  remoteRequests.length = 0;
  key('ArrowDown');
  assert.ok(remoteRequests.includes(0), 'exit requests the last native screen (board)');
  assertOneActive('boardScreen', 'no blank screen: board is active again');
  assert.strictEqual(titleEl.textContent, 'Applicant Board');
});

test('local keys move between the extra screens', () => {
  remote(4);
  key('ArrowDown');
  assertOneActive('territoryScreen', 'events ArrowDown goes to territory');
  key('ArrowUp');
  assertOneActive('eventsScreen', 'territory ArrowUp goes back to events');
});

test('local keys enter and leave extras from the native ends', () => {
  remote(3);
  key('ArrowDown');
  assertOneActive('eventsScreen', 'pipeline ArrowDown enters events');
  key('ArrowUp');
  assertOneActive('pipelineScreen', 'events ArrowUp returns to pipeline');
  remote(0);
  key('ArrowUp');
  assertOneActive('territoryScreen', 'board ArrowUp enters territory');
  key('ArrowDown');
  assertOneActive('boardScreen', 'territory ArrowDown returns to board');
});

test('a stale local route does not override the last native screen', () => {
  // Local pipeline -> events -> pipeline leaves routeOrigin set; a later
  // remote board -> events must still exit to the board, not pipeline.
  remote(3);
  key('ArrowDown');
  assertOneActive('eventsScreen', 'precondition: local entry to events');
  key('ArrowUp');
  assertOneActive('pipelineScreen', 'precondition: local return to pipeline');
  remote(0);
  remote(4);
  assertOneActive('eventsScreen', 'precondition: remote events from board');
  remoteRequests.length = 0;
  key('ArrowUp');
  assert.ok(remoteRequests.includes(0), 'exit requests the board, not the stale pipeline route');
  assertOneActive('boardScreen', 'exit lands on the board');
});

test('video entry then remote to Territory then back to Pipeline', () => {
  // kiosk-control.js select(6) removes .active from every screen and
  // shows the video overlay; simulate that half, then drive the exits.
  remote(3);
  for (const el of documentShim.querySelectorAll('.screen')) el.classList.remove('active');
  assert.deepStrictEqual(activeScreens(), [], 'video state: no screen active');
  remote(5);
  assertOneActive('territoryScreen', 'remote 5 from video shows territory');
  remote(3);
  assertOneActive('pipelineScreen', 'remote 3 from territory shows pipeline');
});

test('exactly one screen is active after every transition', () => {
  // Walk the full remote cycle twice; the invariant must hold at each step.
  for (const n of [0, 1, 2, 3, 4, 5, 3, 4, 0, 5, 1, 2]) {
    remote(n);
    assert.strictEqual(activeScreens().length, 1, `remote ${n} must leave exactly one screen active`);
  }
});

console.log(`${tests} kiosk remote tests passed.`);
