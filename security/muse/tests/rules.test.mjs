import { readFile } from 'node:fs/promises';
import assert from 'node:assert';
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
      sync: { role: 'sync', enabled: true, read: true, write: true },
      reviewer1: { role: 'reviewer', enabled: true, read: true },
      kiosk: { role: 'kiosk', enabled: true },
      disabled: { role: 'assistant', enabled: false, read: true, write: true }
    })) await setDoc(doc(db, 'access', uid), data);
    await setDoc(doc(db, 'applicants/a'), { name: 'Synthetic Test', updatedAt: serverTimestamp() });
    await setDoc(doc(db, 'applicants/archived'), { name: 'Synthetic Archived', archived: true });
    await setDoc(doc(db, 'applicants/legacy'), { name: 'Synthetic Legacy', archiveFolder: 'cowards' });
    await setDoc(doc(db, 'applicants/a/notes/old'), { text: 'Synthetic history' });
    await setDoc(doc(db, 'kioskApplicants/a'), { name: 'Synthetic Test', updatedAt: serverTimestamp() });
    await setDoc(doc(db, 'kioskApplicants/enlisted-new'), { name: 'Synthetic Enlisted', statusStage: 'Enlisted', archived: true, archiveFolder: 'enlisted', updatedAt: serverTimestamp() });
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
    await assertFails(getDoc(doc(client, 'kioskApplicants/a')));
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
  // Kiosk reads ONLY the sanitized mirror collection.
  await assertSucceeds(getDocs(collection(client, 'kioskApplicants')));
  await assertSucceeds(getDoc(doc(client, 'kioskApplicants/a')));
  // Full applicant documents and notes are closed to kiosk auth.
  await assertFails(getDoc(doc(client, 'applicants/a')));
  await assertFails(getDocs(collection(client, 'applicants')));
  await assertFails(getDoc(doc(client, 'applicants/a/notes/old')));
  await assertFails(updateDoc(doc(client, 'kioskApplicants/a'), { name: 'Changed' }));
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
test('enlisted folder filing follows the owner-only archive boundary', async () => {
  const owner = db('owner');
  const muse = db('muse');
  // Owner files an active applicant into the Enlisted folder (manual action).
  await assertSucceeds(updateDoc(doc(owner, 'applicants/a'), {
    archived: true, archiveFolder: 'enlisted', archivedAt: serverTimestamp(),
    previousStage: 'Q&E', statusStage: 'Enlisted', updatedAt: serverTimestamp(),
  }));
  // Owner restores the enlisted applicant to Active with its previous stage.
  await assertSucceeds(updateDoc(doc(owner, 'applicants/a'), {
    archived: false, archiveFolder: null, archivedAt: null, archivedFiscalYear: null,
    previousStage: null, statusStage: 'Q&E', updatedAt: serverTimestamp(),
  }));
  // Owner may create a new applicant directly at the Enlisted stage, filed.
  await assertSucceeds(setDoc(doc(owner, 'applicants/enlisted-new'), {
    name: 'Synthetic Enlisted', statusStage: 'Enlisted',
    archived: true, archiveFolder: 'enlisted', archivedAt: serverTimestamp(),
    previousStage: 'Q&E', updatedAt: serverTimestamp(),
  }));
  // Assistant cannot file into Enlisted, restore from it, or edit filed records.
  await assertFails(updateDoc(doc(muse, 'applicants/a'), { ...audit(), archived: true, archiveFolder: 'enlisted', statusStage: 'Enlisted' }));
  await assertFails(updateDoc(doc(muse, 'applicants/archived'), { ...audit(), archived: false, archiveFolder: null }));
  await assertFails(updateDoc(doc(muse, 'applicants/enlisted-new'), { ...audit(), name: 'Changed' }));
  // Sync worker cannot touch enlisted records either.
  await assertFails(updateDoc(doc(db('sync'), 'applicants/enlisted-new'), { name: 'Changed', updatedBy: 'sync', updatedAt: serverTimestamp() }));
  // Kiosk reads the sanitized mirror (mission count) but never the full
  // filed record, and cannot write either.
  await assertSucceeds(getDoc(doc(db('kiosk', 'anonymous'), 'kioskApplicants/enlisted-new')));
  await assertFails(getDoc(doc(db('kiosk', 'anonymous'), 'applicants/enlisted-new')));
  await assertFails(updateDoc(doc(db('kiosk', 'anonymous'), 'kioskApplicants/enlisted-new'), { name: 'Changed' }));
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
test('account administration is console-only: /access is deny-all for every client role', async () => {
  for (const uid of ['owner', 'muse', 'readonly', 'sync', 'reviewer1', 'kiosk', 'unknown']) {
    const client = db(uid);
    await assertFails(getDoc(doc(client, 'access/owner')));
    await assertFails(getDoc(doc(client, `access/${uid}`)));
    await assertFails(getDocs(collection(client, 'access')));
    await assertFails(setDoc(doc(client, 'access/new-user'), { role: 'assistant', enabled: true }));
    await assertFails(updateDoc(doc(client, 'access/muse'), { enabled: false }));
    await assertFails(deleteDoc(doc(client, 'access/muse')));
  }
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'access/owner')));
  await assertFails(getDocs(collection(anon, 'access')));
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
    for (const path of ['applicants/a', 'applicants/a/notes/old', 'kioskApplicants/a', 'events/new', 'eventResults/new', 'settings/mission']) {
      await assertFails(deleteDoc(doc(client, path)));
    }
    await assertFails(setDoc(doc(client, 'unknown/new'), { text: 'Synthetic' }));
  }
});

test('daily reminder permits enrolled reads and owner dismissal only', async () => {
  const path = 'settings/inputAppointments-2026-10-28';
  await assertSucceeds(setDoc(doc(db('owner'), path), { dismissed: true }));
  for (const [uid, provider] of [['owner', 'password'], ['muse', 'password'], ['readonly', 'password'], ['kiosk', 'anonymous']]) {
    await assertSucceeds(getDoc(doc(db(uid, provider), path)));
  }
  for (const client of [db('muse'), db('readonly'), db('kiosk', 'anonymous'), db('owner', 'anonymous'), db('unknown'), db('disabled'), env.unauthenticatedContext().firestore()]) {
    await assertFails(setDoc(doc(client, path), { dismissed: true }));
  }
  for (const client of [db('unknown'), db('disabled'), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(client, path)));
  }
  await assertFails(setDoc(doc(db('owner'), path), { dismissed: false }));
  await assertFails(setDoc(doc(db('owner'), path), { dismissed: true, extra: 'unexpected' }));
  await assertFails(setDoc(doc(db('owner'), 'settings/inputAppointments-invalid'), { dismissed: true }));
  await assertFails(setDoc(doc(db('owner'), 'settings/unknown'), { dismissed: true }));
  await assertFails(deleteDoc(doc(db('owner'), path)));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'access/kiosk'), { enabled: false }));
  await assertFails(getDoc(doc(db('kiosk', 'anonymous'), path)));
});

// ---- Kiosk remote control (settings/kioskControl, PR #43) ----

test('kiosk remote: owner-only writes, kiosk read-only, everyone else denied', async () => {
  const ref = uid => doc(db(uid), 'settings/kioskControl');
  const payload = uid => ({ screen: 3, updatedBy: uid, updatedAt: serverTimestamp() });
  // Owner creates and updates with a valid screen index (0-6).
  await assertSucceeds(setDoc(ref('owner'), payload('owner')));
  await assertSucceeds(updateDoc(ref('owner'), { screen: 6, updatedBy: 'owner', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref('owner'), { screen: 0, updatedBy: 'owner', updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(ref('owner')));
  // Owner payload validation: screen must be an int in range, only the
  // three keys, own UID, server timestamp.
  await assertFails(setDoc(ref('owner'), { ...payload('owner'), screen: 7 }));
  await assertFails(setDoc(ref('owner'), { ...payload('owner'), screen: -1 }));
  await assertFails(setDoc(ref('owner'), { ...payload('owner'), screen: '3' }));
  await assertFails(setDoc(ref('owner'), { ...payload('owner'), extra: 'nope' }));
  await assertFails(setDoc(ref('owner'), { screen: 3, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(ref('owner'), { ...payload('owner'), updatedBy: 'muse' }));
  await assertFails(setDoc(ref('owner'), { screen: 3, updatedBy: 'owner', updatedAt: new Date('2020-01-01') }));
  // Anonymous sign-in is never the owner, even with the owner's UID.
  await assertFails(getDoc(doc(db('owner', 'anonymous'), 'settings/kioskControl')));
  await assertFails(setDoc(doc(db('owner', 'anonymous'), 'settings/kioskControl'), payload('owner')));
  // Enrolled kiosk reads the selection but can never write it.
  const kiosk = db('kiosk', 'anonymous');
  await assertSucceeds(getDoc(doc(kiosk, 'settings/kioskControl')));
  await assertFails(setDoc(doc(kiosk, 'settings/kioskControl'), payload('kiosk')));
  await assertFails(updateDoc(doc(kiosk, 'settings/kioskControl'), { screen: 1, updatedBy: 'kiosk', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(kiosk, 'settings/kioskControl')));
  // Assistants, reviewers, and the sync worker cannot read or write it.
  for (const uid of ['muse', 'readonly', 'reviewer1', 'sync']) {
    await assertFails(getDoc(ref(uid)));
    await assertFails(setDoc(ref(uid), payload(uid)));
    await assertFails(updateDoc(ref(uid), { screen: 1, updatedBy: uid, updatedAt: serverTimestamp() }));
  }
  // Unknown, disabled, and unauthenticated clients see nothing.
  for (const client of [db('unknown'), db('disabled'), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(client, 'settings/kioskControl')));
    await assertFails(setDoc(doc(client, 'settings/kioskControl'), { screen: 1, updatedBy: 'unknown', updatedAt: serverTimestamp() }));
  }
  // Nobody deletes the control document, not even the owner.
  await assertFails(deleteDoc(ref('owner')));
});

// Shared-project regression: synthetic records only, same emulator as PIBASE.
async function seedWarrior() {
  await env.withSecurityRulesDisabled(async ctx => {
    const d = ctx.firestore();
    const records = {
      'warriorChallenges/practice': { mode: 'practice', rulesVersion: 'practice-v1', rosterVersion: 'synthetic-v1' },
      'warriorChallenges/practice/events/grenade': { kind: 'numeric', minimum: 0, maximum: 100, state: 'open' },
      'warriorChallenges/practice/teams/A': { eligible: true, rosterVersion: 'synthetic-v1' },
      'warriorChallenges/practice/members/wc-scorer': { active: true, role: 'scorer', eventIds: ['grenade'] },
      'warriorChallenges/practice/members/wc-admin': { active: true, role: 'admin', eventIds: ['grenade'] },
    };
    for (const [path, data] of Object.entries(records)) await setDoc(doc(d,path),data);
  });
}
function warriorOperation(uid, id = 'score') {
  return { opId:id, competitionId:'practice', eventId:'grenade', teamId:'A',
    schemaVersion:1, rulesVersion:'practice-v1', actorUid:uid, deviceId:'synthetic-device',
    sessionId:'synthetic-session', capturedAtClientMs:100, kind:'result.submit',
    parentIds:[], payload:{value:50,reason:''}, receivedAt:serverTimestamp() };
}
test('Warrior members can score but cannot access any PIBASE private collection', async () => {
  await seedWarrior();
  for (const uid of ['wc-scorer','wc-admin']) {
    const client = db(uid);
    await assertSucceeds(getDoc(doc(client,'warriorChallenges/practice')));
    await assertSucceeds(setDoc(doc(client,'warriorChallenges/practice/journal',uid),warriorOperation(uid,uid)));
    for (const path of ['applicants/a','applicants/a/notes/old','kioskApplicants/a','events/new','eventResults/new','settings/mission','settings/inputAppointments-2026-10-28','access/owner']) {
      await assertFails(getDoc(doc(client,path)));
      await assertFails(setDoc(doc(client,path),{name:'Synthetic',text:'Synthetic',summary:'Synthetic',start:'2026-10-31'}));
    }
    await assertFails(setDoc(doc(client,'access',uid),{role:'owner',enabled:true}));
  }
});
test('PIBASE owner, assistant and kiosk do not inherit Warrior membership', async () => {
  await seedWarrior();
  for (const [uid,provider] of [['owner','password'],['muse','password'],['kiosk','anonymous']]) {
    const client=db(uid,provider);
    await assertFails(getDoc(doc(client,'warriorChallenges/practice')));
    await assertFails(setDoc(doc(client,'warriorChallenges/practice/journal',uid),warriorOperation(uid,uid)));
    await assertFails(setDoc(doc(client,'warriorChallenges/practice/members',uid),{role:'admin',active:true,eventIds:['grenade']}));
  }
});
test('dual membership is deliberate and revoking Warrior access does not revoke PIBASE', async () => {
  await seedWarrior();
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'warriorChallenges/practice/members/owner'),{active:true,role:'admin',eventIds:['grenade']}));
  const client=db('owner');
  await assertSucceeds(getDoc(doc(client,'applicants/a')));
  await assertSucceeds(setDoc(doc(client,'warriorChallenges/practice/journal/owner'),warriorOperation('owner','owner')));
  await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'warriorChallenges/practice/members/owner'),{active:false}));
  await assertFails(getDoc(doc(client,'warriorChallenges/practice')));
  await assertSucceeds(getDoc(doc(client,'applicants/a')));
});
test('root deploy mirror cannot accidentally restore the legacy signed-in policy', async () => {
  const canonical=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
  const root=await readFile(new URL('../../../firestore.rules',import.meta.url),'utf8');
  const { strictEqual }=await import('node:assert');strictEqual(root,canonical);
});

// ---- SURVEY lead integration rules (synthetic records only) ----

const RESPONSE_ID = '123e4567-e89b-42d3-a456-426614174000';
const DEDUPE_KEY = 'e:' + 'a'.repeat(64);

function importRecord(uid, overrides = {}) {
  return {
    responseId: RESPONSE_ID,
    recruiterSlug: 'joel-viola',
    status: 'review',
    applicantId: null,
    normalizedEmail: 'student@example.com',
    normalizedPhone: '+12085550147',
    surveySnapshot: {name: 'Synthetic Student'},
    duplicateCandidates: [],
    decisions: [],
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function seedMapping(slug = 'joel-viola', uid = 'reviewer1') {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), `recruiterMappings/${slug}`),
      {uid, active: true, updatedAt: serverTimestamp()});
  });
}

async function seedImport(record) {
  await env.withSecurityRulesDisabled(async ctx => {
    const ref = doc(ctx.firestore(), 'surveyLeadImports', record.responseId);
    const {createdAt, updatedAt, ...rest} = record;
    await setDoc(ref, {...rest, createdAt: new Date(), updatedAt: new Date()});
  });
}

test('integration worker can create import records and dedupe locks; forgeries fail', async () => {
  const client = db('sync');
  const ref = doc(client, 'surveyLeadImports', RESPONSE_ID);
  await assertSucceeds(setDoc(ref, importRecord('sync')));
  await assertFails(setDoc(doc(client, 'surveyLeadImports', 'other-id'), importRecord('sync')));
  await assertFails(setDoc(ref, importRecord('owner')));
  await assertFails(setDoc(ref, {...importRecord('sync'), createdAt: new Date('2020-01-01')}));
  await assertFails(setDoc(ref, {...importRecord('sync'), status: 'bogus'}));
  await assertFails(setDoc(ref, {...importRecord('sync'), extra: 'nope'}));
  await assertFails(setDoc(ref, {...importRecord('sync'), responseId: 'mismatch'}));
  const lock = doc(client, 'surveyLeadDedupes', DEDUPE_KEY);
  const lockData = {responseId: RESPONSE_ID, applicantId: null, createdBy: 'sync', createdAt: serverTimestamp()};
  await assertSucceeds(setDoc(lock, lockData));
  await assertFails(setDoc(doc(client, 'surveyLeadDedupes', 'bad-key'), lockData));
  await assertFails(setDoc(lock, {...lockData, createdBy: 'owner'}));
  await assertFails(setDoc(lock, {...lockData, createdAt: new Date('2020-01-01')}));
  await assertSucceeds(updateDoc(lock, {applicantId: 'survey-x', updatedBy: 'sync', updatedAt: serverTimestamp()}));
  await assertFails(updateDoc(lock, {responseId: 'changed', updatedBy: 'sync', updatedAt: serverTimestamp()}));
  await assertFails(updateDoc(lock, {applicantId: 'y', updatedBy: 'owner', updatedAt: serverTimestamp()}));
  await assertFails(deleteDoc(lock));
});

test('recruiter mappings are console-only; reads are isolated', async () => {
  await seedMapping('joel-viola', 'reviewer1');
  await seedMapping('jane-smith', 'someone-else');
  await assertSucceeds(getDoc(doc(db('owner'), 'recruiterMappings/joel-viola')));
  for (const uid of ['owner', 'sync', 'reviewer1']) {
    await assertFails(setDoc(doc(db(uid), 'recruiterMappings/joel-viola'), {uid: 'x'}));
  }
  await assertSucceeds(getDoc(doc(db('reviewer1'), 'recruiterMappings/joel-viola')));
  await assertFails(getDoc(doc(db('reviewer1'), 'recruiterMappings/jane-smith')));
  await assertFails(getDoc(doc(db('kiosk', 'anonymous'), 'recruiterMappings/joel-viola')));
  await assertFails(getDoc(doc(db('unknown'), 'recruiterMappings/joel-viola')));
});

test('import reads are recruiter-isolated; kiosk and strangers see nothing', async () => {
  await seedMapping('joel-viola', 'reviewer1');
  await seedImport(importRecord('sync'));
  await seedImport(importRecord('sync', {responseId: '223e4567-e89b-42d3-a456-426614174001', recruiterSlug: 'jane-smith'}));
  await assertSucceeds(getDoc(doc(db('owner'), `surveyLeadImports/${RESPONSE_ID}`)));
  await assertSucceeds(getDoc(doc(db('sync'), `surveyLeadImports/${RESPONSE_ID}`)));
  await assertSucceeds(getDoc(doc(db('reviewer1'), `surveyLeadImports/${RESPONSE_ID}`)));
  await assertFails(getDoc(doc(db('reviewer1'), 'surveyLeadImports/223e4567-e89b-42d3-a456-426614174001')));
  await assertFails(getDoc(doc(db('kiosk', 'anonymous'), `surveyLeadImports/${RESPONSE_ID}`)));
  await assertFails(getDoc(doc(db('unknown'), `surveyLeadImports/${RESPONSE_ID}`)));
});

test('review transitions are validated and audit entries are server-enforced', async () => {
  await seedMapping('joel-viola', 'reviewer1');
  await seedImport(importRecord('sync'));
  const ref = doc(db('owner'), 'surveyLeadImports', RESPONSE_ID);
  const decide = (uid, action) => ({
    status: action === 'dismissed' ? 'dismissed' : action === 'linked' ? 'linked' : 'imported',
    applicantId: action === 'linked' ? 'applicants/a' : null,
    decisions: [{by: uid, action, note: 'Synthetic review'}],
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
  await assertSucceeds(updateDoc(ref, decide('owner', 'linked')));
  await seedImport(importRecord('sync', {responseId: '323e4567-e89b-42d3-a456-426614174002'}));
  const ref2 = doc(db('owner'), 'surveyLeadImports', '323e4567-e89b-42d3-a456-426614174002');
  await assertFails(updateDoc(ref2, {status: 'linked', updatedBy: 'owner', updatedAt: serverTimestamp()}));
  await assertFails(updateDoc(ref2, {...decide('owner', 'linked'), decisions: [{by: 'reviewer1', action: 'linked', note: ''}]}));
  await assertFails(updateDoc(ref2, {...decide('owner', 'linked'), decisions: [{by: 'owner', at: new Date('2020-01-01'), action: 'linked', note: ''}]}));
  await assertFails(updateDoc(ref2, {...decide('owner', 'dismissed'), recruiterSlug: 'jane-smith'}));
  await seedImport(importRecord('sync', {responseId: '423e4567-e89b-42d3-a456-426614174003', status: 'imported'}));
  const ref3 = doc(db('owner'), 'surveyLeadImports', '423e4567-e89b-42d3-a456-426614174003');
  await assertFails(updateDoc(ref3, decide('owner', 'dismissed')));
  await assertFails(deleteDoc(ref3));
});

test('mapped reviewer can resolve only their own slug; applicant writes stay fenced', async () => {
  await seedMapping('joel-viola', 'reviewer1');
  await seedImport(importRecord('sync'));
  await seedImport(importRecord('sync', {responseId: '523e4567-e89b-42d3-a456-426614174004', recruiterSlug: 'jane-smith'}));
  const own = doc(db('reviewer1'), 'surveyLeadImports', RESPONSE_ID);
  const decide = {
    status: 'dismissed',
    decisions: [{by: 'reviewer1', action: 'dismissed', note: 'Synthetic'}],
    updatedBy: 'reviewer1',
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(updateDoc(own, decide));
  const other = doc(db('reviewer1'), 'surveyLeadImports', '523e4567-e89b-42d3-a456-426614174004');
  await assertFails(updateDoc(other, decide));
  await assertSucceeds(getDoc(doc(db('reviewer1'), 'applicants/a')));
  await assertFails(setDoc(doc(db('reviewer1'), 'applicants/new'), {name: 'Synthetic', updatedBy: 'reviewer1', updatedAt: serverTimestamp()}));
  await assertFails(updateDoc(doc(db('reviewer1'), 'applicants/a'), {name: 'Changed', updatedBy: 'reviewer1', updatedAt: serverTimestamp()}));
  const separateId = `survey-${RESPONSE_ID}-separate`;
  const separate = {
    name: 'Synthetic Separate', statusStage: 'New Lead', source: 'SURVEY',
    surveyResponseId: RESPONSE_ID, updatedBy: 'reviewer1', updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(db('reviewer1'), `applicants/${separateId}`), separate));
  await assertFails(setDoc(doc(db('reviewer1'), 'applicants/other-id'), separate));
  await assertFails(setDoc(doc(db('reviewer1'), `applicants/${separateId}`), {...separate, source: 'MANUAL'}));
});

test('integration worker cannot resolve reviews or touch mappings', async () => {
  await seedMapping('joel-viola', 'reviewer1');
  await seedImport(importRecord('sync'));
  const ref = doc(db('sync'), 'surveyLeadImports', RESPONSE_ID);
  await assertFails(updateDoc(ref, {
    status: 'dismissed',
    decisions: [{by: 'sync', action: 'dismissed', note: ''}],
    updatedBy: 'sync', updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db('sync'), 'recruiterMappings/joel-viola'), {uid: 'sync'}));
});

test('sync role is least-privilege: fenced applicant creates, no updates/deletes, nothing else', async () => {
  const client = db('sync');
  const detId = `survey-${RESPONSE_ID}`;
  const payload = {
    name: 'Synthetic Sync', source: 'SURVEY', statusStage: 'New Lead',
    updatedBy: 'sync', updatedAt: serverTimestamp(),
  };
  // Deterministic survey-{uuid} create succeeds.
  await assertSucceeds(setDoc(doc(client, `applicants/${detId}`), payload));
  // Any other applicant ID is rejected.
  await assertFails(setDoc(doc(client, 'applicants/other'), payload));
  await assertFails(setDoc(doc(client, `applicants/${detId}-x`), payload));
  // Missing source stamp or wrong stage is rejected.
  await assertFails(setDoc(doc(client, `applicants/survey-223e4567-e89b-42d3-a456-426614174000`), {...payload, source: 'MANUAL'}));
  await assertFails(setDoc(doc(client, `applicants/survey-323e4567-e89b-42d3-a456-426614174000`), {...payload, statusStage: 'Packet Prep'}));
  // No updates or deletes on any applicant, even ones it created.
  await assertFails(updateDoc(doc(client, `applicants/${detId}`), {name: 'Changed', updatedBy: 'sync', updatedAt: serverTimestamp()}));
  await assertFails(updateDoc(doc(client, 'applicants/a'), {name: 'Changed', updatedBy: 'sync', updatedAt: serverTimestamp()}));
  await assertFails(deleteDoc(doc(client, `applicants/${detId}`)));
  // No notes.
  await assertFails(setDoc(doc(client, `applicants/${detId}/notes/n1`), {text: 'x', updatedBy: 'sync', updatedAt: serverTimestamp(), createdAt: serverTimestamp()}));
  // Reads allowed for duplicate detection; nothing else readable.
  await assertSucceeds(getDocs(collection(client, 'applicants')));
  await assertFails(getDoc(doc(client, 'settings/mission')));
  await assertFails(getDoc(doc(client, 'events/e1')));
  // No warrior access.
  await assertFails(getDoc(doc(client, 'warriorChallenges/practice')));
});

// ---- Privacy hardening: kiosk mirrors + legacy freeze (synthetic only) ----

function mirrorDoc(uid, overrides = {}) {
  return {
    name: 'Synthetic Mirror', statusStage: 'Q&E', age: 22,
    generalArea: 'Twin Falls', priorService: '', educationLevel: '',
    nextAction: '', nextActionDate: '', precedence: 'normal',
    updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
    archived: false, archiveFolder: null,
    updatedBy: uid, ...overrides,
  };
}

test('kiosk reads events, results, mission and reminder but not notes or survey data', async () => {
  const client = db('kiosk', 'anonymous');
  await assertSucceeds(getDoc(doc(client, 'settings/mission')));
  await assertSucceeds(getDocs(collection(client, 'events')));
  await assertSucceeds(getDocs(collection(client, 'eventResults')));
  await assertSucceeds(getDoc(doc(client, 'settings/inputAppointments-2026-10-28')));
  await assertFails(getDoc(doc(client, 'applicants/a/notes/old')));
  await assertFails(getDocs(collection(client, 'surveyLeadDedupes')));
  await assertFails(getDoc(doc(client, 'surveyLeadImports/123e4567-e89b-42d3-a456-426614174000')));
  await assertFails(getDocs(collection(client, 'surveyLeadImports')));
  // Event notes live in a reader-only subcollection the kiosk cannot see.
  await assertFails(getDoc(doc(client, 'events/e1/notes/planning')));
  await assertFails(getDocs(collection(client, 'events/e1/notes')));
  await assertFails(getDoc(doc(client, 'eventResults/r1/notes/results')));
});

test('kiosk mirrors accept only sanitized fields from attributed writers', async () => {
  // Owner creates without attribution; assistant needs its own UID stamped.
  await assertSucceeds(setDoc(doc(db('owner'), 'kioskApplicants/new'), mirrorDoc('owner')));
  await assertSucceeds(setDoc(doc(db('muse'), 'kioskApplicants/muse-new'), mirrorDoc('muse')));
  await assertFails(setDoc(doc(db('muse'), 'kioskApplicants/bad-uid'), mirrorDoc('owner')));
  await assertFails(setDoc(doc(db('muse'), 'kioskApplicants/no-uid'), mirrorDoc('')));
  // Read-only assistant cannot write mirrors.
  await assertFails(setDoc(doc(db('readonly'), 'kioskApplicants/ro'), mirrorDoc('readonly')));
  // Sensitive fields are rejected even from the owner: the key whitelist
  // is the enforcement, not the writer's role.
  for (const extra of [{phone: '208-555-0100'}, {email: 'a@example.invalid'},
    {medicalIssueFlag: 'yes'}, {legalIssueFlag: 'no'}, {waiverType: 'Medical'},
    {waiverStatus: 'Approved'}, {latestNote: 'secret'}, {physicalHealth: 'asthma'},
    {legalIssues: 'DUI'}, {source: 'SURVEY'}, {tattoosBrandsPiercings: 'x'},
    {maritalStatus: 'Single'}, {dependents: 1}, {school: 'TFHS'},
    {archivedFiscalYear: 2026}]) {
    await assertFails(setDoc(doc(db('owner'), 'kioskApplicants/leak'), mirrorDoc('owner', extra)));
  }
  // Shape validation: name required, updatedAt a timestamp, age an int.
  await assertFails(setDoc(doc(db('owner'), 'kioskApplicants/no-name'), mirrorDoc('owner', {name: ''})));
  await assertFails(setDoc(doc(db('owner'), 'kioskApplicants/bad-ts'), mirrorDoc('owner', {updatedAt: 'today'})));
  await assertFails(setDoc(doc(db('owner'), 'kioskApplicants/bad-age'), mirrorDoc('owner', {age: '22'})));
  // Backfill preserves the applicant's updatedAt: a stale timestamp is
  // allowed on update, or every Review badge would clear on rebuild.
  await assertSucceeds(updateDoc(doc(db('muse'), 'kioskApplicants/a'), {name: 'Still Synthetic', updatedBy: 'muse', updatedAt: new Date('2026-01-01')}));
  // Readers can read mirrors; strangers cannot.
  await assertSucceeds(getDoc(doc(db('muse'), 'kioskApplicants/a')));
  await assertSucceeds(getDoc(doc(db('readonly'), 'kioskApplicants/a')));
  await assertFails(getDoc(doc(db('unknown'), 'kioskApplicants/a')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'kioskApplicants/a')));
  // Nobody deletes mirrors client-side.
  await assertFails(deleteDoc(doc(db('owner'), 'kioskApplicants/a')));
});

test('sync and reviewer roles mirror only their own deterministic leads', async () => {
  const detId = `survey-${RESPONSE_ID}`;
  const separateId = `survey-${RESPONSE_ID}-separate`;
  await assertSucceeds(setDoc(doc(db('sync'), `kioskApplicants/${detId}`), mirrorDoc('sync')));
  await assertFails(setDoc(doc(db('sync'), 'kioskApplicants/other'), mirrorDoc('sync')));
  await assertFails(setDoc(doc(db('sync'), `kioskApplicants/${separateId}`), mirrorDoc('sync')));
  await assertFails(updateDoc(doc(db('sync'), `kioskApplicants/${detId}`), {name: 'Changed', updatedBy: 'sync'}));
  await assertSucceeds(setDoc(doc(db('reviewer1'), `kioskApplicants/${separateId}`), mirrorDoc('reviewer1')));
  await assertFails(setDoc(doc(db('reviewer1'), `kioskApplicants/${detId}`), mirrorDoc('reviewer1')));
  await assertFails(setDoc(doc(db('reviewer1'), 'kioskApplicants/other'), mirrorDoc('reviewer1')));
  await assertFails(updateDoc(doc(db('reviewer1'), `kioskApplicants/${separateId}`), {name: 'Changed', updatedBy: 'reviewer1'}));
});

test('tri-state flags validate and legacy free-text fields are frozen', async () => {
  const owner = db('owner');
  const muse = db('muse');
  // Flags accept yes/no/unknown; anything else fails.
  await assertSucceeds(setDoc(doc(owner, 'applicants/flag-ok'), {name: 'Synthetic', medicalIssueFlag: 'yes', legalIssueFlag: 'unknown'}));
  await assertFails(setDoc(doc(owner, 'applicants/flag-bad'), {name: 'Synthetic', medicalIssueFlag: 'maybe'}));
  await assertFails(setDoc(doc(owner, 'applicants/flag-bad2'), {name: 'Synthetic', legalIssueFlag: ''}));
  await assertFails(updateDoc(doc(muse, 'applicants/a'), {...audit(), medicalIssueFlag: 'sometimes'}));
  // New records cannot carry legacy free-text fields.
  await assertFails(setDoc(doc(owner, 'applicants/legacy-new'), {name: 'Synthetic', physicalHealth: 'asthma'}));
  await assertFails(setDoc(doc(owner, 'applicants/legacy-new2'), {name: 'Synthetic', legalIssues: 'DUI'}));
  // Updates cannot introduce or change legacy fields, even for the owner.
  await assertFails(updateDoc(doc(owner, 'applicants/a'), {physicalHealth: 'new note'}));
  await assertFails(updateDoc(doc(owner, 'applicants/a'), {legalIssues: 'new note'}));
  // But updating a legacy record without touching its frozen fields works.
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'applicants/legacy-doc'), {name: 'Synthetic Legacy Doc', physicalHealth: 'old note', legalIssues: 'old note'}));
  await assertSucceeds(updateDoc(doc(owner, 'applicants/legacy-doc'), {name: 'Still Synthetic'}));
  await assertSucceeds(updateDoc(doc(muse, 'applicants/legacy-doc'), {...audit(), nextAction: 'Call'}));
  // The frozen values survive those edits: read them back.
  const after = await assertSucceeds(getDoc(doc(owner, 'applicants/legacy-doc')));
  assert.strictEqual(after.data().physicalHealth, 'old note');
  assert.strictEqual(after.data().legalIssues, 'old note');
  // Even clearing a frozen field is a change: removal is console-only.
  await assertFails(updateDoc(doc(owner, 'applicants/legacy-doc'), {physicalHealth: 'changed'}));
  await assertFails(updateDoc(doc(owner, 'applicants/legacy-doc'), {physicalHealth: null}));
  await assertFails(updateDoc(doc(muse, 'applicants/legacy-doc'), {...audit(), physicalHealth: null}));
  await assertFails(updateDoc(doc(muse, 'applicants/legacy-doc'), {...audit(), legalIssues: null}));
});

test('event and result notes live in reader-only subcollections, never in kiosk-readable docs', async () => {
  const owner = db('owner');
  const muse = db('muse');
  const kiosk = db('kiosk', 'anonymous');
  // Seed legacy events that still carry in-doc notes (pre-change data).
  await env.withSecurityRulesDisabled(async ctx => {
    const db0 = ctx.firestore();
    await setDoc(doc(db0, 'events/e1'), { name: 'Synthetic Event', date: '2026-11-20', notes: 'old planning note', resultNotes: 'old result note' });
    await setDoc(doc(db0, 'eventResults/r1'), { summary: 'Synthetic Result', start: '2026-11-19', resultNotes: 'old result note' });
  });
  // New parent docs cannot carry notes/resultNotes.
  await assertFails(setDoc(doc(muse, 'events/new2'), { name: 'Synthetic Event', date: '2026-11-20', notes: 'x', ...audit() }));
  await assertFails(setDoc(doc(muse, 'events/new3'), { name: 'Synthetic Event', date: '2026-11-20', resultNotes: 'x', ...audit() }));
  await assertFails(setDoc(doc(muse, 'eventResults/new2'), { summary: 'Synthetic Result', start: '2026-11-19', resultNotes: 'x', ...audit() }));
  // Updates must not touch the legacy in-doc notes — but editing other
  // fields on a legacy event still works, and the notes survive.
  await assertFails(updateDoc(doc(muse, 'events/e1'), { ...audit(), notes: 'changed' }));
  await assertFails(updateDoc(doc(owner, 'events/e1'), { resultNotes: null }));
  await assertFails(updateDoc(doc(muse, 'eventResults/r1'), { ...audit(), resultNotes: 'changed' }));
  await assertSucceeds(updateDoc(doc(muse, 'events/e1'), { ...audit(), name: 'Renamed Synthetic Event' }));
  const after = await assertSucceeds(getDoc(doc(owner, 'events/e1')));
  assert.strictEqual(after.data().notes, 'old planning note');
  assert.strictEqual(after.data().resultNotes, 'old result note');
  // The private subcollection: readers read, writers write attributed,
  // the kiosk cannot read or write it at all.
  const note = { text: 'Synthetic planning note', updatedAt: serverTimestamp(), updatedBy: 'muse' };
  await assertSucceeds(setDoc(doc(muse, 'events/e1/notes/planning'), note));
  await assertSucceeds(setDoc(doc(muse, 'events/e1/notes/results'), { ...note, text: 'Synthetic result note' }));
  await assertSucceeds(setDoc(doc(muse, 'eventResults/r1/notes/results'), { ...note, text: 'Synthetic result note' }));
  await assertSucceeds(getDoc(doc(db('readonly'), 'events/e1/notes/planning')));
  await assertSucceeds(getDoc(doc(owner, 'events/e1/notes/planning')));
  await assertFails(getDoc(doc(kiosk, 'events/e1/notes/planning')));
  await assertFails(getDocs(collection(kiosk, 'events/e1/notes')));
  await assertFails(getDoc(doc(kiosk, 'eventResults/r1/notes/results')));
  await assertFails(setDoc(doc(kiosk, 'events/e1/notes/planning'), note));
  // Unattributed writes fail; the owner writes without attribution.
  await assertFails(setDoc(doc(muse, 'events/e1/notes/other'), { text: 'x', updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(owner, 'events/e1/notes/other'), { text: 'x', updatedAt: serverTimestamp() }));
  // Read-only assistants cannot write notes; nobody deletes them.
  await assertFails(setDoc(doc(db('readonly'), 'events/e1/notes/planning'), { ...note, updatedBy: 'readonly' }));
  await assertFails(deleteDoc(doc(owner, 'events/e1/notes/planning')));
  // Only the three note fields are allowed, and text must be a string.
  await assertFails(setDoc(doc(muse, 'events/e1/notes/bad'), { ...note, extra: 1 }));
  await assertFails(setDoc(doc(muse, 'events/e1/notes/bad2'), { text: 42, updatedAt: serverTimestamp(), updatedBy: 'muse' }));
});
