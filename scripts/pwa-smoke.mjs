import assert from 'node:assert';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const text = path => readFile(join(root, path), 'utf8');

const manifest = JSON.parse(await text('manifest.webmanifest'));
assert.strictEqual(manifest.display, 'standalone');
assert.strictEqual(manifest.start_url, './index.html');
assert.strictEqual(manifest.scope, './');
assert.strictEqual(manifest.theme_color, '#0D1210');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);
assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'));
assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));

for (const icon of manifest.icons) {
  const path = icon.src.replace(/^\.\//, '');
  assert.ok((await stat(join(root, path))).size > 0, `${path} must exist and be non-empty`);
}

for (const page of ['index.html', 'display.html', 'events.html']) {
  const html = await text(page);
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color" content="#0D1210">/);
  assert.match(html, /<script type="module" src="\.\/pwa-runtime\.js"><\/script>/);
}

const worker = await text('service-worker.js');
for (const shellFile of [
  'index.html', 'display.html', 'events.html', 'offline.html',
  'manifest.webmanifest', 'pwa-runtime.js', 'calendar.ics'
]) {
  assert.ok(worker.includes(`'${shellFile}'`), `${shellFile} must be pre-cached`);
}
assert.match(worker, /SKIP_WAITING/);
assert.doesNotMatch(worker, /const CACHE_NAME = 'pibase-kiosk-/);

console.log('PWA smoke OK');
