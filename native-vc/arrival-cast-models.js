/* RC4.7 arrival cast: a separate VC-native CJ-like extra and the shipped club dancer. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTAExamArrivalCast = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const ROOT = '/vc-assets/local/';
  const ROWS = {
    108: '108, egecj, egecj, CIVMALE, STAT_SENSIBLE_GUY, man, 0, null, 9, 9',
    109: '109, stripa, stripa, CIVFEMALE, STAT_SENSIBLE_GIRL, sexywoman, 0, null, 9, 9'
  };
  const FILES = [
    { name: 'egecj.dff', bytes: 73728, kind: 0x10, added: true },
    { name: 'egecj.txd', bytes: 18432, kind: 0x16, added: true },
    { name: 'stripa.dff', bytes: 86016, kind: 0x10, added: false },
    { name: 'stripa.txd', bytes: 22528, kind: 0x16, added: false }
  ];
  function bytes(value) {
    if (!(value instanceof Uint8Array)) throw new Error('Arrival cast requires binary FS data');
    return value;
  }
  function patchIDE(text) {
    if (typeof text !== 'string') throw new Error('Arrival cast ped definitions unavailable');
    const lines = text.split(/\r?\n/), found = { 108: 0, 109: 0 };
    let inPeds = false, insertion = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === 'peds') { inPeds = true; continue; }
      if (inPeds && line === 'end') { insertion = i; inPeds = false; }
      if (!inPeds) continue;
      const match = /^(108|109)\s*,/i.exec(line); if (!match) continue;
      const id = Number(match[1]); found[id]++;
      const valid = id === 108 ? /^108\s*,\s*egecj\s*,\s*egecj\s*,/i.test(line) :
        /^109\s*,\s*(?:special01\s*,\s*generic|stripa\s*,\s*stripa)\s*,/i.test(line);
      if (!valid || found[id] > 1) throw new Error('Arrival cast slot ' + id + ' is occupied');
      lines[i] = ROWS[id];
    }
    if (insertion < 0 || found[109] !== 1) throw new Error('Native special01 slot unavailable');
    if (!found[108]) lines.splice(insertion, 0, '# EGE RC4.7 separate white-vest extra', ROWS[108]);
    return lines.join('\n');
  }
  function patchDirectory(input) {
    input = bytes(input);
    if (!input.length || input.length % 32) throw new Error('Invalid native IMG directory');
    const records = [], found = new Map(); let endSector = 0;
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    for (let offset = 0; offset < input.length; offset += 32) {
      let name = '';
      for (let j = offset + 8; j < offset + 32 && input[j]; j++) name += String.fromCharCode(input[j]);
      const key = name.toLowerCase(), start = view.getUint32(offset, true), sectors = view.getUint32(offset + 4, true);
      endSector = Math.max(endSector, start + sectors);
      if (FILES.some(file => file.name === key)) {
        if (found.has(key)) throw new Error('Duplicate arrival cast IMG entry');
        found.set(key, records.length);
      }
      records.push(new Uint8Array(input.subarray(offset, offset + 32)));
    }
    for (const file of FILES) {
      const index = found.get(file.name), size = Math.ceil(file.bytes / 2048);
      if (!file.added) {
        if (index === undefined || new DataView(records[index].buffer).getUint32(4, true) < size) {
          throw new Error('Bundled dancer IMG entry unavailable');
        }
        continue;
      }
      let row;
      if (index !== undefined) {
        row = records[index];
        if (new DataView(row.buffer).getUint32(4, true) === size) continue;
      } else { row = new Uint8Array(32); records.push(row); }
      const target = new DataView(row.buffer);
      if (endSector + size > 0xffffffff) throw new Error('Arrival cast IMG directory capacity exceeded');
      target.setUint32(0, endSector, true); target.setUint32(4, size, true); endSector += size;
      for (let i = 0; i < file.name.length; i++) row[i + 8] = file.name.charCodeAt(i);
    }
    const result = new Uint8Array(records.length * 32);
    records.forEach((row, i) => result.set(row, i * 32)); return result;
  }
  function install(FS) {
    // Preverified assets already exist. The original player and human files are untouched.
    for (const file of FILES) {
      const data = bytes(FS.readFile(ROOT + 'models/gta3.img/' + file.name));
      if (data.length !== file.bytes || data.length % 2048 ||
          new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true) !== file.kind) {
        throw new Error('Arrival cast model is incomplete');
      }
    }
    const idePath = ROOT + 'data/default.ide', dirPath = ROOT + 'models/gta3.dir';
    const ide = patchIDE(FS.readFile(idePath, { encoding: 'utf8' }));
    const directory = patchDirectory(FS.readFile(dirPath));
    FS.writeFile(idePath, ide); FS.writeFile(dirPath, directory);
    return { models: [108, 109], files: FILES.map(file => file.name) };
  }
  return { install, patchIDE, patchDirectory, models: [108, 109] };
});
