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
      sync: { role: 'sync', enabled: true, read: true, write: true },
      reviewer1: { role: 'reviewer', enabled: true, read: true },
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
    for (const path of ['applicants/a','applicants/a/notes/old','events/new','eventResults/new','settings/mission','settings/inputAppointments-2026-10-28','access/owner']) {
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
