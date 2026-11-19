const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p)),json=p=>JSON.parse(read(p));
test('edition10 native contract: physical checkpoints, isolated mission threat, preserved v9',()=>{
 const c=json('dist/native-vc/range-config.json');
 assert.equal(c.version,3);assert.deepEqual(c.scenes.map(s=>[s.scene,s.action,s.ammo,s.targetCount]),[[1,'destroy',40,1],[2,'hijack',0,1],[3,'finale',6,3]]);
 assert.deepEqual(c.scenes[2].targetPoints,[4,4,6]);assert.equal(new Set(Object.values(c.slots)).size,Object.keys(c.slots).length);
 assert.notEqual(c.slots.missionHeat,c.slots.wanted);for(let i=0;i<3;i++)assert.ok(Number.isInteger(c.slots[`target${i}_rpgHit`]));
 assert.equal(crypto.createHash('sha256').update(read('dist/native-vc/range.scm')).digest('hex'),c.sha256);
 const old=json('dist/native-vc/range-v9-config.json');assert.equal(old.scenes[0].action,'hijack');assert.equal(old.scenes[2].ammo,3);
 assert.equal(crypto.createHash('sha256').update(read('dist/native-vc/range-v9.scm')).digest('hex'),old.sha256);
 const script=read('scripts/native-scm/build-native-exam-scm.py').toString();assert.match(script,/SCRIPTED_PURSUIT_ENABLED = True/);assert.match(script,/GLOBAL_WANTED_ENABLED = False/);
 const ui=read('dist/native-vc/native.js').toString();assert.match(ui,/phases\.playing && \(state\.weapon === config\.weapon \|\| sequence10\)/);assert.match(ui,/legacy9 \? 'range-v9\.scm'/);
});
