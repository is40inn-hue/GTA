#!/usr/bin/env python3
"""Verify all declared runtime leaves and assembled resources without a server."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
physical = {}
assembled = {}


def checked(path, record):
    content = path.read_bytes()
    assert len(content) == record['size'], f'Size: {path}'
    assert hashlib.sha256(content).hexdigest() == record['sha256'], f'SHA: {path}'
    physical[str(path.relative_to(DIST))] = len(content)
    return content


def walk(node, base):
    if isinstance(node, list):
        for item in node:
            walk(item, base)
    elif isinstance(node, dict):
        if {'path', 'size', 'sha256'} <= node.keys():
            if node.get('chunks'):
                buffer = bytearray()
                for part in node['chunks']:
                    assert part['offset'] == len(buffer), f"Chunk offset: {node['path']}"
                    buffer.extend(checked(base / part['path'], part))
                assert len(buffer) == node['size'], f"Assembly size: {node['path']}"
                assert hashlib.sha256(buffer).hexdigest() == node['sha256'], f"Assembly SHA: {node['path']}"
                assembled[str((base / node['path']).relative_to(DIST))] = len(buffer)
            else:
                checked(base / node['path'], node)
        else:
            for item in node.values():
                walk(item, base)


for manifest in ('native-vc/runtime/manifest.json', 'native-vc/runtime/vice-district/manifest.json'):
    path = DIST / manifest
    walk(json.loads(path.read_text()), path.parent)

config = json.loads((DIST / 'native-vc/range-config.json').read_text())
mission = (DIST / 'native-vc/range.scm').read_bytes()
assert len(mission) == config['size']
assert hashlib.sha256(mission).hexdigest() == config['sha256']
assert mission == (ROOT / 'scripts/native-scm/native-exam-main.scm').read_bytes()

report = {
    'physicalFiles': len(physical),
    'physicalBytes': sum(physical.values()),
    'assembledResources': len(assembled),
    'assembledBytes': sum(assembled.values()),
    'allSizesAndSHA256Match': True,
    'missionBytes': len(mission),
    'missionSHA256': config['sha256'],
    'nativeGPUExecuted': False,
}
print(json.dumps(report, ensure_ascii=False, indent=2))
