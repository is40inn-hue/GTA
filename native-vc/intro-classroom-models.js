/* GTA EGE 0.5.2 — install real Vice City RenderWare classroom in an isolated
   engine instance. Does not touch C practice, its SCM or scored ABI. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTAExamClassroomModels = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const ROOT = '/vc-assets/local/';
  const ID = 5035;
  const FILES = Object.freeze([
    { name: 'egeclass.dff', bytes: 141312, kind: 0x10 },
    { name: 'egeclass.txd', bytes: 2048, kind: 0x16 },
    { name: 'wfybu.txd', bytes: 34816, kind: 0x16 }
  ]);
  const ROW = `${ID}, egeclass, egeclass, 1, 160, 0`;
  function validFile(file, input) {
    if (!(input instanceof Uint8Array) || input.length !== file.bytes || input.length % 2048 ||
        new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(0, true) !== file.kind)
      throw new Error('Incomplete RenderWare intro model: ' + file.name);
    return input;
  }
  function patchIDE(text) {
    if (typeof text !== 'string' || !text) throw new Error('Native IDE unavailable');
    const lines = text.split(/\r?\n/);
    let inside = false, insertion = -1, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const str = lines[i].trim();
      if (str.toLowerCase() === 'objs') { inside = true; continue; }
      if (inside && str.toLowerCase() === 'end') { insertion = i; inside = false; continue; }
      if (new RegExp('^' + ID + '\\s*,').test(str)) {
        if (!inside || !new RegExp('^' + ID + '\\s*,\\s*egeclass\\s*,\\s*egeclass\\s*,','i').test(str))
          throw new Error('Native intro object ID 5035 is occupied');
        count++;
      }
    }
    if (insertion < 0 || count > 1) throw new Error('Native classroom IDE objects segment unavailable');
    if (!count) lines.splice(insertion, 0, '# EGE 0.5.2 native exam classroom', ROW);
    return lines.join('\n');
  }
  function patchDirectory(input) {
    if (!(input instanceof Uint8Array) || !input.length || input.length % 32) throw new Error('Invalid IMG directory');
    const records=[], found=new Map(), view=new DataView(input.buffer,input.byteOffset,input.byteLength);
    let endSector=0;
    for(let i=0;i<input.length;i+=32){
      let name='';for(let j=i+8;j<i+32&&input[j];j++)name+=String.fromCharCode(input[j]);
      const key=name.toLowerCase(),start=view.getUint32(i,true),sectors=view.getUint32(i+4,true);
      if (!sectors || start+sectors>0xffffffff)throw new Error('Invalid IMG sector span');
      endSector=Math.max(endSector,start+sectors);
      if(FILES.some(f=>f.name===key)){if(found.has(key))throw new Error('Duplicate intro IMG entry '+key);found.set(key,records.length);}
      records.push(new Uint8Array(input.subarray(i,i+32)));
    }
    for(const f of FILES){
      const count=f.bytes/2048,index=found.get(f.name);
      let row;
      if(index!==undefined){row=records[index];const size=new DataView(row.buffer).getUint32(4,true);if(size===count)continue;}
      else{row=new Uint8Array(32);records.push(row);}
      if(endSector+count>0xffffffff)throw new Error('Native intro IMG capacity exceeded');
      const v=new DataView(row.buffer);v.setUint32(0,endSector,true);v.setUint32(4,count,true);endSector+=count;
      row.fill(0,8);for(let j=0;j<f.name.length;j++)row[j+8]=f.name.charCodeAt(j);
    }
    const result=new Uint8Array(records.length*32);
    records.forEach((row,i)=>result.set(row,32*i));return result;
  }
  function install(FS, models) {
    if(!FS || !models)throw new Error('Missing native classroom filesystem');
    for(const file of FILES){
      const data=validFile(file,models[file.name]);
      FS.writeFile(ROOT+'models/gta3.img/'+file.name,data);
    }
    // Every change is exclusive to this intro instance; practice C receives none.
    const idePath=ROOT+'data/maps/generic.ide',dirPath=ROOT+'models/gta3.dir';
    const patchedIDE=patchIDE(FS.readFile(idePath,{encoding:'utf8'}));
    const patchedDir=patchDirectory(FS.readFile(dirPath));
    FS.writeFile(idePath,patchedIDE);FS.writeFile(dirPath,patchedDir);
    return Object.freeze({roomModelId:ID,teacherModelId:67,models:FILES.map(f=>f.name)});
  }
  return Object.freeze({install,patchIDE,patchDirectory,validFile,files:FILES});
});
