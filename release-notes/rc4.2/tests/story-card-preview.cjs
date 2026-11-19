// Internal geometry fixtures, deliberately not GTA screenshots. Not shipped.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtimeRoots = [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean);
const { createCanvas, GlobalFonts } = require(require.resolve('@napi-rs/canvas', { paths: runtimeRoots }));
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 'Arial');
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 'Arial');
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'Arial Black');
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf', 'Courier New');
const output = process.argv[2] || '/tmp/gta-ege-rc4-story-previews';
fs.mkdirSync(output, { recursive: true });
const window = {};
const document = { createElement(tag) { if (tag !== 'canvas') throw new Error(tag); return createCanvas(1, 1); } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/exam-engine.js'), 'utf8'), { window });
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/story-card.js'), 'utf8'), { window, document, Intl });
function fixture(width, height) {
  const cv = createCanvas(width, height), c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, '#576bb2'); g.addColorStop(0.5, '#c46796'); g.addColorStop(1, '#e2ac78');
  c.fillStyle = g; c.fillRect(0, 0, width, height);
  c.strokeStyle = '#ffffff80'; c.lineWidth = 2;
  for (let x = 30; x < width; x += 60) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, height); c.stroke(); }
  for (let y = 30; y < height; y += 60) { c.beginPath(); c.moveTo(0, y); c.lineTo(width, y); c.stroke(); }
  c.fillStyle = '#18213c'; c.font = 'bold 26px sans-serif'; c.textAlign = 'center';
  c.fillText('LAYOUT TEST FIXTURE', width / 2, height / 2 - 12);
  c.font = '18px sans-serif'; c.fillText('NO GAMEPLAY IMAGE', width / 2, height / 2 + 24);
  c.font = 'bold 20px sans-serif'; c.textAlign = 'left';
  c.fillText('TOP LEFT', 16, 34); c.fillText('BOTTOM LEFT', 16, height - 20);
  c.textAlign = 'right'; c.fillText('TOP RIGHT', width - 16, 34); c.fillText('BOTTOM RIGHT', width - 16, height - 20);
  return cv;
}
const avatar = createCanvas(180, 180), a = avatar.getContext('2d');
a.fillStyle = '#344887'; a.fillRect(0, 0, 180, 180); a.fillStyle = '#fffaf0'; a.textAlign = 'center'; a.font = 'bold 90px sans-serif'; a.fillText('У', 90, 121);
for (const entry of [
  { id: 'portrait-60', score: 60, highlightImage: fixture(540, 960), name: 'Участник', avatarImage: avatar },
  { id: 'landscape-100', score: 100, highlightImage: fixture(960, 540), name: 'Очень длинное имя участника для проверки переноса и читаемости', avatarImage: avatar },
  { id: 'no-frame-59', score: 59, name: 'Участник' }
]) {
  const sections = entry.score === 100 ? [{ points: 24, max: 24 }, { points: 40, max: 40 }, { points: 36, max: 36 }]
    : [{ points: 24, max: 24 }, { points: 24, max: 40 }, { points: entry.score - 48, max: 36 }];
  const cv = window.GTAStory.draw({ ...entry, passScore: 60, highlight: { scene: 3, kind: 'explosion' }, sections });
  const file = path.join(output, entry.id + '.png'); fs.writeFileSync(file, cv.toBuffer('image/png'));
  console.log(file);
}
