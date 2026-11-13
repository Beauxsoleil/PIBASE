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
  document: { readyState: 'loading', addEventListener() {} },
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
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.inferRankAndName('SPC Jane Doe'))), { rank:'SPC', name:'Jane Doe' });
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.inferRankAndName('Jane Doe'))), { rank:'PVT', name:'Jane Doe' });

const phase = new Map(api.tasks.map(t => [t.text, t.phase]));
assert.strictEqual(phase.get('Esatblish Bank Account'), 'E');
assert.strictEqual(phase.get('Military Time (STRM White Phase Stripes for Skills)'), 'R');
assert.strictEqual(phase.get('Column Left (STRM White Phase)'), 'R');
assert.strictEqual(phase.get('Column Right (STRM White Phase)'), 'R');
assert.strictEqual(phase.get('General Orders tasks'), 'W');
assert.strictEqual(phase.get('Rank Structure tasks'), 'R');
assert.strictEqual(phase.get('First Aid/CLS tasks'), 'W');

assert.strictEqual(api.enlistmentFields.length, 4);
assert.ok(api.enlistmentFields.includes('InitialsDate of CompletionEsatblish Bank Account'));
assert.ok(api.enlistmentFields.includes('InitialsDate of CompletionStart Direct Deposit'));
assert.ok(api.enlistmentFields.includes('InitialsDate of CompletionSet up AKO Account'));
assert.ok(api.enlistmentFields.includes('InitialsDate of CompletionSet up MyPay Account'));
assert.ok(!api.officialRedFields.some(name => api.enlistmentFields.includes(name)));

assert.ok(api.officialRedFields.includes('Basic Lead Qualification Skills APPLEMD'));
assert.ok(api.officialRedFields.includes('Identify Terrain Features on a Map'));
assert.ok(api.officialRedFields.includes('InitialsDate of CompletionColumn Left STRM White Phase'));
assert.ok(api.officialWhiteFields.includes('InitialsDate of CompletionFirst General Order'));
assert.ok(api.officialWhiteFields.includes('InitialsDate of CompletionEvaluate a Casualty'));
assert.ok(!api.officialWhiteFields.includes('Points_6'));
assert.ok(!api.officialRedFields.includes('InitialsDate of CompletionDrill and Ceremony STRM Red Phase'));

assert.deepStrictEqual(JSON.parse(JSON.stringify(api.aftEvents)), ['MDL','HRP','SDC','PLK','2MR']);
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.aftFields)), {
  MDL:{raw:'LBS',score:'Text1',date:'Points'},
  HRP:{raw:'Repitions',score:'Text3',date:'Points_3'},
  SDC:{raw:'Min  Sec',score:'Text4',date:'Points_4'},
  PLK:{raw:'Repitions_2',score:'Text2',date:'Points_5'},
  '2MR':{raw:'Min  Sec_2',score:'Text5',date:'Points_6'}
});
assert.strictEqual(api.ageBand(17), '17-21');
assert.strictEqual(api.ageBand(25), '22-26');
assert.strictEqual(api.ageBand(62), '62+');
assert.strictEqual(api.normalizeTimeValue('153'), '1:53');
assert.strictEqual(api.normalizeTimeValue('1803'), '18:03');
assert.strictEqual(api.normalizeTimeValue('2.08'), '2:08');
assert.strictEqual(api.timeToSeconds('1:53'), 113);
assert.strictEqual(api.timeToSeconds('153'), 113);
assert.strictEqual(api.timeToSeconds('18:03'), 1083);
assert.strictEqual(api.timeToSeconds('1803'), 1083);
assert.strictEqual(api.timeToSeconds('1:99'), null);

const aftData = JSON.parse(await readFile(join(root, 'aft-scoring-data.json'), 'utf8'));
assert.strictEqual(aftData.version, '250601');
assert.strictEqual(aftData.approved, '2025-05-01');
assert.strictEqual(aftData.effective, '2025-06-01');
assert.strictEqual(aftData.provenance.officialSha256, '572a54ffce1a084bf935fc8e9ea80a316de7e6edc824d6d8517e8944872ad750');
assert.match(aftData.provenance.officialSource, /goarmy\.com/);
assert.deepStrictEqual(aftData.ageBands, ['17-21','22-26','27-31','32-36','37-41','42-46','47-51','52-56','57-61','62+']);
assert.deepStrictEqual(Object.keys(aftData.events).sort(), ['2MR','HRP','MDL','PLK','SDC']);

const descending = (high, low = 0) => Array.from({length: high - low + 1}, (_, i) => high - i);
const strengthRows = [...descending(100, 60), 50, 40, 30, 20, 10, 0];
assert.deepStrictEqual(aftData.events.MDL.publishedPointRows, strengthRows);
assert.deepStrictEqual(aftData.events.HRP.publishedPointRows, strengthRows);
for (const event of ['SDC','PLK','2MR']) {
  assert.deepStrictEqual(aftData.events[event].publishedPointRows, descending(100));
}

const rowsFor = (event, age, sex) => new Map(aftData.events[event].columns[age][sex]);
assert.strictEqual(rowsFor('SDC','22-26','M').get(99), '1:32');
assert.strictEqual(rowsFor('SDC','22-26','M').get(98), '1:33');
assert.strictEqual(rowsFor('PLK','22-26','F').get(99), '3:32');
assert.strictEqual(rowsFor('PLK','22-26','F').get(98), '3:29');
assert.strictEqual(rowsFor('2MR','22-26','M').get(99), '13:47');
assert.strictEqual(rowsFor('2MR','22-26','M').get(98), '13:55');

assert.strictEqual(api.scoreEventWithData(aftData,'MDL','350',25,'M','general'),100);
assert.strictEqual(api.scoreEventWithData(aftData,'MDL','345',25,'M','general'),99);
assert.strictEqual(api.scoreEventWithData(aftData,'MDL','230',25,'F','general'),100);
assert.strictEqual(api.scoreEventWithData(aftData,'MDL','120',25,'F','general'),60);
assert.strictEqual(api.scoreEventWithData(aftData,'MDL','150',25,'F','combat'),60);
assert.strictEqual(api.scoreEventWithData(aftData,'SDC','1:32',25,'M','general'),99);
assert.strictEqual(api.scoreEventWithData(aftData,'SDC','132',25,'M','general'),99);
assert.strictEqual(api.scoreEventWithData(aftData,'SDC','2:31',25,'M','general'),60);
assert.strictEqual(api.scoreEventWithData(aftData,'2MR','13:47',25,'M','general'),99);
assert.strictEqual(api.scoreEventWithData(aftData,'2MR','1347',25,'M','general'),99);
assert.strictEqual(api.scoreEventWithData(aftData,'2MR','19:45',25,'M','general'),60);
assert.strictEqual(api.scoreEventWithData(aftData,'2MR','22:45',25,'F','general'),60);

const general60 = api.scoreAftWithData(aftData,{
  age:25, sex:'M', standard:'general',
  raw:{MDL:'150',HRP:'14',SDC:'2:31',PLK:'1:25','2MR':'19:45'}
});
assert.strictEqual(general60.total,300);
assert.strictEqual(general60.pass,true);
const combatSame = api.scoreAftWithData(aftData,{
  age:25, sex:'F', standard:'combat',
  raw:{MDL:'150',HRP:'14',SDC:'2:31',PLK:'1:25','2MR':'19:45'}
});
assert.strictEqual(combatSame.total,300);
assert.strictEqual(combatSame.pass,false);
assert.strictEqual(combatSame.target,350);

assert.strictEqual(api.templateStorageKey, 'pibase.sfs.officialTemplate.v1');
assert.ok(api.expectedTemplateFields.includes('Date'));
assert.ok(api.expectedTemplateFields.includes('Text1'));
assert.ok(api.expectedTemplateFields.includes('Text5'));
assert.ok(api.expectedTemplateFields.includes('Meters'));
assert.strictEqual(typeof api.openBatch, 'function');
assert.match(api.jsZipUrl, /jszip@3\.10\.1/);
assert.strictEqual(api.aftScoringUrl, './aft-scoring-data.json');

const index = await readFile(join(root, 'index.html'), 'utf8');
assert.match(index, /id="batchSfsModeBtn"/);
assert.match(index, /age:a\.age\?\?''/);
assert.match(index, /<script defer src="\.\/stripes-for-skills\.js"><\/script>/);

const worker = await readFile(join(root, 'service-worker.js'), 'utf8');
assert.ok(worker.includes("'stripes-for-skills.js'"));
assert.ok(worker.includes("'assets/stripes-for-skills-template.pdf'"));
assert.ok(worker.includes("'aft-scoring-data.json'"));
assert.ok(worker.includes('pdf-lib@1.17.1'));
assert.ok(worker.includes('jszip@3.10.1'));
assert.match(worker, /pibase-app-v43/);
assert.match(worker, /const isAppCode = [^\n]+aft-scoring-data\\\.json/);

const template = await readFile(join(root, 'assets', 'stripes-for-skills-template.pdf'));
assert.strictEqual(template.length, 271501);
assert.strictEqual(createHash('sha256').update(template).digest('hex'), 'd5a48f37d7ec6113aa9c532a755aa5a746ce86138a4a62f333e525d745047d2d');

assert.match(source, /ENLISTMENT_FIELDS/);
assert.match(source, /scoreAftWithData/);
assert.match(source, /AFT_SCORING_URL/);
assert.match(source, /AFT_SOURCE_SHA256/);
assert.doesNotMatch(source, /id="sfsAft(?:SDC|PLK|2MR)"[^>]+inputmode="numeric"/);
assert.match(source, /setText\(form, 'Meters', '', 7\)/);
assert.match(source, /setText\(form, 'Points_2', '', 7\)/);
assert.match(source, /form\.updateFieldAppearances\(font\)/);
assert.match(source, /form\.flatten\(\)/);
assert.match(source, /zip\.generateAsync/);
assert.doesNotMatch(source, /makeFallbackPdf/);
assert.doesNotMatch(source, /PDFDocument\.create\(/);
assert.doesNotMatch(source, /\b(?:updateDoc|addDoc|setDoc)\b/);
console.log('Stripes for Skills + AFT smoke OK');
