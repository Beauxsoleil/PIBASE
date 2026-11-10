import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

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
assert.strictEqual(phase.get('Military Time (STRM White Phase Stripes for Skills)'), 'R');
assert.strictEqual(phase.get('Column Left (STRM White Phase)'), 'R');
assert.strictEqual(phase.get('Column Right (STRM White Phase)'), 'R');
assert.strictEqual(phase.get('Drill and Ceremony (STRM Red Phase)'), 'R');
assert.strictEqual(phase.get('Recite General Orders (STRM White Phase Stripes for Skills)'), 'W');
assert.strictEqual(phase.get('Phonetic Alphabet (STRM Red Phase)'), 'R');

assert.ok(api.officialRedFields.includes('Basic Lead Qualification Skills APPLEMD'));
assert.ok(api.officialRedFields.includes('Identify Terrain Features on a Map'));
assert.ok(api.officialWhiteFields.includes('Land Navigation'));
assert.ok(api.officialWhiteFields.includes('Points_6'));
assert.ok(api.officialRedFields.includes('InitialsDate of CompletionMilitary Time STRM White Phase Stripes for Skills'));
assert.ok(!api.officialWhiteFields.includes('InitialsDate of CompletionMilitary Time STRM White Phase Stripes for Skills'));
assert.ok(api.officialRedFields.includes('InitialsDate of CompletionColumn Left STRM White Phase'));
assert.ok(api.officialRedFields.includes('InitialsDate of CompletionColumn Right STRM White Phase'));

assert.strictEqual(api.templateStorageKey, 'pibase.sfs.officialTemplate.v1');
assert.ok(api.expectedTemplateFields.includes('Date'));
assert.ok(api.expectedTemplateFields.includes('NAME  RANK'));
assert.ok(api.expectedTemplateFields.includes('PLATOON SGTUNIT'));
assert.ok(api.expectedTemplateFields.length >= 50);

const index = await readFile(join(root, 'index.html'), 'utf8');
assert.match(index, /<script defer src="\.\/stripes-for-skills\.js"><\/script>/);
const worker = await readFile(join(root, 'service-worker.js'), 'utf8');
assert.ok(worker.includes("'stripes-for-skills.js'"));
assert.ok(worker.includes('pdf-lib@1.17.1'));
assert.match(worker, /pibase-app-v31/);
assert.ok(worker.includes("'assets/stripes-for-skills-template.pdf'"));

const template = await readFile(join(root, 'assets', 'stripes-for-skills-template.pdf'));
assert.strictEqual(template.length, 413627);
assert.strictEqual(
  createHash('sha256').update(template).digest('hex'),
  'd36313fff84e46f5e0fc2d1810df9c6668a273c14f0aaa87fb511ed7e0dfec46'
);

assert.match(source, /validateTemplate/);
assert.match(source, /form\.updateFieldAppearances\(font\)/);
assert.match(source, /form\.flatten\(\)/);
assert.match(source, /localStorage\.setItem\(TEMPLATE_STORAGE_KEY/);
assert.doesNotMatch(source, /makeFallbackPdf/);
assert.doesNotMatch(source, /PDFDocument\.create\(/);
assert.doesNotMatch(source, /\b(?:updateDoc|addDoc|setDoc)\b/);
console.log('Stripes for Skills smoke OK');
