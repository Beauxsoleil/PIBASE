import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-pibase-muse',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries({
      owner: { role: 'owner', enabled: true },
      muse: { role: 'assistant', enabled: true, read: true, write: true },
      readonly: { role: 'assistant', enabled: true, read: true, write: false },
      kiosk: { role: 'kiosk', enabled: true },
      disabled: { role: 'assistant', enabled: false, read: true, write: true }
    })) await setDoc(doc(db, 'access', uid), data);
    await setDoc(doc(db, 'applicants/a'), { name: 'Synthetic Test', updatedAt: serverTimestamp() });
    await setDoc(doc(db, 'applicants/archived'), { name: 'Synthetic Archived', archived: true });
    await setDoc(doc(db, 'applicants/legacy'), { name: 'Synthetic Legacy', archiveFolder: 'cowards' });
    await setDoc(doc(db, 'applicants/a/notes/old'), { text: 'Synthetic history' });
    await setDoc(doc(db, 'settings/mission'), { target: 10 });
  });
});
function db(uid, provider = 'password') {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }).firestore();
}
const audit = () => ({ updatedBy: 'muse', updatedAt: serverTimestamp() });

test('unknown, disabled, and unauthenticated clients cannot read PII', async () => {
  for (const client of [db('unknown'), db('disabled'), db('random', 'anonymous'), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(client, 'applicants/a')));
    await assertFails(getDoc(doc(client, 'settings/mission')));
  }
});
test('owner retains phone writes with absent optional applicant fields', async () => {
  await assertSucceeds(setDoc(doc(db('owner'), 'applicants/new'), { name: 'Synthetic Owner' }));
  await assertSucceeds(updateDoc(doc(db('owner'), 'applicants/a'), { archived: true, archiveFolder: 'cowards' }));
  await assertSucceeds(setDoc(doc(db('owner'), 'settings/mission'), { target: 20 }));
});
test('only enrolled kiosk UID can read; anonymous users never write', async () => {
  const client = db('kiosk', 'anonymous');
  await assertSucceeds(getDocs(collection(client, 'applicants')));
  await assertFails(updateDoc(doc(client, 'applicants/a'), { name: 'Changed' }));
  await assertFails(setDoc(doc(client, 'settings/mission'), { target: 1 }));
  await assertFails(getDoc(doc(db('owner', 'anonymous'), 'applicants/a')));
});
test('Muse can create and update attributed active applicants', async () => {
  const client = db('muse');
  await assertSucceeds(getDocs(collection(client, 'applicants')));
  await assertSucceeds(setDoc(doc(client, 'applicants/new'), { name: 'Synthetic Muse', ...audit() }));
  await assertSucceeds(updateDoc(doc(client, 'applicants/a'), { nextAction: 'Synthetic follow-up', ...audit() }));
  await assertFails(updateDoc(doc(client, 'applicants/a'), { name: '' , ...audit() }));
  await assertFails(updateDoc(doc(client, 'applicants/a'), { age: '20', ...audit() }));
});
test('Muse writes require its UID and a server timestamp', async () => {
  const ref = doc(db('muse'), 'applicants/a');
  await assertFails(updateDoc(ref, { name: 'Missing attribution' }));
  await assertFails(updateDoc(ref, { ...audit(), updatedBy: 'owner' }));
  await assertFails(updateDoc(ref, { ...audit(), updatedAt: 'today' }));
});
test('Muse cannot archive, restore, or edit archived applicants', async () => {
  const client = db('muse');
  await assertFails(updateDoc(doc(client, 'applicants/a'), { ...audit(), archived: true }));
  await assertFails(updateDoc(doc(client, 'applicants/archived'), { ...audit(), archived: false }));
  for (const id of ['archived', 'legacy']) {
    await assertFails(updateDoc(doc(client, 'applicants', id), { ...audit(), name: 'Changed' }));
    await assertFails(setDoc(doc(client, 'applicants', id, 'notes/new'), { text: 'Synthetic', createdAt: serverTimestamp(), ...audit() }));
  }
});
test('Muse notes are append-only and need an active parent', async () => {
  const client = db('muse');
  const note = { text: 'Synthetic note', createdAt: serverTimestamp(), ...audit() };
  await assertSucceeds(setDoc(doc(client, 'applicants/a/notes/new'), note));
  await assertFails(updateDoc(doc(client, 'applicants/a/notes/old'), note));
  await assertFails(setDoc(doc(client, 'applicants/missing/notes/new'), note));
  await assertFails(setDoc(doc(client, 'applicants/a/notes/empty'), { ...note, text: '' }));
});
test('Muse can save events/results but cannot change mission or grant access', async () => {
  const client = db('muse');
  await assertSucceeds(setDoc(doc(client, 'events/new'), { name: 'Synthetic Event', date: '2026-09-29', ...audit() }));
  await assertSucceeds(setDoc(doc(client, 'eventResults/new'), { summary: 'Synthetic Result', start: '2026-09-29', ...audit() }));
  await assertFails(setDoc(doc(client, 'settings/mission'), { target: 999 }));
  await assertFails(setDoc(doc(client, 'access/muse'), { role: 'owner', enabled: true }));
  await assertFails(getDoc(doc(client, 'access/muse')));
});
test('read-only assistant cannot write, and revocation affects an existing context', async () => {
  await assertSucceeds(getDoc(doc(db('readonly'), 'applicants/a')));
  await assertFails(updateDoc(doc(db('readonly'), 'applicants/a'), { name: 'Changed' }));
  const client = db('muse');
  await assertSucceeds(getDoc(doc(client, 'applicants/a')));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'access/muse'), { enabled: false }));
  await assertFails(getDoc(doc(client, 'applicants/a')));
  await assertFails(updateDoc(doc(client, 'applicants/a'), { ...audit(), name: 'Changed' }));
});
test('all client roles are denied hard deletion and unknown paths', async () => {
  for (const uid of ['owner', 'muse', 'kiosk']) {
    const client = db(uid);
    for (const path of ['applicants/a', 'applicants/a/notes/old', 'events/new', 'eventResults/new', 'settings/mission']) {
      await assertFails(deleteDoc(doc(client, path)));
    }
    await assertFails(setDoc(doc(client, 'unknown/new'), { text: 'Synthetic' }));
  }
});
