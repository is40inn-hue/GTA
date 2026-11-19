#!/usr/bin/env python3
"""Extract the shipped VC HUD sprites and radar tiles, without new downloads.

This decodes the actual RenderWare D3D8 DXT1/DXT3 payloads to web assets.
The source runtime remains byte-identical. A provenance report records inputs.
"""
from pathlib import Path
import hashlib
import json
import struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / 'dist/native-vc/runtime'
OUT = ROOT / 'dist/assets/game-ui'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def chunks(raw):
    offset = 0
    while offset + 12 <= len(raw):
        kind, size, version = struct.unpack_from('<III', raw, offset)
        if kind == size == 0:
            break
        assert offset + 12 + size <= len(raw), 'Truncated RW chunk'
        yield kind, raw[offset + 12:offset + 12 + size]
        offset += 12 + size


def rgb565(value):
    r, g, b = (value >> 11) & 31, (value >> 5) & 63, value & 31
    return ((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2), 255)


def dxt(data, width, height, mode):
    assert mode in (1, 3)
    stride = 8 if mode == 1 else 16
    assert len(data) >= ((width + 3) // 4) * ((height + 3) // 4) * stride
    image = Image.new('RGBA', (width, height))
    pixels = image.load()
    off = 0
    for y in range(0, height, 4):
        for x in range(0, width, 4):
            alphas = int.from_bytes(data[off:off + 8], 'little') if mode == 3 else None
            color_off = off + (8 if mode == 3 else 0)
            c0, c1, selectors = struct.unpack_from('<HHI', data, color_off)
            colors = [rgb565(c0), rgb565(c1)]
            if c0 > c1 or mode == 3:
                colors += [tuple((2 * a + b) // 3 for a, b in zip(colors[0][:3], colors[1][:3])) + (255,),
                           tuple((a + 2 * b) // 3 for a, b in zip(colors[0][:3], colors[1][:3])) + (255,)]
            else:
                colors += [tuple((a + b) // 2 for a, b in zip(colors[0][:3], colors[1][:3])) + (255,), (0, 0, 0, 0)]
            for i in range(16):
                px, py = x + i % 4, y + i // 4
                if px >= width or py >= height:
                    continue
                color = colors[(selectors >> (2 * i)) & 3]
                if alphas is not None:
                    color = color[:3] + (((alphas >> (4 * i)) & 15) * 17,)
                pixels[px, py] = color
            off += stride
    return image


def textures(raw):
    top = next(chunks(raw))
    assert top[0] == 0x16
    for kind, payload in chunks(top[1]):
        if kind != 0x15:
            continue
        structure = next(chunks(payload))
        assert structure[0] == 1
        data = structure[1]
        assert struct.unpack_from('<I', data)[0] == 8, 'Expected D3D8 raster'
        name = data[8:40].split(b'\0')[0].decode('ascii')
        width, height, depth, levels, raster_type, mode = struct.unpack_from('<HHBBBB', data, 80)
        assert depth == 16 and levels > 0
        size = struct.unpack_from('<I', data, 88)[0]
        yield name, dxt(data[92:92 + size], width, height, mode)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((RUNTIME / 'manifest.json').read_text())
    package = b''.join((RUNTIME / part['path']).read_bytes() for part in manifest['data']['chunks'])
    assert sha(package) == manifest['data']['sha256']
    js = (RUNTIME / 'index.js').read_text()
    metadata = json.JSONDecoder().raw_decode(js[js.index('{"files":'):])[0]
    entry = next(row for row in metadata['files'] if row['filename'].endswith('/models/hud.txd'))
    hud = package[entry['start']:entry['end']]
    wanted = {'radar_save': 'save', 'RWave': 'radio', 'phone': 'phone', 'gun': 'gun',
              'radar_centre': 'player', 'radar_north': 'north', 'bikers': 'bike',
              'radardisc': 'radar-disc', 'kcabs': 'taxi'}
    outputs = []
    for name, image in textures(hud):
        if name not in wanted:
            continue
        path = OUT / (wanted[name] + '.png')
        image.save(path, optimize=True)
        outputs.append({'path': str(path.relative_to(ROOT / 'dist')), 'sourceTexture': name,
                        'dimensions': list(image.size), 'size': path.stat().st_size, 'sha256': sha(path.read_bytes())})
    assert len(outputs) == len(wanted)
    # VC's radar grid is row-major: radar00 is the north-west tile.
    atlas = Image.new('RGB', (1024, 1024))
    tile_sources = []
    for index in range(64):
        path = RUNTIME / ('remote/models/gta3.img/radar%02d.txd' % index)
        raw = path.read_bytes()
        name, tile = next(textures(raw))
        assert name.lower() == 'radar%02d' % index and tile.size == (128, 128)
        atlas.paste(tile.convert('RGB'), ((index % 8) * 128, (index // 8) * 128))
        tile_sources.append({'name': path.name, 'sha256': sha(raw)})
    atlas_path = OUT / 'vice-radar.webp'
    atlas.save(atlas_path, 'WEBP', lossless=True, method=6)
    outputs.append({'path': str(atlas_path.relative_to(ROOT / 'dist')), 'dimensions': list(atlas.size),
                    'size': atlas_path.stat().st_size, 'sha256': sha(atlas_path.read_bytes())})
    report = {'source': 'Already supplied project runtime; no asset downloads',
              'dataSHA256': sha(package), 'hudSHA256': sha(hud), 'tiles': tile_sources,
              'generated': outputs, 'totalWebBytes': sum(x['size'] for x in outputs)}
    (OUT / 'provenance.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'assets': len(outputs), 'bytes': report['totalWebBytes'], 'directory': str(OUT)}))


if __name__ == '__main__':
    main()
