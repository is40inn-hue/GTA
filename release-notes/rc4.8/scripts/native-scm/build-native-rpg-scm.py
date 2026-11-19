#!/usr/bin/env python3
"""Build a minimal Vice City main.scm without running a compiler or the engine.
Only standard VC opcodes from Sanny Builder's primary vc.json are emitted.
This is a standalone native-engine test; it contains no exam score calculation.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import struct
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
OPCODES = {c['id']: c for e in json.loads((HERE / 'vc-opcodes.json').read_text())['extensions']
           if e['name'] == 'default' for c in e['commands']}
GLOBAL_SIZE = 34336  # same allocation size as the working native package
MODEL_SEGMENT_SIZE = 36  # dummy model + no named model references
INFO_SEGMENT_SIZE = 20  # no mission scripts
CODE_START = GLOBAL_SIZE + MODEL_SEGMENT_SIZE + INFO_SEGMENT_SIZE
BASE = 30000
FIELDS = {
    'magic0': (0, 'int32'), 'magic1': (4, 'int32'), 'version': (8, 'int32'),
    'phase': (12, 'int32'), 'player': (16, 'int32'), 'ped': (20, 'int32'),
    'target': (24, 'int32'), 'ammo': (28, 'int32'), 'targetHealth': (32, 'int32'),
    'targetDead': (36, 'int32'), 'playerHealth': (40, 'int32'), 'heartbeat': (44, 'int32'),
    'weapon': (48, 'int32'), 'reserved': (52, 'int32'),
    'playerX': (56, 'float32'), 'playerY': (60, 'float32'), 'playerZ': (64, 'float32'),
    'targetX': (68, 'float32'), 'targetY': (72, 'float32'), 'targetZ': (76, 'float32'),
    'playerFrozen': (80, 'int32'), 'nativeTimer': (84, 'int32'),
    'emptyDeadline': (88, 'int32'),
}

@dataclass(frozen=True)
class Arg:
    kind: str
    value: object

def I(v): return Arg('int', int(v))
def F(v): return Arg('float', float(v))
def G(name): return Arg('global', BASE + FIELDS[name][0])
def L(name): return Arg('label', name)
def S(value):
    assert len(value.encode('ascii')) <= 8
    return Arg('string', value)

class Program:
    def __init__(self): self.items = []
    def label(self, name): self.items.append(('label', name))
    def emit(self, opcode, *args):
        opcode = opcode.upper()
        command = OPCODES[opcode]
        assert not command.get('attrs', {}).get('is_unsupported'), command
        assert command['num_params'] == len(args), (command['name'], args)
        self.items.append(('op', opcode, args))
    def set(self, name, value): self.emit('0004', G(name), I(value))
    def branch_false(self, condition, *args, target):
        self.emit('00D6', I(0))
        self.emit(condition, *args)
        self.emit('004D', L(target))
    def go(self, target): self.emit('0002', L(target))
    def build(self):
        def size(a): return 3 if a.kind == 'global' else 8 if a.kind == 'string' else 5
        labels = {}; offset = CODE_START
        for item in self.items:
            if item[0] == 'label':
                assert item[1] not in labels
                labels[item[1]] = offset
            else: offset += 2 + sum(size(a) for a in item[2])
        code = bytearray(); listing = []; boundaries = set(); branches = []
        for item in self.items:
            if item[0] == 'label':
                listing.append(f'\n:{item[1]}')
                continue
            _, opcode, args = item
            at = CODE_START + len(code); boundaries.add(at)
            code += struct.pack('<H', int(opcode, 16))
            rendered = []
            for a in args:
                if a.kind == 'int': code += b'\x01' + struct.pack('<i', a.value); rendered.append(str(a.value))
                elif a.kind == 'float': code += b'\x06' + struct.pack('<f', a.value); rendered.append(str(a.value))
                elif a.kind == 'global':
                    assert 8 <= a.value < GLOBAL_SIZE - 3 and a.value % 4 == 0
                    code += b'\x02' + struct.pack('<H', a.value)
                    rendered.append('$' + next(k for k,v in FIELDS.items() if BASE + v[0] == a.value))
                elif a.kind == 'string':
                    code += a.value.encode('ascii').ljust(8,b'\0'); rendered.append(repr(a.value))
                elif a.kind == 'label':
                    value = labels[a.value]; branches.append(value)
                    code += b'\x01' + struct.pack('<i', value); rendered.append('@' + a.value)
                else: raise AssertionError(a)
            listing.append(f'{at:06d} {opcode}: {OPCODES[opcode]["name"]} ' + ' '.join(rendered))
        assert all(x in boundaries for x in branches)
        return bytes(code), '\n'.join(listing) + '\n', labels, len(boundaries)


def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('--no-freeze-player', action='store_true', help='Diagnostic variant retaining normal position physics')
    cli.add_argument('--output-prefix', default='native-rpg-main')
    args=cli.parse_args()
    p=Program()
    for name,value in [('magic0',0x52454745),('magic1',0x31304356),('version',1),('phase',0),
                       ('ammo',0),('targetHealth',0),('targetDead',0),('playerHealth',0),
                       ('heartbeat',0),('weapon',0),('reserved',0),('playerFrozen',0),('emptyDeadline',0)]: p.set(name,value)
    p.emit('016A',I(0),I(0))
    p.emit('00C0',I(17),I(15))
    p.emit('01B6',I(0))
    p.emit('04BB',I(0))
    p.emit('04E4',F(500),F(-1020))
    p.emit('0053',I(0),F(500),F(-1020),F(14),G('player'))
    p.emit('01F5',G('player'),G('ped'))
    p.emit('0352',G('ped'),S('player2'))
    for model in [141,287,273]: p.emit('0247',I(model))
    p.emit('038B')
    p.emit('0353',G('ped'))
    for model in [141,287,273]: p.branch_false('0248',I(model),target='model_failure')
    p.emit('01F0',I(0))
    p.emit('0581',I(0))
    p.emit('01EB',F(0))
    p.emit('03DE',F(0))
    p.emit('0222',G('player'),I(100))
    p.emit('02AB',G('ped'),I(1),I(1),I(1),I(1),I(1))
    p.emit('03CB',F(500),F(-1020),F(14))
    p.emit('0395',F(500),F(-1005),F(13),F(38),I(1))
    p.emit('00A5',I(141),F(500),F(-995),F(13),G('target'))
    p.emit('0175',G('target'),F(90))
    p.emit('0229',G('target'),I(3),I(3))
    p.emit('0224',G('target'),I(1000))
    p.emit('03F5',G('target'),I(1))
    p.emit('03B8',G('player'))
    p.emit('01B1',G('player'),I(30),I(3))
    p.emit('01B8',G('player'),I(30))
    p.emit('0171',G('player'),F(0))
    p.emit('01B4',G('player'),I(1))
    p.emit('02EB')
    p.emit('032A',I(2))
    p.emit('0373')
    # Let the native body settle on the verified plaza collision floor before freezing position.
    p.emit('0001',I(1400))
    if not args.no_freeze_player:
        p.emit('04D7',G('ped'),I(1)); p.set('playerFrozen',1)
    p.emit('0373')
    p.set('phase',1)
    p.emit('016A',I(500),I(1))
    p.label('native_loop')
    p.emit('0001',I(0))
    p.emit('0008',G('heartbeat'),I(1))
    p.emit('01BD',G('nativeTimer'))
    p.emit('0419',G('player'),I(30),G('ammo'))
    p.emit('0225',G('player'),G('playerHealth'))
    p.emit('046F',G('player'),G('weapon'))
    p.emit('0054',G('player'),G('playerX'),G('playerY'),G('playerZ'))
    # The target remains a mission vehicle. Never delete, respawn or fake its health.
    p.emit('0227',G('target'),G('targetHealth'))
    p.emit('00AA',G('target'),G('targetX'),G('targetY'),G('targetZ'))
    p.branch_false('0119',G('target'),target='target_alive')
    p.set('targetDead',1); p.set('phase',2); p.go('native_loop')
    p.label('target_alive')
    p.branch_false('0038',G('ammo'),I(0),target='native_loop')
    p.branch_false('0038',G('emptyDeadline'),I(0),target='check_empty_deadline')
    p.emit('0084',G('emptyDeadline'),G('nativeTimer'))
    p.emit('0008',G('emptyDeadline'),I(6000))
    p.label('check_empty_deadline')
    p.branch_false('001C',G('nativeTimer'),G('emptyDeadline'),target='native_loop')
    p.set('phase',3); p.go('native_loop')
    p.label('model_failure')
    p.set('phase',-1)
    p.label('failure_loop')
    p.emit('0001',I(100));p.emit('0008',G('heartbeat'),I(1));p.go('failure_loop')

    code, listing, labels, count=p.build()
    total=CODE_START+len(code)
    def skip(target):return struct.pack('<HBi',2,1,target)
    header=bytearray(skip(GLOBAL_SIZE)+b'm')
    header.extend(b'\0'*(GLOBAL_SIZE-len(header)))
    header+=skip(GLOBAL_SIZE+MODEL_SEGMENT_SIZE)+b'\0'+struct.pack('<I',1)+b'\0'*24
    header+=skip(CODE_START)+b'\0'+struct.pack('<IIHH',total,0,0,0)
    assert len(header)==CODE_START
    result=bytes(header)+code
    # Verify the actual generated header, not only our length calculations.
    assert result[7]==ord('m')
    assert struct.unpack_from('<i',result,3)[0]==GLOBAL_SIZE
    assert struct.unpack_from('<i',result,GLOBAL_SIZE+3)[0]==GLOBAL_SIZE+36
    assert struct.unpack_from('<I',result,GLOBAL_SIZE+8)[0]==1
    assert struct.unpack_from('<i',result,GLOBAL_SIZE+36+3)[0]==CODE_START
    assert struct.unpack_from('<IIHH',result,GLOBAL_SIZE+36+8)==(len(result),0,0,0)
    out=HERE/args.output_prefix
    out.with_suffix('.scm').write_bytes(result)
    out.with_suffix('.listing.txt').write_text(listing)
    contract={
        'purpose':'Standalone native Vice City engine proof; target is Infernus, not helicopter; no exam score',
        'version':1,'globalByteOffset':BASE,'magicWords':[0x52454745,0x31304356],
        'magicASCII':['EGER','VC01'],'littleEndian':True,
        'fields':{k:{'offset':v[0],'type':v[1]} for k,v in FIELDS.items()},
        'phases':{'-1':'Requested native model missing','0':'Native scene loading/settling','1':'Playing',
                  '2':'Native IS_CAR_DEAD true','3':'Native RPG ammo0 for6s, target not yet wrecked'},
        'phaseNote':'Native destruction takes precedence: a burning target can later change3 to2. These are native observations, not exam scoring.',
        'player':{'spawn':[500,-1020,14],'heading':0,'freezeAfterSettle':not args.no_freeze_player},
        'target':{'model':141,'name':'Infernus','spawn':[500,-995,13],'heading':90,'initialHealth':1000},
        'weapon':{'type':30,'model':287,'projectileModel':273,'initialAmmo':3},
        'reserved':'offset52 stays0; not a fabricated hit count',
        'input':'Native right-mouse aim and left-mouse fire; drag sends native mouse movement. No movement keys.',
        'validation':{'runtimeExecuted':False,'opcodeDataset':'https://raw.githubusercontent.com/sannybuilder/library/master/vc/vc.json',
                      'instructionCount':count,'mainSize':len(result),'codeStart':CODE_START,
                      'sha256':hashlib.sha256(result).hexdigest(),'labels':labels}
    }
    out.with_suffix('.contract.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'file':str(out.with_suffix('.scm')),'size':len(result),'instructions':count,'sha256':contract['validation']['sha256'],'runtimeExecuted':False}))

if __name__=='__main__':main()
