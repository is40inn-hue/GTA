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
for name in ['heliRoute','rpgHit','sceneDeadline','driver','hijacked','driveCompleted','inCar','wanted','cop','copCar','shotHit','policeAlert','policeAlertUntil']: field(name)
RECORD_KEYS = ['scene','outcome','ammoInitial','ammo','weapon','targetCount'] + [
    f'target{index}_{name}' for index in range(3) for name in ['health','credited','destroyed']]
RECORD_KEYS += ['hijacked','driveCompleted']
for scene in range(1,4):
    field(f'record{scene}_completed', offset=256+(scene-1)*128)
    for key in RECORD_KEYS: field(f'record{scene}_{key}')
# Edition10 uses the original Ocean Drive coordinate system.
# Native pursuit is enabled only after the restored paths/model package passes QA.
SCRIPTED_PURSUIT_ENABLED = True
GLOBAL_WANTED_ENABLED = False
SPAWN = (290, -1065, 11.5)
ESCAPE = (253, -1270, 11.5)
# Stand beside the existing ramp instead of behind its opaque front face.
# Target 0 is directly ahead on this line; the ramp remains at x=249.
FINALE = (263, -1270, 11.5)
SCENES = [
 {'scene':1,'title':'Первый шум','weapon':23,'weaponName':'Uzi','model':282,'ammo':40,'burst':3,
  'targetModel':217,'targetModels':[217],'positions':[(288.8,-1083,11.2)],'pickup':(290,-1069,11.5),
  'targetHeading':90,'targetHealth':320,'groundedTarget':True,'targetName':'Вертолёт на стоянке',
  'spawn':SPAWN,'pointsPerTarget':12,'action':'destroy','instruction':'Возьми Узи. Взорви вертолёт на стоянке.',
  'criterion':'Попадание и настоящий взрыв вертолёта — 12 баллов.'},
 {'scene':2,'title':'Уходи от погони','weapon':0,'weaponName':'За руль','model':0,'ammo':0,'burst':0,
  'targetModel':130,'targetModels':[130],'positions':[(287,-1100,11.2)],'spawn':(289,-1099,11.5),
  'pointsPerTarget':5,'action':'hijack','instruction':'Забери машину. Держись дороги к метке.',
  'criterion':'Угон и поездка — по 5 баллов.'},
 {'scene':3,'title':'Последний аргумент','weapon':30,'weaponName':'РПГ','model':287,'ammo':6,'burst':1,
  'targetModel':156,'targetModels':[156,156,217],
  'positions':[(263,-1308,11.2),(258,-1327,11.2),(256,-1340,25)],
  'spawn':FINALE,'pickup':(263,-1272,11.5),'pointsPerTarget':0,'targetPoints':[4,4,6],
  'guidanceOrder':[0,1,2],'guidanceSemantics':'one visible marker; other targets remain valid',
  'action':'finale','instruction':'РПГ в двух шагах. Стреляй по цели с красной меткой. Вертолёт — последним.',
  'criterion':'Машины — по 4. Вертолёт — 6. Шесть ракет.'}
]
# Append fields after existing record layout; legacy ABI slots stay stable.
for name in ['pickup','pickupBlip','pickupCollected','routeBlip','chaseStage','target0_rpgHit','target1_rpgHit','target2_rpgHit','missionHeat','chaseHeli','chaseHeliUpdate','chaseActivated']:
    field(name)
# RC2 ambience is separate from target records and scoring. Append-only slots.
for name in ['ambient0','ambient1','ambient2','ambientState','ambientAttackUntil','ambientRemoveAt']:
    field(name)
AMBIENT = [
    {'position':(283,-1068,11.5),'destination':(283,-1090),'heading':180},
    {'position':(299,-1082,11.5),'destination':(299,-1058),'heading':0},
    {'position':(293,-1071,11.5),'heading':90},
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
        return bytes(code), '\n'.join(line.rstrip() for line in listing) + '\n', labels, len(boundaries)

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('--install',action='store_true')
    args=cli.parse_args();p=Program()
    def copy(dst,src):p.emit('0084',G(dst),G(src))
    def eq(name,value,otherwise):p.branch_false('0038',G(name),I(value),target=otherwise)
    def positive(name,otherwise):p.branch_false('0028',G(name),I(0),target=otherwise)
    def clean(key,opcode,label):
        positive(key,label);p.emit(opcode,G(key));p.label(label);p.set(key,-1)
    def clean_ambient(key,label):
        positive(key,label);p.branch_false('056D',G(key),target=label)
        p.emit('009B',G(key));p.label(label);p.set(key,-1)
    def timer(ms):
        copy('sceneDeadline','nativeTimer');p.emit('0008',G('sceneDeadline'),I(ms))
    def xyz(values):return tuple(F(v) for v in values)
    for name,value in [('magic0',0x52454745),('magic1',0x32304356),('version',3),('phase',0)]:p.set(name,value)
    for name in ['driver','cop','copCar','pickup','pickupBlip','routeBlip','chaseHeli']+[f'target{i}_handle' for i in range(3)]+[f'ambient{i}' for i in range(3)]:p.set(name,-1)
    p.emit('016A',I(0),I(0));p.emit('00C0',I(17),I(15));p.emit('01B6',I(0));p.emit('04BB',I(0))
    p.emit('04E4',F(SPAWN[0]),F(SPAWN[1]));p.emit('0053',I(0),*xyz(SPAWN),G('player'))
    p.emit('01F5',G('player'),G('ped'));p.emit('0352',G('ped'),S('player2'))
    models=[7,1,130,156,217,282,287]
    for model in models:p.emit('0247',I(model))
    p.emit('038B');p.emit('0353',G('ped'))
    for model in models:p.branch_false('0248',I(model),target='model_failure')
    p.emit('01F0',I(0));p.emit('0581',I(0));p.emit('01EB',F(0));p.emit('03DE',F(0))
    p.emit('0222',G('player'),I(100));p.emit('02AB',G('ped'),I(1),I(1),I(1),I(1),I(1))
    p.emit('03CB',*xyz(SPAWN));p.emit('0395',*xyz(SPAWN),F(70),I(1))
    p.emit('01B4',G('player'),I(0));p.set('phase',4)
    p.label('native_loop');p.emit('0001',I(0));p.emit('0008',G('heartbeat'),I(1));p.emit('01BD',G('nativeTimer'))
    p.emit('0225',G('player'),G('playerHealth'));p.emit('0054',G('player'),G('playerX'),G('playerY'),G('playerZ'))
    p.emit('01C0',G('player'),G('wanted'))
    p.branch_false('003A',G('commandSeq'),G('ackSeq'),target='dispatch');p.go('no_command')
    p.label('dispatch');copy('ackSeq','commandSeq');eq('phase',2,'dispatch_allowed');p.go('gameplay')
    p.label('dispatch_allowed');eq('command',1,'dispatch_start')
    for n in range(1,4):eq('requestedScene',n,f'not_prepare{n}');p.go(f'prepare{n}');p.label(f'not_prepare{n}')
    p.go('no_command')
    p.label('dispatch_start');eq('command',2,'no_command');eq('phase',1,'no_command')
    p.branch_false('003A',G('requestedScene'),G('scene'),target='no_command')
    p.emit('01B4',G('player'),I(1));p.set('phase',2);timer(90000)
    eq('scene',1,'start_not_ambient')
    for i in range(2):
        p.branch_false('056D',G(f'ambient{i}'),target=f'start_no_walker{i}')
        p.emit('0211',G(f'ambient{i}'),*(F(v) for v in AMBIENT[i]['destination']))
        p.label(f'start_no_walker{i}')
    p.label('start_not_ambient')
    eq('scene',2,'start_not_chase')
    if SCRIPTED_PURSUIT_ENABLED:
        # Mission car AI uses the real restored road network. Global wanted stays off.
        # Give the player a fair boarding window: visible patrol, lights on, no ram before carjack.
        p.emit('0519',G('copCar'),I(0));p.emit('00AF',G('copCar'),I(0))
        p.emit('0397',G('copCar'),I(1));p.set('policeAlert',1);p.set('missionHeat',2)
    p.label('start_not_chase');eq('scene',3,'gameplay');p.set('missionHeat',5)
    p.emit('0519',G('target2_handle'),I(0));p.emit('04DF',G('target2_handle'),I(1))
    p.emit('04A2',G('target2_handle'),F(244),F(-1340),F(25),I(2));p.set('heliRoute',2);p.go('gameplay')
    p.label('no_command');eq('phase',2,'native_loop')
    p.label('gameplay')
    # One short native encounter in C1. It never gates the mission and cannot
    # change a target's credit, ammunition, deadline, or any terminal record.
    eq('scene',1,'ambient_done')
    positive('ambient2','ambient_done')
    p.branch_false('056D',G('ambient2'),target='ambient_missing')
    p.branch_false('0118',G('ambient2'),target='ambient_alive')
    p.set('ambientState',3);p.go('ambient_done')
    p.label('ambient_missing');p.set('ambient2',-1);p.set('ambientState',3);p.go('ambient_done')
    p.label('ambient_alive');eq('ambientState',0,'ambient_attack_check')
    eq('pickupCollected',1,'ambient_done')
    p.branch_false('00FC',G('player'),G('ambient2'),F(3.5),F(3.5),F(2),I(0),target='ambient_done')
    p.emit('01CA',G('ambient2'),G('player'));p.set('ambientState',1)
    copy('ambientAttackUntil','nativeTimer');p.emit('0008',G('ambientAttackUntil'),I(2200));p.go('ambient_done')
    p.label('ambient_attack_check');eq('ambientState',1,'ambient_flee_check')
    p.branch_false('001C',G('nativeTimer'),G('ambientAttackUntil'),target='ambient_done')
    p.emit('01D0',G('ambient2'),G('player'));p.set('ambientState',2)
    copy('ambientRemoveAt','nativeTimer');p.emit('0008',G('ambientRemoveAt'),I(3500));p.go('ambient_done')
    p.label('ambient_flee_check');eq('ambientState',2,'ambient_done')
    p.branch_false('001C',G('nativeTimer'),G('ambientRemoveAt'),target='ambient_done')
    clean_ambient('ambient2','ambient_removed');p.set('ambientState',3)
    p.label('ambient_done')
    eq('scene',2,'shooting');p.go('car_gameplay')
    p.label('shooting')
    eq('pickupCollected',0,'weapon_ready')
    p.branch_false('0214',G('pickup'),target='pickup_wait')
    p.set('pickupCollected',1);p.emit('01B8',G('player'),G('weapon'))
    clean('pickupBlip','0164','pickup_blip_removed');p.go('weapon_ready')
    p.label('pickup_wait')
    eq('scene',3,'pickup_wait_done')
    p.emit('03A1',*xyz(SCENES[2]['pickup']),F(2.4))
    p.label('pickup_wait_done');p.go('check_timeout')
    p.label('weapon_ready');p.emit('0419',G('player'),G('weapon'),G('ammo'));p.emit('046F',G('player'),G('currentWeapon'))
    eq('scene',3,'after_heli_route')
    p.branch_false('0119',G('target2_handle'),target='heli_alive');p.go('after_heli_route')
    p.label('heli_alive');p.emit('00AA',G('target2_handle'),G('heliX'),G('heliY'),G('heliZ'))
    eq('heliRoute',1,'heli_return');p.branch_false('0020',G('heliX'),F(254),target='after_heli_route')
    p.emit('04A2',G('target2_handle'),F(244),F(-1340),F(25),I(2));p.set('heliRoute',2);p.go('after_heli_route')
    p.label('heli_return');p.branch_false('0022',F(246),G('heliX'),target='after_heli_route')
    p.emit('04A2',G('target2_handle'),F(256),F(-1340),F(25),I(2));p.set('heliRoute',1)
    p.label('after_heli_route');p.set('creditedCount',0)
    for i in range(3):
        t=f'target{i}';nxt=f'after_target{i}'
        p.branch_false('0018',G('targetCount'),I(i),target=nxt)
        p.emit('0227',G(t+'_handle'),G(t+'_health'))
        p.branch_false('0119',G(t+'_handle'),target=f'alive{i}');p.set(t+'_destroyed',1);p.label(f'alive{i}')
        eq('scene',3,f'bullet{i}')
        p.branch_false('031E',G(t+'_handle'),I(41),target=f'count{i}')
        p.branch_false('001C',G('ammoInitial'),G('ammo'),target=f'count{i}')
        p.branch_false('001C',G(t+'_baseline'),G(t+'_health'),target=f'count{i}')
        p.set(t+'_rpgHit',1);p.go(f'count{i}')
        p.label(f'bullet{i}')
        p.branch_false('031E',G(t+'_handle'),G('weapon'),target=f'count{i}')
        p.branch_false('001C',G(t+'_baseline'),G(t+'_health'),target=f'count{i}')
        if i == 0:
            # React to the first native-confirmed Uzi hit, while there is still
            # time before the burning target explodes. The third pedestrian's
            # short attack/flee routine is independent and remains unchanged.
            eq('scene',1,'c1_reaction_done');eq(t+'_rpgHit',0,'c1_reaction_done')
            for walker in range(2):
                key=f'ambient{walker}';done=f'c1_react_skip{walker}';alive=f'c1_react_alive{walker}'
                positive(key,done);p.branch_false('056D',G(key),target=done)
                p.branch_false('0118',G(key),target=alive);p.go(done)
                p.label(alive);p.emit('01D0',G(key),G('player'));p.label(done)
            p.label('c1_reaction_done')
        p.set(t+'_rpgHit',1)
        p.label(f'count{i}');eq(t+'_rpgHit',1,f'credit_done{i}');copy(t+'_credited',t+'_destroyed')
        p.label(f'credit_done{i}');eq(t+'_credited',1,nxt);p.emit('0008',G('creditedCount'),I(1));p.label(nxt)
    # Match C1's instruction with one native marker on the parked helicopter.
    # The pickup-wait branch skips this block, and a wreck is never highlighted.
    p.label('c1_target_marker')
    eq('scene',1,'finale_marker')
    eq('target0_credited',0,'finale_marker');eq('target0_destroyed',0,'finale_marker')
    p.emit('00AA',G('target0_handle'),G('heliX'),G('heliY'),G('heliZ'))
    p.emit('03A1',G('heliX'),G('heliY'),G('heliZ'),F(5))
    # One world marker guides the finale. This only draws an indicator: all
    # targets keep their normal collision/damage/credit path in any order.
    p.label('finale_marker')
    eq('scene',3,'finale_marker_done')
    for i in SCENES[2]['guidanceOrder']:
        nxt=f'finale_marker_next{i}'
        eq(f'target{i}_credited',0,nxt)
        # Destroyed-but-uncredited targets cannot be hit again; never point the
        # player at a wreck. Their unearned points remain unearned.
        eq(f'target{i}_destroyed',0,nxt)
        p.emit('00AA',G(f'target{i}_handle'),G('heliX'),G('heliY'),G('heliZ'))
        p.emit('03A1',G('heliX'),G('heliY'),G('heliZ'),F(3 if i < 2 else 5))
        p.go('finale_marker_done');p.label(nxt)
    p.label('finale_marker_done')
    p.branch_false('003A',G('creditedCount'),G('targetCount'),target='not_all_credited');p.set('outcome',1);p.go('finish_scene')
    p.label('not_all_credited');eq('ammo',0,'check_timeout')
    eq('emptyDeadline',0,'empty_wait');copy('emptyDeadline','nativeTimer');p.emit('0008',G('emptyDeadline'),I(7000))
    p.label('empty_wait');p.branch_false('001C',G('nativeTimer'),G('emptyDeadline'),target='check_timeout')
    p.set('outcome',2);p.go('finish_scene')
    p.label('car_gameplay');p.set('inCar',0)
    # Native world markers, independent of the disabled HUD/radar. Draw only the
    # active destination each frame, so a completed marker disappears immediately.
    eq('hijacked',1,'marker_car')
    eq('chaseStage',1,'marker_midpoint')
    p.emit('03A1',*xyz(ESCAPE),F(8));p.go('marker_done')
    p.label('marker_midpoint');p.emit('03A1',F(272),F(-1190),F(11),F(8));p.go('marker_done')
    p.label('marker_car');p.emit('00AA',G('target0_handle'),G('heliX'),G('heliY'),G('heliZ'))
    p.emit('03A1',G('heliX'),G('heliY'),G('heliZ'),F(3))
    p.label('marker_done')
    eq('chaseStage',1,'no_heli_follow')
    p.branch_false('001C',G('nativeTimer'),G('chaseHeliUpdate'),target='no_heli_follow')
    positive('chaseHeli','no_heli_follow')
    p.emit('04A2',G('chaseHeli'),G('playerX'),G('playerY'),F(30),I(8))
    copy('chaseHeliUpdate','nativeTimer');p.emit('0008',G('chaseHeliUpdate'),I(1200))
    p.label('no_heli_follow')
    p.branch_false('0118',G('driver'),target='driver_alive');p.set('outcome',4);p.go('finish_scene')
    p.label('driver_alive');p.branch_false('0119',G('target0_handle'),target='car_alive');p.set('outcome',4);p.go('finish_scene')
    p.label('car_alive');p.branch_false('00DB',G('ped'),G('target0_handle'),target='check_timeout');p.set('inCar',1)
    p.branch_false('00DB',G('driver'),G('target0_handle'),target='hijacked');p.go('check_timeout')
    p.label('hijacked');p.set('hijacked',1)
    eq('chaseActivated',0,'chase_already_active')
    if SCRIPTED_PURSUIT_ENABLED:
        p.emit('00A7',G('copCar'),F(278),F(-1095),F(11));p.emit('00AF',G('copCar'),I(3))
    p.set('chaseActivated',1)
    p.label('chase_already_active')
    eq('chaseStage',0,'drive_to_finish')
    p.branch_false('01AF',G('target0_handle'),F(272),F(-1190),F(11),F(22),F(25),F(8),I(0),target='drive_to_finish')
    p.set('chaseStage',1)
    if SCRIPTED_PURSUIT_ENABLED:
        p.set('missionHeat',5)
        p.emit('00A5',I(217),F(272),F(-1205),F(32),G('chaseHeli'))
        p.emit('04DF',G('chaseHeli'),I(1));p.emit('0519',G('chaseHeli'),I(0))
        p.emit('02AC',G('chaseHeli'),I(1),I(1),I(1),I(1),I(1))
        p.emit('04A2',G('chaseHeli'),G('playerX'),G('playerY'),F(30),I(8))
        copy('chaseHeliUpdate','nativeTimer');p.emit('0008',G('chaseHeliUpdate'),I(1200))
    p.label('drive_to_finish');eq('chaseStage',1,'check_timeout')
    p.branch_false('01AF',G('target0_handle'),*xyz(ESCAPE),F(22),F(22),F(8),I(1),target='check_timeout')
    p.set('driveCompleted',1);p.set('outcome',1);p.go('finish_scene')
    p.label('check_timeout');p.branch_false('001C',G('nativeTimer'),G('sceneDeadline'),target='native_loop')
    p.set('outcome',3);p.go('finish_scene')
    p.label('finish_scene')
    for i in range(3):clean_ambient(f'ambient{i}',f'finish_no_ambient{i}')
    p.set('ambientState',3)
    positive('copCar','no_finish_cop');p.emit('0397',G('copCar'),I(0));p.label('no_finish_cop')
    clean('chaseHeli','00A6','finish_no_heli');p.set('missionHeat',0)
    p.emit('01B4',G('player'),I(0));p.emit('0110',G('player'));p.emit('01F0',I(0));p.set('policeAlert',0)
    for n in range(1,4):
        eq('scene',n,f'not_save{n}')
        for key in RECORD_KEYS:copy(f'record{n}_{key}',key)
        p.set(f'record{n}_completed',1);p.go('finish_commit');p.label(f'not_save{n}')
    p.label('finish_commit');p.set('completed',1);p.set('phase',3);p.go('native_loop')
    for scene in SCENES:
        n=scene['scene'];p.label(f'prepare{n}');eq(f'record{n}_completed',1,f'new_scene{n}')
        for key in RECORD_KEYS:copy(key,f'record{n}_{key}')
        p.set('completed',1);p.set('phase',3);p.go('native_loop')
        p.label(f'new_scene{n}');p.set('phase',0);p.emit('01B4',G('player'),I(0))
        p.branch_false('00DF',G('ped'),target=f'not_old_car{n}');p.emit('0362',G('ped'),*xyz(scene['spawn']));p.label(f'not_old_car{n}')
        p.emit('0110',G('player'));p.emit('01F0',I(0))
        for key,op in [('driver','009B'),('cop','009B'),('copCar','00A6'),('pickup','0215'),('pickupBlip','0164'),('routeBlip','0164'),('chaseHeli','00A6')]:clean(key,op,f'clean_{n}_{key}')
        for i in range(3):clean_ambient(f'ambient{i}',f'clean_{n}_ambient{i}')
        for key in ['hijacked','driveCompleted','inCar','wanted','shotHit','policeAlert','policeAlertUntil','pickupCollected','chaseStage','chaseActivated','missionHeat','chaseHeliUpdate','heliRoute','sceneDeadline','completed','outcome','emptyDeadline','creditedCount']:p.set(key,0)
        for key in ['ambientState','ambientAttackUntil','ambientRemoveAt']:p.set(key,0)
        p.set('scene',n)
        for i in range(3):
            t=f'target{i}';clean(t+'_handle','00A6',f'old_target{n}_{i}')
            for key in ['health','credited','destroyed','baseline','rpgHit']:p.set(t+'_'+key,0)
        p.emit('04D7',G('ped'),I(0));p.set('playerFrozen',0)
        p.emit('00A1',G('ped'),*xyz(scene['spawn']));p.emit('0173',G('ped'),F(180))
        p.emit('03B8',G('player'));p.set('weapon',scene['weapon']);p.set('ammoInitial',scene['ammo']);p.set('ammo',scene['ammo'])
        if n!=2:
            p.emit('032B',I(scene['model']),I(3),I(scene['ammo']),*xyz(scene['pickup']),G('pickup'))
            p.emit('03DC',G('pickup'),G('pickupBlip'))
        else:p.set('pickupCollected',1)
        p.set('targetCount',len(scene['positions']))
        for i,position in enumerate(scene['positions']):
            target=G(f'target{i}_handle');p.emit('00A5',I(scene['targetModels'][i]),*xyz(position),target)
            p.emit('0175',target,F(scene.get('targetHeading',180)));p.emit('0229',target,I(0 if scene['targetModels'][i]==156 else 3),I(1 if scene['targetModels'][i]==156 else 6))
            p.emit('0224',target,I(scene.get('targetHealth',450 if n==3 else 350 if n==1 else 1000)));p.emit('03F5',target,I(1))
            if scene.get('groundedTarget'):
                # The packaged Maverick stays parked, broadside to the player.
                # No driver or flight task is created. Position is frozen, while
                # real bullet/fire damage remains enabled. 04DF is a stabiliser,
                # not a rotor switch, so it does not belong to this parked target.
                p.emit('0519',target,I(1))
            if n==3 and i==2:p.emit('0519',target,I(1));p.emit('02AA',target,I(1))
            p.emit('02AC',target,I(n!=1),I(n!=1),I(n!=3),I(1),I(1));p.emit('02AA',target,I(1))
        if n==2:
            p.emit('020A',G('target0_handle'),I(1));p.emit('009A',I(4),I(7),F(284),F(-1100),F(11.2),G('driver'));p.emit('036A',G('driver'),G('target0_handle'));p.emit('0526',G('driver'),I(0))
            if SCRIPTED_PURSUIT_ENABLED:
                p.emit('00A5',I(156),F(290),F(-1120),F(11.2),G('copCar'));p.emit('0175',G('copCar'),F(0))
                p.emit('009A',I(6),I(1),F(290),F(-1120),F(11.2),G('cop'));p.emit('036A',G('cop'),G('copCar'))
                p.emit('00AD',G('copCar'),F(8));p.emit('00AE',G('copCar'),I(2))
        if n==1:
            for i,ambient in enumerate(AMBIENT):
                ped=G(f'ambient{i}')
                p.emit('009A',I(4),I(7),*xyz(ambient['position']),ped)
                p.emit('0173',ped,F(ambient['heading']));p.emit('048F',ped)
                p.emit('0291',ped,I(0));p.emit('011A',ped,I(0));p.emit('0192',ped)
        p.emit('02EB');p.emit('032A',I(2));p.emit('0373');p.emit('0001',I(1400));p.emit('04D7',G('ped'),I(0));p.emit('0373')
        for i in range(len(scene['positions'])):
            p.emit('0468',G(f'target{i}_handle'));p.emit('0227',G(f'target{i}_handle'),G(f'target{i}_baseline'));copy(f'target{i}_health',f'target{i}_baseline')
        p.emit('046F',G('player'),G('currentWeapon'));p.set('phase',1);p.emit('016A',I(400),I(1));p.go('native_loop')
    p.label('model_failure');p.set('phase',-1)
    p.label('failure_loop');p.emit('0001',I(100));p.emit('0008',G('heartbeat'),I(1));p.go('failure_loop')
    assert len({offset for offset,kind in FIELDS.values()}) == len(FIELDS), 'ABI slot overlap'
    initial_heli_goal = next(args[1:4] for kind,*item in p.items if kind == 'op' for opcode,args in [item] if opcode == '04A2' and args[0] == G('target2_handle'))
    assert tuple(a.value for a in initial_heli_goal) != SCENES[2]['positions'][2], 'Zero-length helicopter startup route causes native NaN'
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
        'version':3,'magic':[0x52454745,0x32304356],
        'slots':{k:v[0]//4 for k,v in FIELDS.items()},'size':len(result),'sha256':checksum,
        'phases':{'error':-1,'loading':0,'briefing':1,'playing':2,'complete':3,'idle':4},
        'commands':{'prepare':1,'start':2},'scenes':public_scenes,
        'location':'Ocean Drive','contentEdition':10,'pursuitEnabled':SCRIPTED_PURSUIT_ENABLED,'globalWantedEnabled':GLOBAL_WANTED_ENABLED,'heatSemantics':'scripted mission pressure, not global native wanted level',
        'ambient':{'scene':1,'model':7,'count':3,'attackActor':2,'attackMilliseconds':2200,'fleeMilliseconds':3500,'scored':False,
                   'reactionActors':[0,1],'reactionTrigger':'first-native-weapon-hit-and-health-loss','reactionOnce':True},
        'result':{'engine':'vice-city-wasm','version':3,'immutable':True,'nativeOnly':True},
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
