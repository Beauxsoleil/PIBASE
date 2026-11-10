import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = await readFile(join(root, 'stripes-for-skills.js'), 'utf8');

const context = {
  window: {},
  document: {
    readyState: 'loading',
    addEventListener() {}
  },
  console
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'stripes-for-skills.js' });

const api = context.window.__PIBASE_SFS__;
assert.ok(api, 'test hook must be present');
assert.strictEqual(api.initials, 'JV');
assert.strictEqual(api.recruiterLine, 'SSG VIOLA/ DET 3 RSP');
assert.strictEqual(api.ymd('2026-11-10'), '20261110');
assert.strictEqual(api.stamp('2026-11-10'), 'JV/20261110');
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(api.inferRankAndName('SPC Jane Doe'))),
  { rank: 'SPC', name: 'Jane Doe' }
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(api.inferRankAndName('Jane Doe'))),
  { rank: 'PVT', name: 'Jane Doe' }
);

const phase = new Map(api.tasks.map(t => [t.text, t.phase]));
assert.strictEqual(phase.get('Military Time (STRM White Phase Stripes for Skills)'), 'W');
assert.strictEqual(phase.get('Column Left (STRM White Phase)'), 'W');
assert.strictEqual(phase.get('Column Right (STRM White Phase)'), 'W');
assert.strictEqual(phase.get('Drill and Ceremony (STRM Red Phase)'), 'R');
assert.strictEqual(phase.get('Recite General Orders (STRM White Phase Stripes for Skills)'), 'W');
assert.strictEqual(phase.get('Phonetic Alphabet (STRM Red Phase)'), 'R');

assert.ok(api.officialRedFields.includes('Basic Lead Qualification Skills APPLEMD'));
assert.ok(api.officialRedFields.includes('Identify Terrain Features on a Map'));
assert.ok(api.officialWhiteFields.includes('Land Navigation'));
assert.ok(api.officialWhiteFields.includes('Points_6'));
assert.ok(api.officialWhiteFields.includes('InitialsDate of CompletionMilitary Time STRM White Phase Stripes for Skills'));
assert.ok(!api.officialRedFields.includes('InitialsDate of CompletionMilitary Time STRM White Phase Stripes for Skills'));

const index = await readFile(join(root, 'index.html'), 'utf8');
assert.match(index, /<script defer src="\.\/stripes-for-skills\.js"><\/script>/);
const worker = await readFile(join(root, 'service-worker.js'), 'utf8');
assert.ok(worker.includes("'stripes-for-skills.js'"));
assert.ok(worker.includes('pdf-lib@1.17.1'));
assert.match(worker, /pibase-app-v27/);

assert.doesNotMatch(source, /page\.drawRectangle/);
assert.match(source, /drawLine\(page, left, bottom, right, bottom, 0\.65\)/);
assert.match(source, /drawLine\(page, left, top, right, top, 0\.65\)/);
assert.doesNotMatch(source, /\b(?:updateDoc|addDoc|setDoc)\b/);
console.log('Stripes for Skills smoke OK');
