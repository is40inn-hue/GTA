#!/usr/bin/env python3
"""Validate and package RC4.9 from the reviewed RC4.8 baseline; never deploy.

Only main() writes anything. Required review/browser records must exist first.
Historical release notes are preserved; private QA fixtures and downloaded
reference source are never included in the new release or copied test sources.
"""
import hashlib
import json
import re
import shutil
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
BASELINE = ROOT.parent / 'gta-ege-rc4.8-20261118-dist.zip'
BASELINE_SHA = 'c00dc298868ac481e0cc2dfc3a0cb1922d92c2e3c5d2c566779169aeb0616c5a'
ARCHIVE = ROOT.parent / 'gta-ege-rc4.9-20261118-dist.zip'
NOTES = DIST / 'release-notes/rc4.9'
COVER = 'assets/brand-cover-rc45.png'
COVER_SHA = 'd8d7f1c240b3c9e3cdaa2735d99a164ff4dde5e10cab62d9978d3556e4209b0f'
SCM_SHA = '67c4c72db55bc3831eaf676c64e161ab5b63bdf649aec9e37b0ee5ca9320bfda'
EXCLUDE = {'__qa', '__pycache__', 'test-output', 'qa-artwork', 'qa-story-preview', 'rc49-source'}
RUNTIME_CHANGED = {
    'native-vc/runtime/manifest.json',
    'native-vc/runtime/pudge-model-provenance.json',
    'native-vc/runtime/remote/models/gta3.img/egepudge.dff',
}
RUNTIME_ADDED = {
    'native-vc/runtime/remote/models/gta3.img/pcj600.dff',
    'native-vc/runtime/remote/models/gta3.img/pcj600.txd',
    'native-vc/runtime/remote/models/gta3.img/polmav.dff',
    'native-vc/runtime/remote/models/gta3.img/polmav.txd',
    'native-vc/runtime/scene-vehicles-provenance.json',
}
REVIEW_FILES = (
    ('RC4_9_REVIEW.md', 'SCENE-AND-UX.md'),
    ('RC4_9_STORY.md', 'STORY.md'),
    ('RC4_9_NATIVE.md', 'NATIVE-SCENARIO.md'),
    ('RC4_9_PUDGE.md', 'PUDGE.md'),
    ('qa-rc49-full.txt', 'automated-tests.txt'),
    ('qa-rc49-baseline.json', 'baseline-integrity.json'),
    ('qa-rc49-first-load.json', 'first-load-validation.json'),
    ('qa-rc49-first-load.txt', 'first-load-log.txt'),
    ('qa-rc49-browser.json', 'browser-validation.json'),
    ('qa-rc49-native.txt', 'native-contract-tests.txt'),
    ('qa-rc49-vm-targeted.txt', 'vm-integration-tests.txt'),
    ('rc49-hud-layout.jpg', 'hud-layout-fixture.jpg'),
    ('rc49-loading-layout.jpg', 'loading-layout-fixture.jpg'),
)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text())


def included(path):
    return path.is_file() and not any(part in EXCLUDE for part in path.parts) and path.suffix != '.pyc'


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


def validate_entries():
    entries = ('index.html', 'rpg.html', 'rpg/index.html', 'native-vc/index.html')
    for name in entries:
        page = DIST / name
        parser = EntryReferences()
        parser.feed(page.read_text())
        base = (page.parent / parser.base).resolve() if parser.base else page.parent
        for reference in parser.references:
            parsed = urlsplit(reference)
            if parsed.scheme or parsed.netloc or reference.startswith('#') or not parsed.path:
                continue
            target = (base / unquote(parsed.path)).resolve()
            require(target.is_relative_to(DIST.resolve()) and target.exists(),
                    f'Missing or outside entry reference: {name}: {reference}')
    return list(entries)


def main():
    require(digest(BASELINE) == BASELINE_SHA, 'RC4.8 baseline ZIP does not match the delivered release.')
    for source, _ in REVIEW_FILES:
        require((ROOT / source).is_file(), f'Finish the reviewed record before packaging: {source}')
    require((DIST / 'README-RC4.9.md').is_file(), 'Write README-RC4.9.md before packaging.')
    report = (ROOT / 'qa-rc49-full.txt').read_text()
    passed = re.search(r'(?:ℹ |# )pass (\d+)', report)
    failed = re.search(r'(?:ℹ |# )fail (\d+)', report)
    require(passed and failed and int(passed.group(1)) == 389 and int(failed.group(1)) == 0,
            'The complete RC4.9 suite must contain 389 passing tests and no failures.')
    baseline_record = load(ROOT / 'qa-rc49-baseline.json')
    first_load = load(ROOT / 'qa-rc49-first-load.json')
    browser = load(ROOT / 'qa-rc49-browser.json')
    require(baseline_record['baselineSHA256'] == BASELINE_SHA, 'Integrity report uses another baseline.')
    require(len(baseline_record['unchanged']) == 11, 'Expected eleven reviewed immutable files.')
    require(set(baseline_record['nativeRuntimeChanged']) == RUNTIME_CHANGED, 'Unexpected runtime changes in review.')
    require(set(baseline_record['nativeRuntimeAdded']) == RUNTIME_ADDED, 'Unexpected added runtime files in review.')
    entries = validate_entries()
    require(digest(DIST / COVER) == COVER_SHA, 'The approved cover must remain byte-identical.')
    config = load(DIST / 'native-vc/range-config.json')
    scm = DIST / 'native-vc/range.scm'
    require(digest(scm) == config['sha256'] == SCM_SHA, 'Current SCM does not match the reviewed compiled mission.')
    require(scm.stat().st_size == config['size'], 'SCM/config size mismatch.')
    require(config['escape']['scored'] is False and config['escape']['warpAllowed'] is False,
            'The new story beat must remain unscored native boarding/driving.')

    with zipfile.ZipFile(BASELINE) as previous:
        for name, sha in baseline_record['unchanged'].items():
            require(digest(DIST / name) == sha and (DIST / name).read_bytes() == previous.read(name),
                    f'An immutable preload/result/engine file changed: {name}')
        old_config = json.loads(previous.read('native-vc/range-config.json'))
        for name, slot in old_config['slots'].items():
            require(config['slots'][name] == slot, f'Historical native ABI changed: {name}')
        old_runtime = {name for name in previous.namelist() if name.startswith('native-vc/runtime/') and not name.endswith('/')}
        current_runtime = {path.relative_to(DIST).as_posix() for path in (DIST / 'native-vc/runtime').rglob('*') if included(path)}
        require(old_runtime <= current_runtime, 'A historical runtime file was removed.')
        actual_added = current_runtime - old_runtime
        actual_changed = {name for name in old_runtime if (DIST / name).read_bytes() != previous.read(name)}
        require(actual_added == RUNTIME_ADDED, f'Unreviewed runtime additions: {sorted(actual_added ^ RUNTIME_ADDED)}')
        require(actual_changed == RUNTIME_CHANGED, f'Unreviewed runtime changes: {sorted(actual_changed ^ RUNTIME_CHANGED)}')

    manifest = load(DIST / 'native-vc/runtime/manifest.json')
    district = load(DIST / 'native-vc/runtime/vice-district/manifest.json')
    require(manifest['models']['count'] == len(manifest['models']['files']) == 100, 'Expected the reviewed 100 model files.')
    for entry in manifest['models']['files']:
        asset = DIST / 'native-vc/runtime' / entry['path']
        require(asset.stat().st_size == entry['size'] and digest(asset) == entry['sha256'], f'Model integrity mismatch: {entry["path"]}')
    total_bytes = manifest['data']['size'] + manifest['engine']['wasm']['size'] + manifest['engine']['js']['size'] + manifest['models']['size'] + district['size']
    require(total_bytes <= 80 * 1024 * 1024, 'Complete native package exceeds the normal-device session reserve.')
    require(first_load['preparedBytes'] == first_load['totalBytes'] == total_bytes, 'Cold-preparation proof describes other package bytes.')
    require(first_load['allLogicalResourcesAssembledAndSHAVerified'] is True and
            first_load['additionalRuntimeDownloadsAtHandoff'] == 0 and first_load['duplicateRequests'] == 0 and
            first_load['sessionBytesAfterRelease'] == 0, 'Cold-preparation proof did not meet the reviewed handoff criteria.')
    require(first_load['nativeGPUExecuted'] is False, 'Local transport proof must not be presented as GPU execution.')

    vehicle_provenance = load(DIST / 'native-vc/runtime/scene-vehicles-provenance.json')
    game_ui = load(DIST / 'assets/game-ui/provenance.json')
    for record, directory, key in ((vehicle_provenance, DIST / 'native-vc/runtime', 'files'), (game_ui, DIST, 'generated')):
        for entry in record[key]:
            path = directory / entry['path']
            require(path.stat().st_size == entry['size'] and digest(path) == entry['sha256'], f'Provenance/asset mismatch: {entry["path"]}')
    require(vehicle_provenance['additionalBytes'] == 282624, 'Unexpected new-vehicle byte budget.')
    require(game_ui['totalWebBytes'] == sum(entry['size'] for entry in game_ui['generated']), 'HUD asset byte budget mismatch.')

    NOTES.mkdir(parents=True, exist_ok=True)
    for directory in ('tests', 'scripts'):
        target = NOTES / directory
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(ROOT / directory, target, ignore=shutil.ignore_patterns(*EXCLUDE, '*.pyc'))
    for source, target in REVIEW_FILES:
        shutil.copy2(ROOT / source, NOTES / target)

    changed, added = [], []
    with zipfile.ZipFile(BASELINE) as previous:
        names = set(previous.namelist())
        # Existing release notes remain as recorded, rather than being rewritten
        # to describe the new release or silently dropped from the archive.
        historical = [name for name in names if name.startswith('release-notes/') and not name.endswith('/')
                      and not set(Path(name).parts) & EXCLUDE and Path(name).suffix != '.pyc']
        for name in historical:
            require((DIST / name).is_file() and (DIST / name).read_bytes() == previous.read(name),
                    f'Historical release note changed or missing: {name}')
        for path in sorted(DIST.rglob('*')):
            if not included(path) or 'release-notes' in path.parts:
                continue
            relative = path.relative_to(DIST).as_posix()
            if relative == 'BUILD-RC4.9.json':
                continue
            if relative not in names:
                added.append(relative)
            elif path.read_bytes() != previous.read(relative):
                changed.append(relative)

    # Fresh metadata: no prior release's GPU/download result is inherited.
    build = {
        'release': 'gta-ege-rc4.9-20261118', 'date': '2026-11-18', 'timezone': 'Asia/Bangkok',
        'basedOn': BASELINE.name, 'baselineSHA256': BASELINE_SHA,
        'score': {'questionCount': 12, 'maximum': 100, 'pass': 60, 'sections': {'A': 24, 'B': 40, 'C': 36},
                  'disclosure': 'after final commission only', 'engineUnchangedFrom': 'RC4.8'},
        'story': {'route': ['Города и герои', 'Архив GTA', 'Выездная проверка'],
                  'practice': ['Встреча', 'Заезд', 'Последний залп'], 'extraStoryPoints': 0},
        'nativeMission': {'size': config['size'], 'sha256': config['sha256'], 'ABI': config['version'],
                          'historicalSlotsPreservedThrough': 203, 'escape': config['escape'],
                          'helicopters': config['helicopters'], 'radar': config['radar']},
        'assets': {'nativeBytes': total_bytes, 'modelFiles': manifest['models']['count'],
                   'newVehicleBytes': vehicle_provenance['additionalBytes'], 'radarAndIconBytes': game_ui['totalWebBytes'],
                   'runtimeChanged': sorted(actual_changed), 'runtimeAdded': sorted(actual_added)},
        'priorityS': {'preloadCodeUnchangedFrom': 'RC4.8', 'beginsAfterPaintedCover': True,
                      'actualPackageColdProof': first_load,
                      'scope': 'Local-file transport, denied persistent storage, accelerated scheduler; not phone/network/GPU latency.'},
        'results': {'rendererUnchangedFrom': 'RC4.8', 'imageSize': [1080, 1920],
                    'sameVisibleAndExportedPNG': True, 'realNativeHighlightOrTypography': True,
                    'directTelegramStoriesRequiresConfiguredHTTPSMediaEndpoint': True},
        'visual': {'cover': COVER, 'coverSHA256': COVER_SHA, 'coverPreserved': True,
                   'styleSheets': ['rc49-unified.css', 'native-vc/rc49-native.css'],
                   'radarUsesValidatedNativeTelemetry': True, 'decorativeAssetsAreOptional': True},
        'validation': {'automatedTestsPassed': int(passed.group(1)), 'automatedTestsFailed': 0,
                       'entryReferencesVerified': entries, 'baseline': baseline_record, 'browser': browser,
                       'nativeGPUVerified': False, 'realMobileTelegramVerified': False,
                       'macFinderTested': False, 'windowsLauncherTested': False, 'liveDeploymentUpdated': False,
                       'scope': 'This release records its own tests and browser report. No earlier GPU or download claim is inherited.'},
        'changedFiles': changed, 'newFiles': added,
        'fileSHA256': {name: digest(DIST / name) for name in changed + added},
    }
    (DIST / 'BUILD-RC4.9.json').write_text(json.dumps(build, ensure_ascii=False, indent=2) + '\n')

    files = [path for path in sorted(DIST.rglob('*')) if included(path)]
    with zipfile.ZipFile(ARCHIVE, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            archive.write(path, path.relative_to(DIST).as_posix())
    with zipfile.ZipFile(ARCHIVE) as archive:
        require(archive.testzip() is None, 'ZIP CRC validation failed.')
        names = set(archive.namelist())
        for name in ('index.html', 'app.js', 'story-card.js', 'image-content-bounds.js',
                     'rpg.html', 'rpg/index.html', 'native-vc/index.html', 'native-vc/range.scm',
                     'native-vc/scene-vehicles.js', 'native-vc/hud-radar.js',
                     'rc49-unified.css', 'native-vc/rc49-native.css', 'assets/game-ui/vice-radar.webp',
                     'README-RC4.9.md', 'BUILD-RC4.9.json', 'START-HERE.txt', 'START-MAC.command',
                     'START-WINDOWS.cmd', 'START-LINUX.sh', 'release-notes/rc4.9/SCENE-AND-UX.md'):
            require(name in names, f'Missing release entry: {name}')
        require(not any(set(Path(name).parts) & EXCLUDE or name.endswith('.pyc') for name in names), 'Private QA/reference files leaked into ZIP.')
        for name in ('START-MAC.command', 'START-LINUX.sh'):
            require(((archive.getinfo(name).external_attr >> 16) & 0o777) == 0o755, f'Launcher must retain mode 755: {name}')
        windows = archive.read('START-WINDOWS.cmd')
        require(b'\r\n' in windows and b'\n' not in windows.replace(b'\r\n', b''), 'Windows launcher must use CRLF.')
        require(all(name in names for name in historical), 'Historical release notes missing from ZIP.')

    receipt = {'archive': str(ARCHIVE), 'bytes': ARCHIVE.stat().st_size,
               'MiB': round(ARCHIVE.stat().st_size / 1024 / 1024, 2), 'files': len(files),
               'sha256': digest(ARCHIVE), 'flatRoot': True, 'crcVerified': True,
               'launcherMode755Verified': True, 'windowsCRLFVerified': True,
               'changedFiles': changed, 'newFiles': added}
    (ROOT / 'qa-rc49-package.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
