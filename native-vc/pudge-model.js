/* Dedicated native Pudge cameo. Assets are in the ordinary verified preload. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTAExamPudge = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const ROOT = '/vc-assets/local/';
  const MODEL_ID = 8;
  const MODEL_NAME = 'egepudge';
  const PED_ROW = '8, egepudge, egepudge, CIVMALE, STAT_TOUGH_GUY, man, 0, null, 9, 9';
  const FILES = [
    { name: 'egepudge.dff', bytes: 313344, kind: 0x10 },
    { name: 'egepudge.txd', bytes: 526336, kind: 0x16 }
  ];

  function bytes(value) {
    if (!(value instanceof Uint8Array)) throw new Error('Pudge model requires binary FS data');
    return value;
  }

  function patchIDE(text) {
    if (typeof text !== 'string') throw new Error('Pudge ped definitions unavailable');
    const lines = text.split(/\r?\n/);
    let inPeds = false, found = 0, insertion = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === 'peds') { inPeds = true; continue; }
      if (inPeds && line === 'end') { insertion = i; inPeds = false; }
      if (!inPeds || !/^8\s*,/.test(line)) continue;
      if (!/^8\s*,\s*egepudge\s*,\s*egepudge\s*,/i.test(line)) {
        throw new Error('Dedicated Pudge slot 8 is already occupied');
      }
      lines[i] = PED_ROW; found++;
    }
    if (found > 1) throw new Error('Duplicate Pudge ped definitions');
    if (!found) {
      if (insertion < 0) throw new Error('Native ped section unavailable');
      lines.splice(insertion, 0, '# EGE RC4.4 single cameo; player and ordinary peds unchanged', PED_ROW);
    }
    return lines.join('\n');
  }

  function patchDirectory(input) {
    input = bytes(input);
    if (!input.length || input.length % 32) throw new Error('Invalid native IMG directory');
    const records = [], found = new Map();
    let endSector = 0;
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    for (let offset = 0; offset < input.length; offset += 32) {
      let name = '';
      for (let j = offset + 8; j < offset + 32 && input[j]; j++) name += String.fromCharCode(input[j]);
      const key = name.toLowerCase();
      const start = view.getUint32(offset, true), sectors = view.getUint32(offset + 4, true);
      endSector = Math.max(endSector, start + sectors);
      if (FILES.some(file => file.name === key)) {
        if (found.has(key)) throw new Error('Duplicate Pudge IMG directory entry');
        found.set(key, records.length);
      }
      // Buffer.slice() is a view, unlike Uint8Array.slice(). Always own a fresh
      // zero-offset record before creating a DataView or editing allocation.
      records.push(new Uint8Array(input.subarray(offset, offset + 32)));
    }
    for (const file of FILES) {
      const size = Math.ceil(file.bytes / 2048);
      const index = found.get(file.name);
      let row;
      if (index !== undefined) {
        row = records[index];
        if (new DataView(row.buffer).getUint32(4, true) === size) continue;
      } else { row = new Uint8Array(32); records.push(row); }
      const target = new DataView(row.buffer);
      if (endSector + size > 0xffffffff) throw new Error('Pudge IMG directory capacity exceeded');
      target.setUint32(0, endSector, true); target.setUint32(4, size, true); endSector += size;
      for (let i = 0; i < file.name.length; i++) row[i + 8] = file.name.charCodeAt(i);
    }
    const result = new Uint8Array(records.length * 32);
    records.forEach((row, i) => result.set(row, i * 32));
    return result;
  }

  function install(FS) {
    // The startup loader has already checked SHA256 and placed both assets.
    // Never fetch on scene activation, never replace player/male01/cop.
    for (const file of FILES) {
      const data = bytes(FS.readFile(ROOT + 'models/gta3.img/' + file.name));
      if (data.length !== file.bytes || data.length % 2048 ||
          new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true) !== file.kind) {
        throw new Error('Dedicated Pudge model is incomplete');
      }
    }
    const idePath = ROOT + 'data/default.ide', dirPath = ROOT + 'models/gta3.dir';
    const ide = patchIDE(FS.readFile(idePath, { encoding: 'utf8' }));
    const directory = patchDirectory(FS.readFile(dirPath));
    // Validate both mutations before committing either to native FS.
    FS.writeFile(idePath, ide); FS.writeFile(dirPath, directory);
    return { modelId: MODEL_ID, model: MODEL_NAME, files: FILES.map(file => file.name) };
  }

  return { install, patchIDE, patchDirectory, modelId: MODEL_ID, modelName: MODEL_NAME };
});
