// APPLEMDT Tracker — Firebase config + shared data helpers
// Loaded as an ES module by both index.html (edit view) and display.html (TV view)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  onSnapshot as firestoreOnSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initKioskRuntime } from './kiosk-runtime.js';
import { initEventsUi } from './events-ui.js';

const firebaseConfig = {
  apiKey: "AIzaSyAp-OSq87o6e4XBsSryh5ozwzw5543oKQE",
  authDomain: "pi-base-a3a09.firebaseapp.com",
  projectId: "pi-base-a3a09",
  storageBucket: "pi-base-a3a09.firebasestorage.app",
  messagingSenderId: "693559040921",
  appId: "1:693559040921:web:52651b1709f3610dd01108"
};

const isKiosk = typeof window !== 'undefined' && /\/display\.html$/.test(window.location.pathname);

const PIBASE_CALENDAR_FEED = './calendar.ics';
try {
  localStorage.setItem('pibase.calendarFeedUrl', PIBASE_CALENDAR_FEED);
} catch (error) {
  console.warn('Unable to seed PIBASE calendar feed.', error);
}

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

if (isKiosk) {
  enableIndexedDbPersistence(db).catch(error => {
    if (error?.code !== 'failed-precondition' && error?.code !== 'unimplemented') {
      console.warn('PIBASE Firestore offline persistence unavailable', error);
    }
  });
  initKioskRuntime();
}

function referencePath(ref) {
  if (!ref) return '';
  if (typeof ref.path === 'string') return ref.path;
  const path = ref._query?.path || ref._key?.path;
  if (path && typeof path.canonicalString === 'function') return path.canonicalString();
  if (Array.isArray(path?.segments)) return path.segments.join('/');
  return '';
}

function enhancementActive() {
  if (!isKiosk || typeof document === 'undefined') return false;
  return Boolean(
    document.getElementById('eventsScreen')?.classList.contains('active') ||
    document.getElementById('territoryScreen')?.classList.contains('active')
  );
}

// One applicant listener feeds every kiosk screen. When an enhancement screen
// is active, the main Applicant Board render is briefly deferred so hidden
// layout measurement never calculates pagination from a zero-width screen.
export function onSnapshot(reference, ...args) {
  const path = referencePath(reference);

  if (isKiosk && path === 'settings/mission') return () => {};

  const callbackIndex = args.findIndex(arg => typeof arg === 'function');
  if (path === 'applicants' && callbackIndex >= 0 && typeof window !== 'undefined') {
    const original = args[callbackIndex];
    const errorIndex = args.findIndex((arg, index) => index > callbackIndex && typeof arg === 'function');
    const originalError = errorIndex >= 0 ? args[errorIndex] : null;
    let pendingSnapshot = null;

    const deliverMain = snapshot => {
      pendingSnapshot = null;
      return original(snapshot);
    };

    args[callbackIndex] = snapshot => {
      const plainDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      window.__PIBASE_APPLICANTS__ = plainDocs;
      const source = snapshot.metadata?.fromCache ? 'cache' : 'server';
      window.dispatchEvent(new CustomEvent('pibase:firebase-status', { detail: { state: source === 'cache' ? 'cache' : 'ready', source } }));
      window.dispatchEvent(new CustomEvent('pibase:applicants-snapshot', { detail: plainDocs }));

      if (enhancementActive()) {
        pendingSnapshot = snapshot;
        return;
      }
      return deliverMain(snapshot);
    };

    if (errorIndex >= 0) {
      args[errorIndex] = error => {
        window.dispatchEvent(new CustomEvent('pibase:firebase-status', { detail: { state: 'error', error: error?.code || 'unknown' } }));
        return originalError?.(error);
      };
    }

    window.addEventListener('pibase:screen-change', () => {
      if (pendingSnapshot && !enhancementActive()) deliverMain(pendingSnapshot);
    });
  }

  return firestoreOnSnapshot(reference, ...args);
}

export {
  collection, doc, addDoc, updateDoc, setDoc, query, orderBy, serverTimestamp,
  signInWithEmailAndPassword, onAuthStateChanged, signOut
};

export const STAGES = [
  "Initial Appointment",
  "Packet Prep",
  "Processing Authorized",
  "Processing Scheduled",
  "Waiver",
  "Q&E",
  "Enlisted"
];

export const STAGE_SHORT = {
  "Initial Appointment": "INITIAL",
  "Packet Prep": "PACKET",
  "Processing Authorized": "AUTH'D",
  "Processing Scheduled": "SCHED",
  "Waiver": "WAIVER",
  "Q&E": "Q&E",
  "DEP": "Q&E",
  "Enlisted": "ENLISTED"
};

export function needsReview(applicant) {
  return Boolean(
    (applicant.physicalHealth && applicant.physicalHealth.trim()) ||
    (applicant.legalIssues && applicant.legalIssues.trim())
  );
}

if (isKiosk && typeof document !== 'undefined') {
  document.documentElement.style.setProperty('--font-display', "'Arial Narrow', 'Liberation Sans Narrow', Arial, sans-serif");
  document.documentElement.style.setProperty('--font-body', "Arial, 'Liberation Sans', sans-serif");
  document.documentElement.style.setProperty('--font-mono', "'DejaVu Sans Mono', 'Liberation Mono', monospace");
  const perfStyle = document.createElement('style');
  perfStyle.textContent = `
    .card,.progress-fill{transition:none!important}
    .stage-rail .node-wrap.current .dot{box-shadow:none!important}
    #pibaseKioskNav{position:fixed;right:14px;bottom:10px;z-index:46;display:flex;gap:7px;opacity:.8}
    #pibaseKioskNav button{min-width:46px;height:36px;padding:0 10px;border:1px solid var(--line-bright);border-radius:5px;background:var(--bg-raised);color:var(--text-muted);font-family:var(--font-mono);font-size:.62rem;letter-spacing:.04em}
    #pibaseKioskNav button:hover,#pibaseKioskNav button:focus-visible{opacity:1;border-color:var(--brass);color:var(--text)}
  `;
  document.head.appendChild(perfStyle);

  const installNav = () => {
    if (document.getElementById('pibaseKioskNav')) return;
    const nav = document.createElement('div');
    nav.id = 'pibaseKioskNav';
    nav.setAttribute('aria-label', 'Kiosk screen navigation');
    nav.innerHTML = '<button type="button" data-kiosk-key="ArrowUp" aria-label="Previous screen">↑ Screen</button><button type="button" data-kiosk-key="ArrowDown" aria-label="Next screen">↓ Screen</button>';
    nav.addEventListener('click', e => {
      const key = e.target.closest('[data-kiosk-key]')?.dataset.kioskKey;
      if (key) document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
    document.body.appendChild(nav);
  };
  if (document.body) installNav();
  else document.addEventListener('DOMContentLoaded', installNav, { once: true });

  const startedAt = Date.now();
  let lastInteraction = Date.now();
  const noteInteraction = () => { lastInteraction = Date.now(); };
  document.addEventListener('keydown', noteInteraction, { passive: true });
  document.addEventListener('pointerdown', noteInteraction, { passive: true });
  setInterval(() => {
    const now = Date.now();
    const oldEnough = now - startedAt >= 60 * 60 * 1000;
    const idleEnough = now - lastInteraction >= 5 * 60 * 1000;
    if (oldEnough && idleEnough) window.location.reload();
  }, 5 * 60 * 1000);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    initEventsUi({ db, collection, doc, updateDoc, serverTimestamp, onSnapshot, query, orderBy });
  } catch (error) {
    console.warn('PIBASE enhancement UI unavailable', error);
  }
}
