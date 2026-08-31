// APPLEMDT Tracker — Firebase config + shared data helpers
// Loaded as an ES module by both index.html (edit view) and display.html (TV view)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
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

const firebaseConfig = {
  apiKey: "AIzaSyAp-OSq87o6e4XBsSryh5ozwzw5543oKQE",
  authDomain: "pi-base-a3a09.firebaseapp.com",
  projectId: "pi-base-a3a09",
  storageBucket: "pi-base-a3a09.firebasestorage.app",
  messagingSenderId: "693559040921",
  appId: "1:693559040921:web:52651b1709f3610dd01108"
};

// Published iCloud calendar used by the PIBASE kiosk Today screen.
// display.html reads this value from localStorage, so seed it automatically
// on every load and remove the need for one-time Alt+C setup.
const PIBASE_CALENDAR_FEED = "https://p158-caldav.icloud.com/published/2/ODEzNzc2MzQ5ODEzNzc2M7dOWSENm8pADV3MQ_WsD963YRXzTCInAwMYiWPaL99qSEwKJrZPtb9TXTH_7CrrWf0IO-zFh1HNQP2FQ3pBbCQ";
try {
  localStorage.setItem('pibase.calendarFeedUrl', PIBASE_CALENDAR_FEED);
} catch (error) {
  console.warn('Unable to seed PIBASE calendar feed.', error);
}

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export {
  collection, doc, addDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp,
  signInWithEmailAndPassword, onAuthStateChanged, signOut
};

// ---- Shared constants ----
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
