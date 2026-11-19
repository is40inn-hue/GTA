'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createCanvas, loadImage, GlobalFonts} = require(require.resolve('@napi-rs/canvas',
  {paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()]}));
for (const [f,family] of [
  ['/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf','Arial'],
  ['/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf','Arial'],
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf','Arial Black'],
  ['/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf','Courier New']
]) if (fs.existsSync(f)) GlobalFonts.registerFromPath(f,family);
const root = path.resolve(__dirname, '../../..');
const window = {};
const document = {createElement() { return createCanvas(1,1); }};
for (const file of ['exam-engine.js','final-brand.js','story-card.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file),'utf8'), {window,document,Intl});
}
function redPixels(canvas) {
  const bytes = canvas.getContext('2d').getImageData(677,290,310,141).data;
  let red = 0;
  for (let i=0;i<bytes.length;i+=4) {
    if (bytes[i]>100 && bytes[i+1]<100 && bytes[i+2]<110 && bytes[i]>bytes[i+1]+90) red++;
  }
  return red;
}
test('supplied red stamp is baked into the exported 1080×1920 card only when admitted', async () => {
  const stampImage = await loadImage(path.join(root,'assets/admission-stamp.jpg'));
  const brandImage = await loadImage(path.join(root,'assets/brand-cover-rc45.png'));
  for (const [score,mode,admitted] of [[46,'exam',false],[59,'exam',false],[60,'exam',true],[100,'exam',true],[100,'practice',false]]) {
    const sections=[{points:Math.min(score,24),max:24},{points:Math.min(Math.max(score-24,0),40),max:40},{points:Math.max(score-64,0),max:36}];
    const data = {name:'Тестовый участник',score,mode,brandImage,sections,ticketCode:'3A6C2E'};
    const result = window.GTAStory.draw({...data,stampImage});
    const baseline = window.GTAStory.draw(data);
    const png = result.toBuffer('image/png');
    assert.equal(result.width,1080); assert.equal(result.height,1920);
    assert.equal(!png.equals(baseline.toBuffer('image/png')),admitted,score+' '+mode);
    if (admitted) assert.ok(redPixels(result)>3000,'source image contributes red ink');
    if(process.env.EGE_CLICK_PREVIEW_DIR && (score===46 || score===60 || mode==='practice')) {
      fs.writeFileSync(path.join(process.env.EGE_CLICK_PREVIEW_DIR,score+'-'+mode+'.png'),png);
    }
  }
});
test('a missing or unreadable stamp still produces a shareable result', () => {
  for (const stampImage of [undefined,{width:1536,height:1024}]) {
    const result=window.GTAStory.draw({score:60,stampImage});
    assert.equal(redPixels(result),0);
    assert.ok(result.toBuffer('image/png').length>1000);
  }
});
