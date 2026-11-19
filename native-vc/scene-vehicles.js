/* Authored native bike and equipped patrol helicopter. Assets are preloaded. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GTAExamSceneVehicles=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const ROOT='/vc-assets/local/';
  const FILES=Object.freeze([
    {name:'pcj600.dff',bytes:57344,kind:0x10},
    {name:'pcj600.txd',bytes:2048,kind:0x16},
    {name:'polmav.dff',bytes:200704,kind:0x10},
    {name:'polmav.txd',bytes:22528,kind:0x16}
  ]);
  const bytes=value=>{if(!(value instanceof Uint8Array))throw Error('Native vehicle bytes unavailable');return value;};
  function validateDefinitions(text){
    if(typeof text!=='string')throw Error('Native vehicle definitions unavailable');
    const lines=text.split(/\r?\n/);
    for(const [id,name,type,handling] of [[191,'pcj600','bike','BIKE'],[227,'polmav','car','POLMAV']]){
      const rows=lines.filter(x=>new RegExp('^\\s*'+id+'\\s*,').test(x));
      if(rows.length!==1||!new RegExp('^\\s*'+id+'\\s*,\\s*'+name+'\\s*,\\s*'+name+'\\s*,\\s*'+type+'\\s*,\\s*'+handling+'\\s*,').test(rows[0]))throw Error('Native vehicle slot '+id+' mismatch');
    }
  }
  function validateCollision(raw){
    raw=bytes(raw);const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),found=new Set();
    for(let at=0;at+32<=raw.length;){
      if(String.fromCharCode(...raw.subarray(at,at+4))!=='COLL')throw Error('Vehicle collision format mismatch');
      const end=at+8+view.getUint32(at+4,true);if(end>raw.length||end<=at+72)throw Error('Truncated vehicle collision');
      let name='';for(let i=at+8;i<at+30&&raw[i];i++)name+=String.fromCharCode(raw[i]);
      if(name==='pcj600'||name==='polmav'){
        const radius=view.getFloat32(at+32,true);
        if(!(radius>0&&radius<20))throw Error('Invalid vehicle collision bounds');
        found.add(name);
      }
      at=end;
    }
    if(found.size!==2)throw Error('Native bike/patrol collision unavailable');
  }
  function patchDirectory(input){
    input=bytes(input);if(!input.length||input.length%32)throw Error('Invalid IMG directory');
    const rows=[],found=new Map(),v=new DataView(input.buffer,input.byteOffset,input.byteLength);let end=0;
    for(let at=0;at<input.length;at+=32){
      const row=new Uint8Array(input.subarray(at,at+32));let name='';
      for(let i=8;i<32&&row[i];i++)name+=String.fromCharCode(row[i]);
      end=Math.max(end,v.getUint32(at,true)+v.getUint32(at+4,true));
      if(FILES.some(f=>f.name===name)){
        if(found.has(name))throw Error('Duplicate vehicle IMG record');found.set(name,rows.length);
      }
      rows.push(row);
    }
    for(const f of FILES){
      const index=found.get(f.name),sectors=f.bytes/2048;
      let row=index===undefined?new Uint8Array(32):rows[index];
      if(index===undefined)rows.push(row);
      const dv=new DataView(row.buffer);
      if(index!==undefined&&dv.getUint32(4,true)===sectors)continue;
      if(end+sectors>0xffffffff)throw Error('IMG directory capacity exceeded');
      dv.setUint32(0,end,true);dv.setUint32(4,sectors,true);end+=sectors;
      for(let i=0;i<f.name.length;i++)row[8+i]=f.name.charCodeAt(i);
    }
    const out=new Uint8Array(rows.length*32);rows.forEach((row,i)=>out.set(row,i*32));return out;
  }
  function install(FS){
    for(const f of FILES){
      const b=bytes(FS.readFile(ROOT+'models/gta3.img/'+f.name));
      if(b.length!==f.bytes||b.length%2048||new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true)!==f.kind)throw Error('Native vehicle model incomplete');
    }
    validateDefinitions(FS.readFile(ROOT+'data/default.ide',{encoding:'utf8'}));
    validateCollision(FS.readFile(ROOT+'models/coll/vehicles.col'));
    const p=ROOT+'models/gta3.dir',directory=patchDirectory(FS.readFile(p));
    FS.writeFile(p,directory);
    return {models:[191,227],files:FILES.map(f=>f.name)};
  }
  return Object.freeze({install,patchDirectory,validateDefinitions,validateCollision,files:FILES});
});
