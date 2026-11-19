'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { create } = require('../dist/native-assets.js');
const sha = value => createHash('sha256').update(value).digest('hex');
const turn = () => new Promise(setImmediate);

function fixture({ unavailable = false } = {}) {
  const rows = new Map(), calls = [], raw = Buffer.from('prepared-city');
  const chunks = [raw.subarray(0, 5), raw.subarray(5)].map((bytes, index) => ({ path: 'city-' + index + '.bin', size: bytes.length, sha256: sha(bytes), offset: index ? 5 : 0 }));
  const file = { path: 'city.data', size: raw.length, sha256: sha(raw), chunks };
  const key = part => 'https://cache.test/native-vc/runtime/' + part.path + '?v=' + part.sha256.slice(0, 12);
  const cache = { match: async url => rows.get(url)?.clone(), put: async (url, response) => rows.set(url, new Response(await response.arrayBuffer())), delete: async url => rows.delete(url) };
  const root = { document: { currentScript: { src: 'https://cache.test/native-assets.js' } }, location: { href: 'https://cache.test/' },
    crypto: webcrypto, URL, Response, AbortController, setTimeout, clearTimeout,
    caches: { open: async () => { if (unavailable) throw new Error('cache unavailable'); return cache; } },
    fetch: async url => { calls.push(url); const index = chunks.findIndex(part => key(part) === url); assert(index >= 0); return new Response(raw.subarray(chunks[index].offset, chunks[index].offset + chunks[index].size)); } };
  const api = create(root);
  async function populate() { for (const part of chunks) await cache.put(key(part), new Response(raw.subarray(part.offset, part.offset + part.size))); }
  return { root, rows, calls, raw, file, chunks, key, cache, api, populate };
}

test('warm cache-only assembly verifies cached chunks and full SHA without a network request', async () => {
  const h = fixture(), progress = []; await h.populate();
  const result = await h.api.getAsset(h.file, { priority: 'low', cacheOnly: true, onBytes: row => progress.push(row) });
  assert.deepEqual(Buffer.from(result), h.raw); assert.equal(h.calls.length, 0);
  assert(progress.every(row => row.cached && row.source === 'cache'));
  await assert.rejects(h.api.getAsset({ ...h.file, sha256: '0'.repeat(64) }, { priority: 'low', cacheOnly: true }), { name: 'IntegrityError' });
  await assert.rejects(h.api.getAsset(h.file, { priority: 'low' }), { name: 'IntegrityError' });
});

test('warm cache miss, corruption and unavailable storage stop without network fallback', async () => {
  for (const kind of ['missing', 'corrupt', 'unavailable']) {
    const h = fixture({ unavailable: kind === 'unavailable' });
    await h.populate();
    if (kind === 'missing') h.rows.delete(h.key(h.chunks[1]));
    if (kind === 'corrupt') await h.cache.put(h.key(h.chunks[1]), new Response('damaged!'));
    await assert.rejects(h.api.getAsset(h.file, { priority: 'low', cacheOnly: true }), { name: 'CacheMissError' });
    assert.equal(h.calls.length, 0, kind);
    const result = await h.api.getAsset(h.file, { priority: 'high' });
    assert.deepEqual(Buffer.from(result), h.raw, 'explicit foreground loading still recovers');
  }
});

test('warm cache-only caller cannot adopt or create an ordinary inflight network request', async () => {
  const h = fixture(); let release;
  h.root.fetch = async url => { h.calls.push(url); await new Promise(resolve => { release = resolve; }); return new Response(h.raw.subarray(0, 5)); };
  const foreground = h.api.getAsset(h.chunks[0], { priority: 'high' }); await turn();
  await assert.rejects(h.api.getAsset(h.chunks[0], { priority: 'low', cacheOnly: true }), { name: 'CacheMissError' });
  assert.equal(h.calls.length, 1); release(); assert.equal(Buffer.from(await foreground).toString(), 'prepa');
});

test('warm cached assembly yields before each chunk and checks cancellation after the yield', async () => {
  const h = fixture(); await h.populate(); const controller = new AbortController();
  let release, yielded = 0;
  const pending = h.api.getAsset(h.file, { priority: 'low', cacheOnly: true, signal: controller.signal,
    beforeChunk: async () => { yielded++; if (yielded === 2) await new Promise(resolve => { release = resolve; }); } });
  const handled = pending.catch(error => error);
  while (!release) await turn();
  assert.equal(yielded, 2); assert.equal(h.calls.length, 0);
  controller.abort(); release(); assert.equal((await handled).name, 'AbortError');
});
