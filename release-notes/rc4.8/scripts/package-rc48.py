#!/usr/bin/env python3
"""Package the reviewed RC4.8 site, preserving the RC4.7 runtime and provenance."""
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
BASELINE = ROOT.parent / 'rc48-recovered/gta-ege-rc4.7-20261117-dist.zip'
ARCHIVE = ROOT.parent / 'gta-ege-rc4.8-20261118-dist.zip'
NOTES = DIST / 'release-notes/rc4.8'
EXCLUDE = {'__qa', '__pycache__', 'test-output', 'qa-artwork', 'qa-story-preview'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def included(path):
    return path.is_file() and not any(part in EXCLUDE for part in path.parts) and path.suffix != '.pyc'


assert digest(BASELINE) == '17ee805f56d45777824f1bc97926728946361a1cab94bab278264cc5a47d8e19'
report = (ROOT / 'qa-rc48-full.txt').read_text()
passed = re.search(r'(?:ℹ |# )pass (\d+)', report)
failed = re.search(r'(?:ℹ |# )fail (\d+)', report)
assert passed and failed and int(failed.group(1)) == 0
assert int(passed.group(1)) == 376
baseline_record = json.loads((ROOT / 'qa-rc48-baseline.json').read_text())
browser = json.loads((ROOT / 'qa-rc48-browser.json').read_text())
download = json.loads((ROOT / 'qa-rc48-download.json').read_text())
assert download['downloadEventConfirmed'] and download['dimensions'] == [1080, 1920]


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


for name in ('index.html', 'rpg.html', 'rpg/index.html', 'native-vc/index.html'):
    page = DIST / name
    parser = EntryReferences()
    parser.feed(page.read_text())
    base = (page.parent / parser.base).resolve() if parser.base else page.parent
    for reference in parser.references:
        parsed = urlsplit(reference)
        if parsed.scheme or parsed.netloc or reference.startswith('#') or not parsed.path:
            continue
        target = (base / unquote(parsed.path)).resolve()
        assert target.is_relative_to(DIST.resolve()) and target.exists(), (name, reference)

cover = DIST / 'assets/brand-cover-rc45.png'
assert digest(cover) == 'd8d7f1c240b3c9e3cdaa2735d99a164ff4dde5e10cab62d9978d3556e4209b0f'
with zipfile.ZipFile(BASELINE) as previous:
    for name, sha in baseline_record['unchanged'].items():
        assert digest(DIST / name) == sha
        assert (DIST / name).read_bytes() == previous.read(name)
    runtime_files = [name for name in previous.namelist() if name.startswith('native-vc/runtime/') and not name.endswith('/')]
    for name in runtime_files:
        assert (DIST / name).read_bytes() == previous.read(name), name
    assert len(runtime_files) == baseline_record['nativeRuntimeFilesUnchanged']

NOTES.mkdir(parents=True, exist_ok=True)
for directory in ('tests', 'scripts'):
    target = NOTES / directory
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(ROOT / directory, target, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
for source, target in (
    ('RC4_8_REVIEW.md', 'SCENE-AND-UX.md'),
    ('RC4_8_STYLE.md', 'STYLE.md'),
    ('RC4_8_STORY.md', 'STORY-CARD.md'),
    ('RC4_8_CAPTURE.md', 'CAPTURE-AND-PRELOAD.md'),
    ('qa-rc48-full.txt', 'automated-tests.txt'),
    ('qa-rc48-baseline.json', 'baseline-integrity.json'),
    ('qa-rc48-browser.json', 'browser-validation.json'),
    ('qa-rc48-download.json', 'download-validation.json'),
):
    shutil.copy2(ROOT / source, NOTES / target)

changed, added = [], []
with zipfile.ZipFile(BASELINE) as previous:
    names = set(previous.namelist())
    for path in sorted(DIST.rglob('*')):
        if not included(path) or 'release-notes' in path.parts:
            continue
        relative = path.relative_to(DIST).as_posix()
        if relative == 'BUILD-RC4.8.json':
            continue
        if relative not in names:
            added.append(relative)
        elif path.read_bytes() != previous.read(relative):
            changed.append(relative)
    build = json.loads(previous.read('BUILD-RC4.7.json'))

build.update({
    'release': 'gta-ege-rc4.8-20261118', 'date': '2026-11-18', 'timezone': 'Asia/Bangkok',
    'basedOn': BASELINE.name,
    'results': {
        'disclosure': 'after final commission only', 'sameVisibleAndExportedPNG': True,
        'size': [1080, 1920], 'singleGameplayImage': True, 'conservativeBlackPaddingTrim': True,
        'personalizedLine': True, 'nativeBrowserDownloadLink': True,
        'directTelegramStoriesRequiresConfiguredHTTPSMediaEndpoint': True,
    },
    'visual': {
        'cover': 'assets/brand-cover-rc45.png', 'coverSHA256': digest(cover),
        'originalCoverPreserved': True, 'sameLogoInResult': True,
        'newStyleSheets': ['rc48-unified.css', 'native-vc/rc48-native.css'],
        'touchPrimaryPx': 56, 'touchAnswerPx': [58, 60], 'touchSecondaryPx': 50,
        'notifications': '6px below mission plaque, one notice at a time',
        'checkedPhoneWidths': [320, 390, 430], 'nativeLayoutMockOnly': True,
    },
    'validation': {
        'automatedTestsPassed': int(passed.group(1)), 'automatedTestsFailed': 0,
        'baseline': baseline_record, 'browser': browser, 'download': download,
        'nativeGPUVerified': False, 'nativeMobileTelegramVerified': False,
        'macFinderTested': False, 'windowsLauncherTested': False,
        'liveDeploymentUpdated': False,
    },
    'changedFiles': changed, 'newFiles': added,
    'fileSHA256': {name: digest(DIST / name) for name in changed + added},
})
build['priorityS']['coldProofInheritedFrom'] = 'RC4.7; preload code and all runtime package files verified byte-identical'
(DIST / 'BUILD-RC4.8.json').write_text(json.dumps(build, ensure_ascii=False, indent=2) + '\n')

files = [path for path in sorted(DIST.rglob('*')) if included(path)]
with zipfile.ZipFile(ARCHIVE, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        archive.write(path, path.relative_to(DIST).as_posix())
with zipfile.ZipFile(ARCHIVE) as archive:
    assert archive.testzip() is None
    names = set(archive.namelist())
    for name in ('index.html', 'app.js', 'image-content-bounds.js', 'story-card.js',
                 'rpg/index.html', 'native-vc/index.html', 'native-vc/highlight-capture.js',
                 'rc48-unified.css', 'native-vc/rc48-native.css', 'README-RC4.8.md', 'BUILD-RC4.8.json',
                 'START-MAC.command', 'START-WINDOWS.cmd', 'START-LINUX.sh',
                 'release-notes/rc4.8/SCENE-AND-UX.md'):
        assert name in names, name
    assert not any('__qa/' in name or '__pycache__/' in name for name in names)
    for name in ('START-MAC.command', 'START-LINUX.sh'):
        assert ((archive.getinfo(name).external_attr >> 16) & 0o111) == 0o111
    windows = archive.read('START-WINDOWS.cmd')
    assert b'\r\n' in windows and b'\n' not in windows.replace(b'\r\n', b'')

receipt = {'archive': str(ARCHIVE), 'bytes': ARCHIVE.stat().st_size,
           'MiB': round(ARCHIVE.stat().st_size / 1024 / 1024, 2), 'files': len(files),
           'sha256': digest(ARCHIVE), 'flatRoot': True, 'crcVerified': True,
           'launcherExecuteBitsVerified': True, 'windowsCRLFVerified': True,
           'changedFiles': changed, 'newFiles': added}
(ROOT / 'qa-rc48-package.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(receipt, ensure_ascii=False, indent=2))
