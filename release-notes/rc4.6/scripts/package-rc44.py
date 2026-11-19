#!/usr/bin/env python3
"""Package the checked static app with flat entry points and preserved launchers."""
import hashlib
import json
import re
import shutil
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
BASELINE = ROOT.parent / 'gta-ege-rc4-3-20261117' / 'dist'
NOTES = DIST / 'release-notes' / 'rc4.4'
ARCHIVE = ROOT.parent / 'gta-ege-rc4.4-prefinal-20261117-dist.zip'
EXCLUDE = {'__qa', '__pycache__', 'test-output'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def included(path):
    return path.is_file() and not any(p in EXCLUDE for p in path.parts) and path.suffix != '.pyc'


assert (ROOT / 'qa-rc44-full.txt').is_file(), 'Run the full suite before packaging.'
report = (ROOT / 'qa-rc44-full.txt').read_text()
passed = re.search(r'(?:ℹ |# )pass (\d+)', report)
failed = re.search(r'(?:ℹ |# )fail (\d+)', report)
assert passed and failed and int(failed.group(1)) == 0, 'Latest full test suite is not green.'
assert (NOTES / 'TESTING.md').is_file(), 'Write the reviewed QA notes first.'

class EntryReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.base = None
        self.references = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'base':
            self.base = attrs.get('href')
        else:
            self.references.extend(attrs[key] for key in ('src', 'href') if attrs.get(key))


for relative in ('index.html', 'rpg.html', 'rpg/index.html', 'native-vc/index.html'):
    page = DIST / relative
    parser = EntryReferences()
    parser.feed(page.read_text())
    base = (page.parent / parser.base).resolve() if parser.base else page.parent
    for src in parser.references:
        parsed = urlsplit(src)
        if parsed.scheme or parsed.netloc or src.startswith('#'):
            continue
        if not parsed.path:
            continue
        target = (base / unquote(parsed.path)).resolve()
        assert target.is_relative_to(DIST.resolve()), f'Entry reference outside package: {src}'
        assert target.exists(), f'Missing entry dependency: {relative}: {src}'

NOTES.mkdir(parents=True, exist_ok=True)
for directory in ('tests', 'scripts'):
    target = NOTES / directory
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(ROOT / directory, target, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
shutil.copy2(ROOT / 'qa-rc44-full.txt', NOTES / 'automated-tests.txt')
shutil.copy2(ROOT / 'qa-rc44-integrity.json', NOTES / 'asset-integrity.json')
shutil.copy2(ROOT / 'qa-rc44-browser.json', NOTES / 'browser-validation.json')
shutil.copy2(ROOT / 'RC4_4_MOBILE_CONTROLS.md', NOTES / 'MOBILE-CONTROLS.md')

config = json.loads((DIST / 'native-vc/range-config.json').read_text())
integrity = json.loads((ROOT / 'qa-rc44-integrity.json').read_text())
browser = json.loads((ROOT / 'qa-rc44-browser.json').read_text())
changed = []
added = []
for path in sorted(DIST.rglob('*')):
    if not included(path) or 'release-notes' in path.parts:
        continue
    relative = path.relative_to(DIST).as_posix()
    if relative == 'BUILD-RC4.4.json':
        continue
    old = BASELINE / relative
    if not old.is_file():
        added.append(relative)
    elif digest(path) != digest(old):
        changed.append(relative)

build = {
    'release': 'gta-ege-rc4.4-prefinal-20261117',
    'date': '2026-11-17', 'timezone': 'Asia/Bangkok',
    'basedOn': 'gta-ege-rc4.3-prefinal-20261117-dist.zip',
    'entrypoint': 'index.html', 'contentEdition': 16, 'storageVersion': 4,
    'questions': 12, 'maxScore': 100, 'passScore': 60,
    'sectionScores': {'A': 24, 'B': 40, 'C': 36},
    'results': {'disclosure': 'after the final commission only', 'sameVisibleAndExportedPNG': True, 'size': [1080, 1920]},
    'priorityS': {
        'preloadStartsAfterCoverPaint': True, 'sameMutedRuntimeThroughABtoC': True,
        'warmCityStartsNoGameTimer': True, 'artificialBriefingDelayMs': 0,
        'resourceConstraintsRespected': True, 'universalZeroLatencyClaim': False,
    },
    'native': {
        'engine': 'vice-city-wasm', 'runtimeBinaryChanged': False,
        'missionSize': config['size'], 'missionSHA256': config['sha256'],
        'streetTaxiAndPedestrians': True,
        'arrival': config['arrival'],
        'drive': config['drive'],
        'C2TimeLimitSeconds': config['scenes'][1]['timeLimitSeconds'],
        'C2RequiresNativePassenger': False,
        'C2Route': config['scenes'][1]['route'],
        'C3Spawn': config['scenes'][2]['spawn'],
        'scoreRecordABIChanged': False, 'originalSlotsPreserved': [0, 172],
        'pudgeModelId': 8, 'nativeModelProvenance': 'native-vc/runtime/pudge-model-provenance.json',
        'extraModelBytes': 839680,
    },
    'standaloneRoute': 'rpg/',
    'validation': {
        'automatedTestsPassed': int(passed.group(1)), 'automatedTestsFailed': 0,
        'physicalRuntimeFilesVerified': integrity['physicalFiles'],
        'assembledResourcesVerified': integrity['assembledResources'],
        'browser': browser,
        'nativeGPUVerified': False, 'nativeMobileTelegramVerified': False,
        'macFinderTested': False, 'windowsLauncherTested': False, 'liveDeploymentUpdated': False,
    },
    'changedFiles': changed, 'newFiles': added,
    'fileSHA256': {p: digest(DIST / p) for p in changed + added},
}
(DIST / 'BUILD-RC4.4.json').write_text(json.dumps(build, ensure_ascii=False, indent=2) + '\n')

files = [p for p in sorted(DIST.rglob('*')) if included(p)]
with zipfile.ZipFile(ARCHIVE, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        archive.write(path, path.relative_to(DIST).as_posix())
with zipfile.ZipFile(ARCHIVE) as archive:
    assert archive.testzip() is None, 'ZIP CRC failure'
    names = set(archive.namelist())
    for name in ('index.html', 'app.js', 'native-vc/range.scm', 'native-vc/runtime/manifest.json', 'rpg/index.html', 'START-MAC.command', 'START-WINDOWS.cmd', 'START-LINUX.sh', 'README-RC4.4.md'):
        assert name in names, f'Missing deliverable entry: {name}'
    assert not any(n.startswith('dist/') or '__qa/' in n or '__pycache__/' in n for n in names)
    for name in ('START-MAC.command', 'START-LINUX.sh'):
        assert (archive.getinfo(name).external_attr >> 16) & 0o111
    windows = archive.read('START-WINDOWS.cmd')
    assert windows.count(b'\r\n') == windows.count(b'\n')

output = {
    'archive': str(ARCHIVE), 'bytes': ARCHIVE.stat().st_size,
    'MiB': round(ARCHIVE.stat().st_size / 1048576, 2),
    'files': len(files), 'sha256': digest(ARCHIVE), 'flatRoot': True,
    'crcChecked': True, 'launcherModesAndLineEndingsChecked': True,
}
(ROOT / 'qa-rc44-package.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(output, ensure_ascii=False, indent=2))
