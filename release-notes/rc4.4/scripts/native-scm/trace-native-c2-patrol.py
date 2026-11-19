#!/usr/bin/env python3
"""Trace C2 siren lifecycle in emitted SCM bytes. No WASM or graphics are executed."""
import contextlib
import hashlib
import io
import json
import pathlib
import runpy
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SCM = HERE / 'native-exam-main.scm'
contract = json.loads((HERE / 'native-exam-main.contract.json').read_text())
config = json.loads((ROOT / 'dist/native-vc/range-config.json').read_text())
assert SCM.read_bytes() == (ROOT / 'dist/native-vc/range.scm').read_bytes()
assert hashlib.sha256(SCM.read_bytes()).hexdigest() == config['sha256'] == contract['sha256']
assert config['version'] == 2
assert [(s['scene'], s['targetModel'], s['ammo'], s['pointsPerTarget'] * s['targetCount'])
        for s in config['scenes']] == [(1, 130, 6, 10), (2, 156, 15, 12), (3, 217, 3, 14)]

sys.argv = ['review-custom-scm.py', str(SCM)]
with contextlib.redirect_stdout(io.StringIO()):
    review = runpy.run_path(str(HERE / 'review-custom-scm.py'))
rows = review['rows']
instructions = {row[0]: row for row in rows}
following = {row[0]: rows[i + 1][0] if i + 1 < len(rows) else None for i, row in enumerate(rows)}
fields = {name: 'G' + str(contract['globalByteOffset'] + entry['offset'])
          for name, entry in contract['fields'].items()}
labels = contract['validation']['labels']


def trace(label, scene, phase, outcome=0):
    """Supply native handles, then evaluate only SCM control flow and mailbox writes."""
    mem = {fields[name]: value for name, value in {
        'scene': scene, 'requestedScene': scene, 'phase': phase, 'command': 2,
        'nativeTimer': 12000, 'player': 0, 'target0_handle': 101,
        'target1_handle': 102, 'target2_handle': 103, 'outcome': outcome,
    }.items()}
    calls, pc, condition = [], labels[label], False
    def val(value): return mem.get(value, 0) if isinstance(value, str) and value.startswith('G') else value
    for _ in range(500):
        if pc in (labels['gameplay'], labels['native_loop'], labels['no_command']):
            return mem, calls, pc
        _, _, name, args = instructions[pc]
        pc = following[pc]
        values = list(map(val, args))
        if name == 'IF': pass
        elif name in ('SET_VAR_INT', 'SET_VAR_INT_TO_VAR_INT'): mem[args[0]] = values[1]
        elif name == 'ADD_VAL_TO_INT_VAR': mem[args[0]] = values[0] + values[1]
        elif name in ('IS_INT_VAR_EQUAL_TO_NUMBER', 'IS_INT_VAR_EQUAL_TO_INT_VAR'): condition = values[0] == values[1]
        elif name == 'GOTO': pc = values[0]
        elif name == 'GOTO_IF_FALSE':
            if not condition: pc = values[0]
        elif name in ('SET_PLAYER_CONTROL', 'SWITCH_CAR_SIREN', 'FREEZE_CAR_POSITION', 'SET_HELI_STABILISER', 'HELI_GOTO_COORDS'):
            calls.append((name, values))
        else: raise AssertionError(('unexpected command in lifecycle trace', name, args))
    raise AssertionError('lifecycle trace did not terminate')


for scene in (1, 2, 3):
    mem, calls, pc = trace('dispatch_start', scene, 1)
    sirens = [args for name, args in calls if name == 'SWITCH_CAR_SIREN']
    assert sirens == ([[101, 1], [102, 1], [103, 1]] if scene == 2 else []), (scene, sirens)
    assert mem[fields['phase']] == 2 and pc == labels['gameplay']
    if scene == 3:
        assert mem[fields['sceneDeadline']] == 102000, 'C3 keeps its native 90-second limit'
        assert ('HELI_GOTO_COORDS', [101, 510.0, -990.0, 27.0, 2]) in calls
    # A duplicate start while already playing must not restart sirens or the clock.
    mem, calls, pc = trace('dispatch_start', scene, 2)
    assert calls == [] and pc == labels['no_command']

for scene in (1, 2, 3):
    for outcome in (1, 2):
        mem, calls, pc = trace('finish_scene', scene, 2, outcome)
        sirens = [args for name, args in calls if name == 'SWITCH_CAR_SIREN']
        assert sirens == ([[101, 0], [102, 0], [103, 0]] if scene == 2 else []), (scene, outcome, sirens)
        assert mem[fields['phase']] == 3 and mem[fields['completed']] == 1
        assert mem[fields[f'record{scene}_outcome']] == outcome
        assert mem[fields[f'record{scene}_completed']] == 1
        assert pc == labels['native_loop']

print(json.dumps({'verified': True, 'scmBytes': config['size'], 'sha256': config['sha256'],
                  'cases': 12, 'c2Model': 156, 'c3Model': 217, 'nativeRuntimeExecuted': False}))
