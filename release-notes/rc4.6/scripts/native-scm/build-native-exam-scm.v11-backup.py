#!/usr/bin/env python3
"""Build a minimal Vice City main.scm without running a compiler or the engine.
Only standard VC opcodes from Sanny Builder's primary vc.json are emitted.
Three native exam scenes share one engine. Target credits are native SCM facts; JS only sends mailbox commands.
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
FIELDS = {}
def field(name, kind='int32', offset=None):
    if offset is None: offset = max((value[0] for value in FIELDS.values()), default=-4) + 4
    FIELDS[name] = (offset, kind)

for name in ['magic0','magic1','version','phase','player','ped','scene','ammo','ammoInitial','weapon',
             'heartbeat','playerHealth','targetCount','outcome','completed','currentWeapon',
             'command','requestedScene','commandSeq','ackSeq','nativeTimer','emptyDeadline','creditedCount']:
    field(name)
for index in range(3):
    for name in ['handle','health','credited','destroyed','baseline']: field(f'target{index}_{name}')
for name in ['playerX','playerY','playerZ']: field(name, 'float32')
field('playerFrozen')
for name in ['heliX','heliY','heliZ']: field(name,'float32')
for name in ['heliRoute','rpgHit','sceneDeadline']: field(name)
RECORD_KEYS = ['scene','outcome','ammoInitial','ammo','weapon','targetCount'] + [
    f'target{index}_{name}' for index in range(3) for name in ['health','credited','destroyed']]
for scene in range(1,4):
    field(f'record{scene}_completed', offset=256+(scene-1)*128)
    for key in RECORD_KEYS: field(f'record{scene}_{key}')
SCENES = [
    {'scene':1,'title':'С1. Пристрелка','weapon':17,'weaponName':'Пистолет','model':274,'ammo':6,'burst':1,
     'targetModel':130,'positions':[(495,-1005,13),(505,-1005,13)],'pointsPerTarget':5,
     'instruction':'Попади по кузову каждой из двух машин. Шесть патронов, по одному за нажатие.',
     'criterion':'Засчитывается повреждение кузова каждой отдельной машины из пистолета.'},
    {'scene':2,'title':'С2. Контроль очереди','weapon':23,'weaponName':'Uzi','model':282,'ammo':15,'burst':3,
     'targetModel':130,'positions':[(490,-995,13),(500,-989,13),(510,-995,13)],'pointsPerTarget':4,
     'instruction':'Попади по кузову каждой из трёх машин. Пятнадцать патронов, короткие очереди.',
     'criterion':'Переводи прицел между целями. Повторные попадания в одну машину не заменяют остальные.'},
    {'scene':3,'title':'С3. Тяжёлый билет','weapon':30,'weaponName':'РПГ','model':287,'ammo':3,'burst':1,
     'targetModel':217,'positions':[(490,-990,27)],'pointsPerTarget':14,
     'instruction':'Сбей пролетающий вертолёт. Три ракеты: цель снова пройдёт перед тобой.',
     'criterion':'Засчитывается только попадание РПГ и уничтожение вертолёта в движке. Максимум 14 баллов.'}
]


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
    cli.add_argument('--install', action='store_true', help='Install the verified SCM and contract in dist/native-vc')
    args=cli.parse_args()
    p=Program()
    def copy(dst,src): p.emit('0084',G(dst),G(src))
    def if_eq(name,value,otherwise): p.branch_false('0038',G(name),I(value),target=otherwise)
    def restore_record(scene):
        for name in RECORD_KEYS: copy(name,f'record{scene}_{name}')
        p.set('completed',1);p.set('phase',3);p.go('native_loop')
    for name,value in [('magic0',0x52454745),('magic1',0x32304356),('version',2),('phase',0)]:p.set(name,value)
    for index in range(3):p.set(f'target{index}_handle',-1)
    p.emit('016A',I(0),I(0));p.emit('00C0',I(17),I(15));p.emit('01B6',I(0));p.emit('04BB',I(0))
    p.emit('04E4',F(500),F(-1020));p.emit('0053',I(0),F(500),F(-1020),F(14),G('player'))
    p.emit('01F5',G('player'),G('ped'));p.emit('0352',G('ped'),S('player2'))
    models=[130,217,274,282,287,273]
    for model in models:p.emit('0247',I(model))
    p.emit('038B');p.emit('0353',G('ped'))
    for model in models:p.branch_false('0248',I(model),target='model_failure')
    p.emit('01F0',I(0));p.emit('0581',I(0));p.emit('01EB',F(0));p.emit('03DE',F(0))
    p.emit('0222',G('player'),I(100));p.emit('02AB',G('ped'),I(1),I(1),I(1),I(1),I(1))
    p.emit('03CB',F(500),F(-1020),F(14));p.emit('0395',F(500),F(-1000),F(13),F(50),I(1))
    p.emit('01B4',G('player'),I(0));p.set('phase',4)

    p.label('native_loop');p.emit('0001',I(0));p.emit('0008',G('heartbeat'),I(1));p.emit('01BD',G('nativeTimer'))
    p.emit('0225',G('player'),G('playerHealth'));p.emit('0054',G('player'),G('playerX'),G('playerY'),G('playerZ'))
    p.branch_false('003A',G('commandSeq'),G('ackSeq'),target='dispatch_command');p.go('no_command')
    p.label('dispatch_command');copy('ackSeq','commandSeq')
    # A running attempt cannot be replaced or restarted through the mailbox.
    if_eq('phase',2,'dispatch_allowed');p.go('gameplay')
    p.label('dispatch_allowed');if_eq('command',1,'dispatch_start')
    for scene in range(1,4):
        if_eq('requestedScene',scene,f'not_prepare_{scene}');p.go(f'prepare_{scene}');p.label(f'not_prepare_{scene}')
    p.go('no_command')
    p.label('dispatch_start');if_eq('command',2,'no_command');if_eq('phase',1,'no_command')
    p.branch_false('003A',G('requestedScene'),G('scene'),target='no_command')
    p.emit('01B4',G('player'),I(1));p.set('phase',2)
    if_eq('scene',3,'start_no_heli')
    p.emit('0519',G('target0_handle'),I(0));p.emit('04DF',G('target0_handle'),I(1))
    p.emit('04A2',G('target0_handle'),F(510),F(-990),F(27),I(2));p.set('heliRoute',1)
    copy('sceneDeadline','nativeTimer');p.emit('0008',G('sceneDeadline'),I(90000))
    p.label('start_no_heli');p.go('gameplay')
    p.label('no_command');if_eq('phase',2,'native_loop')

    p.label('gameplay');p.emit('0419',G('player'),G('weapon'),G('ammo'));p.emit('046F',G('player'),G('currentWeapon'))
    # Native autopilot traverses a short, repeatable corridor; no JS position writes.
    if_eq('scene',3,'after_heli_route')
    p.emit('00AA',G('target0_handle'),G('heliX'),G('heliY'),G('heliZ'))
    p.branch_false('0119',G('target0_handle'),target='heli_alive');p.go('after_heli_route')
    p.label('heli_alive')
    if_eq('heliRoute',1,'heli_return')
    p.branch_false('0020',G('heliX'),F(506),target='after_heli_route')
    p.emit('04A2',G('target0_handle'),F(490),F(-990),F(27),I(2));p.set('heliRoute',2);p.go('after_heli_route')
    p.label('heli_return');p.branch_false('0022',F(494),G('heliX'),target='after_heli_route')
    p.emit('04A2',G('target0_handle'),F(510),F(-990),F(27),I(2));p.set('heliRoute',1)
    p.label('after_heli_route');p.set('creditedCount',0)
    for index in range(3):
        prefix=f'target{index}';next_target=f'after_target_{index}'
        p.branch_false('0018',G('targetCount'),I(index),target=next_target)
        p.emit('0227',G(prefix+'_handle'),G(prefix+'_health'))
        p.branch_false('0119',G(prefix+'_handle'),target=f'target_{index}_alive')
        p.set(prefix+'_destroyed',1)
        p.label(f'target_{index}_alive')
        if_eq('scene',3,f'target_{index}_bullet')
        # C3 is damageable only by the player, only through explosions. VC records
        # rocket blast damage as EXPLOSION rather than weapon 30. Require a
        # consumed native RPG round and native health loss; crashes cannot credit.
        p.branch_false('031E',G(prefix+'_handle'),I(41),target=f'no_rpg_hit_{index}')
        p.branch_false('001C',G('ammoInitial'),G('ammo'),target=f'no_rpg_hit_{index}')
        p.branch_false('001C',G(prefix+'_baseline'),G(prefix+'_health'),target=f'no_rpg_hit_{index}')
        p.set('rpgHit',1)
        p.label(f'no_rpg_hit_{index}');if_eq('rpgHit',1,f'count_target_{index}')
        copy(prefix+'_credited',prefix+'_destroyed');p.go(f'count_target_{index}')
        p.label(f'target_{index}_bullet');if_eq(prefix+'_credited',0,f'count_target_{index}')
        p.branch_false('031E',G(prefix+'_handle'),G('weapon'),target=f'count_target_{index}')
        p.branch_false('001C',G(prefix+'_baseline'),G(prefix+'_health'),target=f'count_target_{index}')
        p.set(prefix+'_credited',1)
        p.label(f'count_target_{index}');if_eq(prefix+'_credited',1,next_target);p.emit('0008',G('creditedCount'),I(1))
        p.label(next_target)
    p.branch_false('003A',G('creditedCount'),G('targetCount'),target='not_all_credited')
    p.set('outcome',1);p.go('finish_scene')
    p.label('not_all_credited')
    if_eq('scene',3,'check_ammo')
    if_eq('target0_destroyed',1,'heli_time_limit');p.set('outcome',4);p.go('finish_scene')
    p.label('heli_time_limit');p.branch_false('001C',G('nativeTimer'),G('sceneDeadline'),target='check_ammo');p.set('outcome',3);p.go('finish_scene')
    p.label('check_ammo');if_eq('ammo',0,'native_loop')
    if_eq('emptyDeadline',0,'check_empty_deadline');copy('emptyDeadline','nativeTimer')
    if_eq('scene',3,'bullet_grace');p.emit('0008',G('emptyDeadline'),I(6000));p.go('check_empty_deadline')
    p.label('bullet_grace');p.emit('0008',G('emptyDeadline'),I(500))
    p.label('check_empty_deadline');p.branch_false('001C',G('nativeTimer'),G('emptyDeadline'),target='native_loop')
    if_eq('scene',3,'finish_ammo')
    # A burning native target may still explode; let the engine resolve it.
    for index in range(1):
        # VC's IS_CAR_ON_FIRE is also true for a zero-health wreck. A credited
        # destroyed target must not hold an incomplete round open forever.
        if_eq(f'target{index}_destroyed',0,f'not_burning_{index}')
        p.branch_false('0495',G(f'target{index}_handle'),target=f'not_burning_{index}');p.go('native_loop');p.label(f'not_burning_{index}')
    p.label('finish_ammo');p.set('outcome',2)
    p.label('finish_scene');p.emit('01B4',G('player'),I(0))
    for scene in range(1,4):
        if_eq('scene',scene,f'not_save_{scene}')
        # Record slots are written only on this scene's first terminal transition.
        for name in RECORD_KEYS:copy(f'record{scene}_{name}',name)
        p.set(f'record{scene}_completed',1);p.go('finish_commit');p.label(f'not_save_{scene}')
    p.label('finish_commit');p.set('completed',1);p.set('phase',3);p.go('native_loop')

    for scene in SCENES:
        number=scene['scene'];p.label(f'prepare_{number}')
        if_eq(f'record{number}_completed',1,f'new_scene_{number}');restore_record(number)
        p.label(f'new_scene_{number}');p.set('phase',0);p.emit('01B4',G('player'),I(0))
        p.set('rpgHit',0);p.set('heliRoute',0);p.set('sceneDeadline',0)
        p.set('scene',number);p.set('completed',0);p.set('outcome',0);p.set('emptyDeadline',0);p.set('creditedCount',0)
        for index in range(3):
            prefix=f'target{index}'
            p.branch_false('0028',G(prefix+'_handle'),I(0),target=f'no_old_car_{number}_{index}')
            p.emit('00A6',G(prefix+'_handle'))
            p.label(f'no_old_car_{number}_{index}');p.set(prefix+'_handle',-1)
            for key in ['health','credited','destroyed','baseline']:p.set(prefix+'_'+key,0)
        p.emit('04D7',G('ped'),I(0));p.set('playerFrozen',0)
        p.emit('00A1',G('ped'),F(500),F(-1020),F(14));p.emit('0173',G('ped'),F(0))
        p.emit('03B8',G('player'));p.set('weapon',scene['weapon']);p.set('ammoInitial',scene['ammo']);p.set('ammo',scene['ammo'])
        p.emit('01B1',G('player'),G('weapon'),G('ammoInitial'));p.emit('01B8',G('player'),G('weapon'))
        p.set('targetCount',len(scene['positions']))
        for index,position in enumerate(scene['positions']):
            target=G(f'target{index}_handle')
            p.emit('00A5',I(scene['targetModel']),*(F(v) for v in position),target)
            p.emit('0175',target,F(90));p.emit('0229',target,I([3,6,1][index]),I([3,6,1][index]))
            p.emit('0224',target,I(450 if number==3 else 1000));p.emit('03F5',target,I(1))
            if number==3:
                p.emit('0519',target,I(1));p.emit('02AA',target,I(1))
            p.emit('02AC',target,I(number==3),I(1),I(number!=3),I(1),I(1))
        p.emit('02EB');p.emit('032A',I(2));p.emit('0373');p.emit('0001',I(1400))
        p.emit('04D7',G('ped'),I(1));p.set('playerFrozen',1);p.emit('0373')
        for index in range(len(scene['positions'])):
            p.emit('0468',G(f'target{index}_handle'));p.emit('0227',G(f'target{index}_handle'),G(f'target{index}_baseline'))
            copy(f'target{index}_health',f'target{index}_baseline')
        p.emit('0419',G('player'),G('weapon'),G('ammo'));p.emit('046F',G('player'),G('currentWeapon'))
        p.set('phase',1);p.emit('016A',I(400),I(1));p.go('native_loop')

    p.label('model_failure');p.set('phase',-1)
    p.label('failure_loop');p.emit('0001',I(100));p.emit('0008',G('heartbeat'),I(1));p.go('failure_loop')
    code,listing,labels,count=p.build();total=CODE_START+len(code)
    def skip(target):return struct.pack('<HBi',2,1,target)
    header=bytearray(skip(GLOBAL_SIZE)+b'm');header.extend(b'\0'*(GLOBAL_SIZE-len(header)))
    header+=skip(GLOBAL_SIZE+36)+b'\0'+struct.pack('<I',1)+b'\0'*24
    header+=skip(CODE_START)+b'\0'+struct.pack('<IIHH',total,0,0,0)
    assert len(header)==CODE_START
    result=bytes(header)+code;checksum=hashlib.sha256(result).hexdigest()
    assert struct.unpack_from('<IIHH',result,GLOBAL_SIZE+36+8)==(len(result),0,0,0)
    public_scenes=[dict(s,targetCount=len(s['positions'])) for s in SCENES]
    config={
        'version':2,'magic':[0x52454745,0x32304356],
        'slots':{k:v[0]//4 for k,v in FIELDS.items()},'size':len(result),'sha256':checksum,
        'phases':{'error':-1,'loading':0,'briefing':1,'playing':2,'complete':3,'idle':4},
        'commands':{'prepare':1,'start':2},'scenes':public_scenes,
        'result':{'engine':'vice-city-wasm','version':2,'immutable':True,'nativeOnly':True},
    }
    out=HERE/'native-exam-main'
    out.with_suffix('.scm').write_bytes(result);out.with_suffix('.listing.txt').write_text(listing)
    contract=dict(config,globalByteOffset=BASE,fields={k:{'offset':v[0],'type':v[1]} for k,v in FIELDS.items()},
                  validation={'runtimeExecuted':False,'instructions':count,'codeStart':CODE_START,'labels':labels},
                  mailbox='JS writes requestedScene, command, commandSeq only. SCM acknowledges ackSeq. commandSeq must be written last.',
                  records='Per-scene terminal records are immutable; preparing a completed scene restores its native record, without spawning new targets.')
    out.with_suffix('.contract.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n')
    if args.install:
        target=HERE.parent.parent/'dist/native-vc'
        (target/'range.scm').write_bytes(result);(target/'range-config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'path':str(out.with_suffix('.scm')),'size':len(result),'instructions':count,'sha256':checksum,'installed':args.install,'runtimeExecuted':False}))

if __name__=='__main__':main()
