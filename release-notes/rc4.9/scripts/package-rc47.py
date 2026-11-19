#!/usr/bin/env python3
"""Package RC4.7 after reviewed tests and integrity checks; never deploy."""
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
BASELINE = ROOT.parent / 'gta-ege-rc4-6-20261117' / 'dist'
NOTES = DIST / 'release-notes' / 'rc4.7'
ARCHIVE = ROOT.parent / 'gta-ege-rc4.7-20261117-dist.zip'
EXCLUDE = {'__qa', '__pycache__', 'test-output', 'qa-artwork'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def included(path):
    return path.is_file() and not any(p in EXCLUDE for p in path.parts) and path.suffix != '.pyc'


report = (ROOT / 'qa-rc47-full.txt').read_text()
passed = re.search(r'(?:ℹ |# )pass (\d+)', report)
failed = re.search(r'(?:ℹ |# )fail (\d+)', report)
assert passed and failed and int(failed.group(1)) == 0, 'Latest full suite must be green.'
assert (NOTES / 'TESTING.md').is_file(), 'Write reviewed QA notes first.'


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
        if parsed.scheme or parsed.netloc or src.startswith('#') or not parsed.path:
            continue
        target = (base / unquote(parsed.path)).resolve()
        assert target.is_relative_to(DIST.resolve()), f'Outside entry dependency: {src}'
        assert target.exists(), f'Missing entry dependency: {relative}: {src}'

cover = DIST / 'assets/brand-cover-rc45.png'
assert digest(cover) == 'd8d7f1c240b3c9e3cdaa2735d99a164ff4dde5e10cab62d9978d3556e4209b0f', 'Approved cover bytes changed.'
config = json.loads((DIST / 'native-vc/range-config.json').read_text())
assert (DIST / 'native-vc/range.scm').stat().st_size == config['size']
assert digest(DIST / 'native-vc/range.scm') == config['sha256']
assert config['arrival']['runTarget'] == 'current-player-position'
assert config['slots']['cameoSeen'] == 190
assert config['slots']['record2_cameoSeen'] == 192

integrity = json.loads((ROOT / 'qa-rc47-integrity.json').read_text())
browser = json.loads((ROOT / 'qa-rc47-browser.json').read_text())
assert integrity['allSizesAndSHA256Match'] is True
assert integrity['missionSHA256'] == config['sha256']
assert browser['nativeGPUExecuted'] is False

provenance = {}
for name in ('pudge-model', 'block-ped', 'arrival-cast'):
    record = json.loads((DIST / f'native-vc/runtime/{name}-provenance.json').read_text())
    provenance[name] = record
    for entry in record['files']:
        asset = DIST / 'native-vc/runtime' / entry['path']
        assert asset.stat().st_size == entry['size']
        assert digest(asset) == entry['sha256']
assert provenance['block-ped']['modelID'] == 107

for directory in ('tests', 'scripts'):
    target = NOTES / directory
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(ROOT / directory, target, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
for source, target in (
    ('qa-rc47-full.txt', 'automated-tests.txt'),
    ('qa-rc47-integrity.json', 'asset-integrity.json'),
    ('qa-rc47-browser.json', 'browser-validation.json'),
    ('RC4_7_REVIEW.md', 'SCENE-AND-UX.md'),
    ('RC4_4_MOBILE_CONTROLS.md', 'MOBILE-CONTROLS.md'),
    ('RC4_7_DRIVING.md', 'DRIVING.md'),
    ('qa-rc47-first-load.json', 'first-load.json'),
    ('qa-rc47-native.txt', 'native-focused-tests.txt'),
    ('qa-rc47-native-contracts.txt', 'native-contract-tests.txt'),
    ('qa-rc47-preload-focused.txt', 'preload-tests.txt'),
):
    shutil.copy2(ROOT / source, NOTES / target)

changed, added = [], []
for path in sorted(DIST.rglob('*')):
    if not included(path) or 'release-notes' in path.parts:
        continue
    relative = path.relative_to(DIST).as_posix()
    if relative == 'BUILD-RC4.7.json':
        continue
    old = BASELINE / relative
    if not old.is_file():
        added.append(relative)
    elif digest(path) != digest(old):
        changed.append(relative)

build = {
    'release': 'gta-ege-rc4.7-20261117',
    'date': '2026-11-17', 'timezone': 'Asia/Bangkok',
    'basedOn': 'gta-ege-rc4.6-20261117-dist.zip',
    'entrypoint': 'index.html', 'contentEdition': 16, 'storageVersion': 4,
    'questions': 12, 'maxScore': 100, 'passScore': 60,
    'sectionScores': {'A': 24, 'B': 40, 'C': 36},
    'results': {'disclosure': 'after final commission only', 'sameVisibleAndExportedPNG': True, 'size': [1080, 1920]},
    'priorityS': {
        'preloadStartsAfterCoverPaint': True, 'sameMutedRuntimeThroughABtoC': True,
        'warmCityStartsNoGameTimer': True, 'artificialBriefingDelayMs': 0,
        'resourceConstraintsRespected': True, 'universalZeroLatencyClaim': False,
        'persistentCacheRequired': False, 'boundedSessionFallbackMiB': {'normal': 80, 'knownLowMemory': 16},
        'ordinaryInputAbortsInflightChunk': False, 'preparedProgressSeed': True,
        'releaseFallback': 'first successful foreground briefing or playing frame',
        'actualPackageColdProof': json.loads((ROOT / 'qa-rc47-first-load.json').read_text()),
    },
    'native': {
        'engine': 'vice-city-wasm', 'runtimeBinaryChanged': False,
        'missionSize': config['size'], 'missionSHA256': config['sha256'],
        'arrival': config['arrival'], 'drive': config['drive'], 'street': config['street'],
        'C2TimeLimitSeconds': config['scenes'][1]['timeLimitSeconds'],
        'C2Route': config['scenes'][1]['route'], 'C3Spawn': config['scenes'][2]['spawn'],
        'scoreRecordABIChanged': False, 'originalSlotsPreserved': [0, 192],
        'appendedCameoSlots': {'cameoSeen': 190, 'cameoVisibleSince': 191, 'record2_cameoSeen': 192},
        'arrivalExposureSlots': {'pudgeSeen': 197, 'steveSeen': 199, 'record1PudgeSeen': 202, 'record1SteveSeen': 203},
        'pudgeModelId': 8, 'blockPedModelId': 107, 'whiteTopExtraModelId': 108, 'dancerModelId': 109,
        'arrivalAddedDownloadBytes': provenance['arrival-cast']['additionalDownloadBytes'],
        'originalCJModel': False, 'dancerOriginalBundledModel': True,
        'pickupPlacement': '3m current-player-forward at mission release',
        'drivingInput': 'separate steering/gas/ordinary brake; bounded keyboard pulses; hold-to-exit',
        'blockPedAdditionalBytes': 32768,
        'pudgeShoulderFit': provenance['pudge-model']['shoulderFit'],
        'pudgeCPUPoseCount': len(provenance['pudge-model']['animationValidation']['samples']),
        'modelProvenance': ['native-vc/runtime/pudge-model-provenance.json', 'native-vc/runtime/block-ped-provenance.json', 'native-vc/runtime/arrival-cast-provenance.json'],
    },
    'observation': {
        'id': 'arrival-guests-v2', 'afterScene': 1, 'unscored': True, 'legacyObservationPreserved': True,
        'requiresBothArrivalGuestsSeen': True, 'nativeGamePaused': True,
        'selectTwoAndConfirmOrSkip': True, 'disclosure': 'final exam review or standalone C3 completion',
    },
    'visual': {
        'cover': 'assets/brand-cover-rc45.png', 'coverSHA256': digest(cover),
        'originalCoverPreserved': True, 'coverDimensions': [1086, 1448],
        'sameLogoInResult': True, 'newStyleSheets': ['rc47-polish.css', 'native-vc/rc47-native.css'],
        'notifications': '6px below mission plaque, one notice at a time',
        'checkedPhoneWidths': [320, 390, 430],
    },
    'standaloneRoute': 'rpg/',
    'validation': {
        'automatedTestsPassed': int(passed.group(1)), 'automatedTestsFailed': 0,
        'physicalRuntimeFilesVerified': integrity['physicalFiles'],
        'assembledResourcesVerified': integrity['assembledResources'],
        'browser': browser, 'nativeGPUVerified': False, 'nativeMobileTelegramVerified': False,
        'macFinderTested': False, 'windowsLauncherTested': False, 'liveDeploymentUpdated': False,
    },
    'changedFiles': changed, 'newFiles': added,
    'fileSHA256': {p: digest(DIST / p) for p in changed + added},
}
(DIST / 'BUILD-RC4.7.json').write_text(json.dumps(build, ensure_ascii=False, indent=2) + '\n')

files = [p for p in sorted(DIST.rglob('*')) if included(p)]
with zipfile.ZipFile(ARCHIVE, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        archive.write(path, path.relative_to(DIST).as_posix())
with zipfile.ZipFile(ARCHIVE) as archive:
    assert archive.testzip() is None, 'ZIP CRC failure'
    names = set(archive.namelist())
    required = (
        'index.html', 'app.js', 'native-vc/range.scm', 'native-vc/runtime/manifest.json',
        'rpg/index.html', 'START-MAC.command', 'START-WINDOWS.cmd', 'START-LINUX.sh',
        'README-RC4.7.md', 'BUILD-RC4.7.json', 'final-brand.js', 'assets/brand-cover-rc45.png',
        'rc45-cover.css', 'rc45-exam.css', 'native-vc/rc45-native.css',
        'native-vc/rc46-scene.css', 'native-vc/block-ped-model.js',
        'rc47-polish.css', 'native-vc/rc47-native.css', 'native-vc/drive-input.js',
        'native-vc/arrival-cast-models.js', 'native-vc/runtime/arrival-cast-provenance.json',
        'native-vc/runtime/remote/models/gta3.img/egecj.dff',
        'native-vc/runtime/remote/models/gta3.img/egecj.txd',
        'native-vc/runtime/remote/models/gta3.img/egesteve.dff',
        'native-vc/runtime/remote/models/gta3.img/egesteve.txd',
        'release-notes/rc4.7/TESTING.md',
    )
    for name in required:
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
(ROOT / 'qa-rc47-package.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(output, ensure_ascii=False, indent=2))
