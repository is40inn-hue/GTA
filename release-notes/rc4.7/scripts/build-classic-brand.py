"""Build the same small vector wordmark for HTML and the exported result card.

Uses local DejaVu Sans Bold outlines, never a remote font or raster artwork.
The original font notice is shipped beside the generated asset.
"""
from pathlib import Path
import json
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[1]
FONT = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
font = TTFont(FONT)
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()


class LogoPen(BasePen):
    def __init__(self, ox, sx, sy, left, top, ymax):
        super().__init__(glyphs)
        self.ox, self.sx, self.sy, self.left, self.top, self.ymax = ox, sx, sy, left, top, ymax
        self.commands = []

    def pt(self, point):
        x, y = point
        return [round((x + self.ox) * self.sx + self.left, 2), round((self.ymax - y) * self.sy + self.top, 2)]

    def _moveTo(self, p): self.commands.append(['M', *self.pt(p)])
    def _lineTo(self, p): self.commands.append(['L', *self.pt(p)])
    def _curveToOne(self, a, b, p): self.commands.append(['C', *self.pt(a), *self.pt(b), *self.pt(p)])
    def _qCurveToOne(self, a, p): self.commands.append(['Q', *self.pt(a), *self.pt(p)])
    def _closePath(self): self.commands.append(['Z'])


commands = []
for word, width, top in [('единый', 494, 14), ('гангстерский', 674, 105), ('экзамен', 558, 196)]:
    names = [cmap[ord(letter)] for letter in word]
    advances = [glyphs[name].width - 85 for name in names]
    pen = BoundsPen(glyphs)
    for name in names: glyphs[name].draw(pen)
    _, ymin, _, ymax = pen.bounds
    sx, sy = width / sum(advances), 83 / (ymax - ymin)
    ox = 0
    for name, advance in zip(names, advances):
        pen = LogoPen(ox, sx, sy, (720 - width) / 2, top, ymax)
        glyphs[name].draw(pen)
        commands.extend(pen.commands)
        ox += advance

d = ' '.join(command[0] + ' '.join(str(v) for v in command[1:]) for command in commands)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 300" role="img" aria-labelledby="title">
<title id="title">Единый гангстерский экзамен</title>
<g stroke-linejoin="round" stroke-linecap="round">
<path d="{d}" transform="translate(4 6)" fill="#b52c52" stroke="#b52c52" stroke-width="18"/>
<path d="{d}" fill="#252638" stroke="#252638" stroke-width="16"/>
<path d="{d}" fill="#fffaf0" stroke="#fffaf0" stroke-width="2"/>
</g></svg>'''
(ROOT / 'dist/assets/classic-wordmark.svg').write_text(svg, encoding='utf-8')

js = ''''use strict';
/* Generated vector outlines: also used in assets/classic-wordmark.svg.
   Local synchronous drawing: no font race, decode, fetch or canvas image taint. */
(function () {
  const commands = __COMMANDS__;
  function trace(c) {
    c.beginPath();
    for (const p of commands) {
      if (p[0] === 'M') c.moveTo(p[1], p[2]);
      else if (p[0] === 'L') c.lineTo(p[1], p[2]);
      else if (p[0] === 'Q') c.quadraticCurveTo(p[1], p[2], p[3], p[4]);
      else if (p[0] === 'C') c.bezierCurveTo(p[1], p[2], p[3], p[4], p[5], p[6]);
      else c.closePath();
    }
  }
  function draw(c, x, y, width, height) {
    c.save(); c.translate(x, y); c.scale(width / 720, height / 300);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.save(); c.translate(4, 6); trace(c);
    c.fillStyle = c.strokeStyle = '#b52c52'; c.lineWidth = 18; c.stroke(); c.fill(); c.restore();
    trace(c); c.fillStyle = c.strokeStyle = '#252638'; c.lineWidth = 16; c.stroke(); c.fill();
    c.fillStyle = c.strokeStyle = '#fffaf0'; c.lineWidth = 2; c.stroke(); c.fill();
    c.restore();
  }
  window.GTAClassicBrand = Object.freeze({ draw: draw });
})();
'''.replace('__COMMANDS__', json.dumps(commands, ensure_ascii=False, separators=(',', ':')))
(ROOT / 'dist/classic-brand.js').write_text(js, encoding='utf-8')
(ROOT / 'dist/assets/classic/font-notice.txt').write_text(Path('/usr/share/doc/fonts-dejavu-core/copyright').read_text(), encoding='utf-8')
print('Wrote classic-wordmark.svg and classic-brand.js')
