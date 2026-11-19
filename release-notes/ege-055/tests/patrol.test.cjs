'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = path.resolve(__dirname,'../../..');
const source = fs.readFileSync(path.join(base,'exam-b-patrol.js'),'utf8');

function harness(reduce = false) {
  const frames = new Map(), doc = new Map(), clicks = new Map(), packets = [];
  let current = 0, disposed = false;
  const refs = {
    '[data-patrol-radar]':{},
    canvas:{},
    button:{textContent:'▶ Патруль на радаре',addEventListener:(k,v)=>clicks.set(k,v),removeEventListener:k=>clicks.delete(k)},
    '[data-patrol-status]':{textContent:''},
    '[data-patrol-stars]':{dataset:{}}
  };
  const el={dataset:{},isConnected:true,querySelector:key=>refs[key]};
  const w={
    GTAHudRadar:{create(o){assert.equal(o.assetsURL,'assets/game-ui/');return {update:p=>packets.push(p),dispose:()=>disposed=true};}},
    requestAnimationFrame:f=>(frames.set(++current,f),current),
    cancelAnimationFrame:i=>frames.delete(i),matchMedia:()=>({matches:reduce}),
    document:{hidden:false,addEventListener:(k,v)=>doc.set(k,v),removeEventListener:k=>doc.delete(k)}
  };
  vm.runInNewContext(source,{window:w});
  const dispose=w.GTAExamPatrol.mount(el);
  const animate=(t)=>{const batch=[...frames.values()];frames.clear();batch.forEach(f=>f(t));};
  return {w,el,refs,frames,doc,clicks,packets,animate,dispose,isDisposed:()=>disposed};
}
test('patrol uses the Vice City radar, advances along the street and updates stars only after play',()=>{
  const h=harness();
  assert.equal(h.el.dataset.ready,'true');
  assert.equal(h.refs['[data-patrol-stars]'].dataset.level,'0');
  assert.equal(h.frames.size,0);
  h.clicks.get('click')(); h.animate(20); h.animate(1300);
  assert.notEqual(h.packets[0].player.y,h.packets.at(-1).player.y);
  assert.equal(h.refs['[data-patrol-stars]'].dataset.level,'1');
  h.animate(3500);
  assert.equal(h.refs['[data-patrol-stars]'].dataset.level,'2');
  assert.match(h.refs.button.textContent,/Повторить/);
  assert.equal(h.frames.size,0);
  h.clicks.get('click')(); h.dispose();
  assert.equal(h.frames.size,0); assert.equal(h.clicks.size,0); assert.equal(h.doc.size,0); assert.ok(h.isDisposed());
});
test('reduced motion shows the end state with no animation or timer',()=>{
  const h=harness(true);
  h.clicks.get('click')();
  assert.equal(h.frames.size,0);
  assert.equal(h.refs['[data-patrol-stars]'].dataset.level,'2');
  h.dispose();
});
test('scenes are optional overlays in exactly two edition-16 questions and scoring code is not used',()=>{
  const app=fs.readFileSync(path.join(base,'app.js'),'utf8');
  assert.match(app,/q.id === 'v14-a-demolition' && attemptEdition\(\) === 16/);
  assert.match(app,/q.id === 'v14-b-tommy-voice' && attemptEdition\(\) === 16/);
  assert.match(app,/examMicroCleanup\?\.\(\)/);
  assert.doesNotMatch(source,/localStorage|window\.GTAExam\b|saveAttempt|\.grade\(/);
  assert.ok(fs.statSync(path.join(base,'assets/game-ui/vice-radar.webp')).size>1000);
});
test('A2 shows the full original 4:3-ish gameplay frame as optional ticket evidence, with one control',()=>{
  const app = fs.readFileSync(path.join(base,'app.js'),'utf8');
  const segment = app.slice(app.indexOf('  function isGameFrameEvidence'),app.indexOf('  function disclosureText'));
  const render = vm.runInNewContext(segment + ';mediaHTML;', {
    attemptEdition:()=>16, window:{}, escape:v=>String(v).replace(/"/g,'&quot;')
  });
  const markup=render({id:'v14-a-demolition',image:'assets/rc3/vc-demolition-man.jpg',alt:'Радиовертолёт на стройке',imageCaption:'Demolition Man'});
  assert.match(markup,/class="question-media game-frame-evidence"/);
  assert.match(markup,/src="assets\/rc3\/vc-demolition-man.jpg"[^>]*width="640" height="458"/);
  assert.match(markup,/data-action="zoom">Рассмотреть кадр/);
  assert.equal((markup.match(/<button/g)||[]).length,1);
  assert.doesNotMatch(markup,/Demolition Man|canvas|<svg|data-exam-heli/);
  assert.match(app,/game-frame-full.*width="640" height="458"/);
  const index = fs.readFileSync(path.join(base,'index.html'),'utf8');
  assert.doesNotMatch(index,/exam-a-heli/);
  const css=fs.readFileSync(path.join(base,'exam-micro.css'),'utf8');
  assert.match(css,/aspect-ratio:640 \/ 458; object-fit:contain/);
});
