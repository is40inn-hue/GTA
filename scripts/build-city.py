#!/usr/bin/env python3
"""Build a minimal Vice City main.scm without running a compiler or the engine.
Only standard VC opcodes from Sanny Builder's primary vc.json are emitted.
Three native exam scenes share one engine. Target credits are native SCM facts; JS only sends mailbox commands.
"""
from __future__ import annotations
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
# RC4.4 keeps the trip in one direction. These positions are over collision
# triangles in the shipped Ocean Drive district, including the southern bend.
ESCAPE = (193, -1500, 11.5)
FINALE = ESCAPE
DRIVE_MIDPOINT = (272, -1190, 11.5)
DRIVE_RAMP_BYPASS = (263, -1285, 11.5)
DRIVE_SEAFRONT = (244, -1340, 11.5)
DRIVE_SOUTH = (218, -1430, 11.5)
STREET_TAXI = (298, -1069, 11.2)
ARRIVAL_AIR = (288.8, -1088, 17.2)
ARRIVAL_LANDING = (288.8, -1083, 10.85)
PUDGE_MODEL = 8  # installed separately as egepudge; male01/player stay intact
STEVE_MODEL = 107
CJ_LIKE_MODEL = 108  # separate white-vest native extra, not an original SA mesh
CLUB_DANCER_MODEL = 109  # existing bundled stripa in the unused special01 slot
ARRIVAL_CREW_MODELS = [CJ_LIKE_MODEL, STEVE_MODEL, PUDGE_MODEL, CLUB_DANCER_MODEL]
ARRIVAL_ACTORS = range(len(ARRIVAL_CREW_MODELS))
ARRIVAL_FOREGROUND = [(287.8,-1075.5), (291.5,-1076.0), (289.7,-1074.5), (293.0,-1075.0)]
# RC4.6 keeps the established landing, but the native running destination is
# refreshed from the player's actual position instead of an invisible fixed spot.
ARRIVAL_RUN_MS = 4800
ARRIVAL_RUN_REFRESH_MS = 700
ARRIVAL_MINIMUM_RUN_MS = 1200  # a readable short beat even if the player stands by the door
ESCAPE_BIKE_MODEL = 191  # authored small native bike, existing BIKE handling/bikes.ifp
ESCAPE_BIKE_POSITION = (294.2, -1072.0, 11.2)
ESCAPE_BIKE_DESTINATION = (272, -1190, 11.2)
PATROL_HELI_MODEL = 227  # supplied Maverick with authored native equipment geometry
STREET_WALKERS = [
    {'model':7, 'position':(294,-1125,11.2), 'destination':(290,-1140)},
    {'model':7, 'position':(290,-1136,11.2), 'destination':(295,-1119)},
    {'model':1, 'position':(282,-1190,11.2), 'destination':(279,-1207)},
]
ONCOMING_TRAFFIC = [
    {'model':130, 'position':(270,-1160,11.2), 'destination':(290,-1060,11.2),
     'speed':6.5, 'colour':(37,37), 'routeStage':0},
    {'model':150, 'position':(256,-1240,11.2), 'destination':(277,-1130,11.2),
     'speed':7.5, 'colour':(6,6), 'routeStage':1},
]
FINALE_HELI_LEFT = (184, -1570, 25)
FINALE_HELI_RIGHT = (196, -1570, 25)
SCENES = [
 {'scene':1,'title':'Старые знакомые','weapon':23,'weaponName':'Uzi','model':282,'ammo':40,'burst':3,
  'targetModel':217,'targetModels':[217],'positions':[ARRIVAL_AIR],'pickup':(290,-1068,11.5),
  'pickupPlacement':'native-player-forward-offset-at-release','pickupForwardMetres':3,
  'targetHeading':90,'targetHealth':320,'landingTarget':True,'targetName':'Вертолёт у метки',
  'spawn':SPAWN,'pointsPerTarget':12,'action':'destroy','instruction':'Вертолёт садится. Затем возьми Узи и освободи выезд.',
  'criterion':'Попадание и настоящий взрыв вертолёта — 12 баллов.'},
 {'scene':2,'title':'По набережной','weapon':0,'weaponName':'За руль','model':0,'ammo':0,'burst':0,
  'targetModel':130,'targetModels':[130],'positions':[(287,-1100,11.2)],'spawn':(289,-1099,11.5),
  'pointsPerTarget':5,'action':'hijack','instruction':'Забери машину. По набережной — прямо к РПГ.',
  'criterion':'Угон — 5. Полный проезд к РПГ — ещё 5.',
  
  'route':[DRIVE_MIDPOINT,DRIVE_RAMP_BYPASS,DRIVE_SEAFRONT,DRIVE_SOUTH,ESCAPE]},
 {'scene':3,'title':'Последний залп','weapon':30,'weaponName':'РПГ','model':287,'ammo':6,'burst':1,
  'targetModel':156,'targetModels':[156,156,PATROL_HELI_MODEL],
  'positions':[(185,-1530,11.2),(193,-1550,11.2),FINALE_HELI_RIGHT],
  'spawn':FINALE,'pickup':(193,-1502,11.5),'pointsPerTarget':0,'targetPoints':[4,4,6],
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
# RC4.3 appends read-only story state after the complete RC4.2 ABI. The original
# result records and their two C2 milestones stay byte-for-byte in the same slots.
for name in ['streetTaxi','routeStage','courier','courierStopUntil','courierRetryAt',
             'courierBoarding','carDriver','courierAttempts','courierInCar']:
    field(name)
# Existing courier slots remain reserved so restored score packets and native
# ABI readers keep the same offsets. RC4.4 never creates or boards a courier.
for name in ['arrivalStage','arrivalDeadline','arrivalExited','arrivalLanded']:
    field(name)
# All new story/traffic fields append after the complete RC4.4 ABI. Traffic and
# pedestrians never occupy target0..2 or alter their damage/credit records.
for name in ['arrivalRunUpdate','traffic0','traffic1','trafficDriver0','trafficDriver1',
             'trafficState0','trafficState1','trafficExpire0','trafficExpire1',
             'street0','street1','street2','streetActive','cameoSeen','cameoVisibleSince','record2_cameoSeen']:
    field(name)
# RC4.7 keeps every RC4.6 slot (0..192), then appends the fourth real passenger,
# a dynamically placed pickup, and two independent unscored exposure records.
field('ambient3')
for name in ['firstPickupX','firstPickupY','firstPickupZ']: field(name,'float32')
for name in ['arrivalPudgeSeen','arrivalPudgeVisibleSince','arrivalSteveSeen','arrivalSteveVisibleSince',
             'arrivalRunNotBefore','record1_arrivalPudgeSeen','record1_arrivalSteveSeen']:
    field(name)
# RC4.9 is append-only after every RC4.7/4.8 slot (0..203). The optional story
# rider and read-only radar packet never reuse a scored target/result field.
for name in ['escapeBike','escapeState','escapeDeadline','escapeRetryAt','escapeAttempts',
             'escapeDriver','escapeNotBefore','escapeEntered','escapeDeparted']:
    field(name)
for name in ['escapeStartX','escapeStartY','escapeBikeX','escapeBikeY','playerHeading',
             'mapTargetX','mapTargetY','mapTargetZ']:
    field(name,'float32')
for name in ['mapTargetKind','mapValid','record1_escapeEntered','record1_escapeDeparted']:
    field(name)
field('escapeBikeZ','float32')

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
    p=Program()
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
    def arrival_timer(ms):
        copy('arrivalDeadline','nativeTimer');p.emit('0008',G('arrivalDeadline'),I(ms))
    def escape_timer(ms):
        copy('escapeDeadline','nativeTimer');p.emit('0008',G('escapeDeadline'),I(ms))
    def map_coords(kind,coords):
        for key,value in zip(['mapTargetX','mapTargetY','mapTargetZ'],coords):
            p.emit('0086' if isinstance(value,Arg) else '0005',G(key),value if isinstance(value,Arg) else F(value))
        p.set('mapTargetKind',kind);p.set('mapValid',1)
    def map_vehicle(kind,key,done):
        positive(key,done)
        p.branch_false('0119',G(key),target=done+'_alive');p.go(done)
        p.label(done+'_alive')
        p.emit('00AA',G(key),G('mapTargetX'),G('mapTargetY'),G('mapTargetZ'))
        p.set('mapTargetKind',kind);p.set('mapValid',1)
    def run_to_player():
        for i in ARRIVAL_ACTORS:p.emit('0239',G(f'ambient{i}'),G('playerX'),G('playerY'))
        copy('arrivalRunUpdate','nativeTimer');p.emit('0008',G('arrivalRunUpdate'),I(ARRIVAL_RUN_REFRESH_MS))
    def clean_street(suffix):
        for i in range(3):clean_ambient(f'street{i}',f'{suffix}_street{i}')
        for i in range(2):
            clean_ambient(f'trafficDriver{i}',f'{suffix}_traffic_driver{i}')
            clean(f'traffic{i}','00A6',f'{suffix}_traffic_car{i}')
            p.set(f'trafficState{i}',2)
        p.set('streetActive',0)
    def pickup_for(scene):
        if scene['scene']==1:
            # The player can walk while the helicopter lands. Put the one-time
            # Uzi in front of their CURRENT native heading, not the old spawn.
            p.emit('04C4',G('ped'),F(0),F(scene['pickupForwardMetres']),F(0),G('firstPickupX'),G('firstPickupY'),G('firstPickupZ'))
            coords=(G('firstPickupX'),G('firstPickupY'),G('firstPickupZ'))
        else: coords=xyz(scene['pickup'])
        p.emit('032B',I(scene['model']),I(3),I(scene['ammo']),*coords,G('pickup'))
        p.emit('03DC',G('pickup'),G('pickupBlip'))
    def unlock_arrival(suffix):
        # One pickup whether the vignette completes or abandons a native task.
        # Never award a target or restore spent ammo from this story branch.
        positive('pickup',f'arrival_pickup_create_{suffix}');p.go(f'arrival_pickup_ready_{suffix}')
        p.label(f'arrival_pickup_create_{suffix}');pickup_for(SCENES[0])
        p.label(f'arrival_pickup_ready_{suffix}')
        p.emit('02AC',G('target0_handle'),I(0),I(0),I(1),I(1),I(1))
    for name,value in [('magic0',0x52454745),('magic1',0x32304356),('version',3),('phase',0)]:p.set(name,value)
    for name in ['driver','cop','copCar','pickup','pickupBlip','routeBlip','chaseHeli','streetTaxi','courier','carDriver','escapeBike','escapeDriver']+[f'target{i}_handle' for i in range(3)]+[f'ambient{i}' for i in ARRIVAL_ACTORS]+[f'street{i}' for i in range(3)]+[f'traffic{i}' for i in range(2)]+[f'trafficDriver{i}' for i in range(2)]:p.set(name,-1)
    p.emit('016A',I(0),I(0));p.emit('00C0',I(17),I(15));p.emit('01B6',I(0));p.emit('04BB',I(0))
    p.emit('04E4',F(SPAWN[0]),F(SPAWN[1]));p.emit('0053',I(0),*xyz(SPAWN),G('player'))
    p.emit('01F5',G('player'),G('ped'));p.emit('0352',G('ped'),S('player2'))
    models=[7,PUDGE_MODEL,STEVE_MODEL,CJ_LIKE_MODEL,CLUB_DANCER_MODEL,1,130,150,156,217,282,287,ESCAPE_BIKE_MODEL,PATROL_HELI_MODEL]
    for model in models:p.emit('0247',I(model))
    p.emit('038B');p.emit('0353',G('ped'))
    for model in models:p.branch_false('0248',I(model),target='model_failure')
    p.emit('01F0',I(0));p.emit('0581',I(0));p.emit('01EB',F(0));p.emit('03DE',F(0))
    p.emit('0222',G('player'),I(100));p.emit('02AB',G('ped'),I(1),I(1),I(1),I(1),I(1))
    p.emit('03CB',*xyz(SPAWN));p.emit('0395',*xyz(SPAWN),F(70),I(1))
    p.emit('01B4',G('player'),I(0));p.set('phase',4)
    p.label('native_loop');p.emit('0001',I(0));p.emit('0008',G('heartbeat'),I(1));p.emit('01BD',G('nativeTimer'))
    p.emit('0225',G('player'),G('playerHealth'));p.emit('0054',G('player'),G('playerX'),G('playerY'),G('playerZ'))
    p.emit('0172',G('ped'),G('playerHeading'));p.set('mapValid',0);p.set('mapTargetKind',0)
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
    # Prepared/warmed scenes hold the helicopter and its real seated crew.
    # Landing starts only after the owner's explicit start command.
    p.set('arrivalStage',1);arrival_timer(8000)
    p.emit('0519',G('target0_handle'),I(0));p.emit('04DF',G('target0_handle'),I(1))
    p.emit('04D0',G('target0_handle'),F(90))
    p.emit('04A2',G('target0_handle'),*xyz(ARRIVAL_LANDING),I(3))
    p.label('start_not_ambient')
    eq('scene',2,'start_not_chase')
    # Native start is the first point where roadside actors receive a walk task.
    # They are already in the verified model package, never fetched on encounter.
    for i,walker in enumerate(STREET_WALKERS):
        p.branch_false('056D',G(f'street{i}'),target=f'start_street_skip{i}')
        p.emit('04D7',G(f'street{i}'),I(0))
        p.emit('0211',G(f'street{i}'),*(F(v) for v in walker['destination']))
        p.label(f'start_street_skip{i}')
    p.set('streetActive',1)
    if SCRIPTED_PURSUIT_ENABLED:
        # Mission car AI uses the real restored road network. Global wanted stays off.
        # Give the player a fair boarding window: visible patrol, lights on, no ram before carjack.
        p.emit('0519',G('copCar'),I(0));p.emit('00AF',G('copCar'),I(0))
        p.emit('0397',G('copCar'),I(1));p.set('policeAlert',1);p.set('missionHeat',2)
    p.label('start_not_chase');eq('scene',3,'gameplay');p.set('missionHeat',5)
    p.emit('0519',G('target2_handle'),I(0));p.emit('04DF',G('target2_handle'),I(1))
    p.emit('04A2',G('target2_handle'),*xyz(FINALE_HELI_LEFT),I(2));p.set('heliRoute',2);p.go('gameplay')
    p.label('no_command');eq('phase',2,'native_loop')
    p.label('gameplay')
    # The optional HUD radar receives only native player/target facts. No map
    # asset or frame is requested here, and phase1 warmup never runs this block.
    eq('scene',1,'map_not_c1')
    eq('pickupCollected',0,'map_c1_target')
    positive('pickup','map_c1_target')
    map_coords(1,[G('firstPickupX'),G('firstPickupY'),G('firstPickupZ')]);p.go('map_done')
    p.label('map_c1_target');map_vehicle(4,'target0_handle','map_c1_done')
    p.label('map_c1_done');p.go('map_done')
    p.label('map_not_c1');eq('scene',2,'map_c3')
    eq('hijacked',1,'map_c2_vehicle')
    for stage,position in enumerate(SCENES[1]['route']):
        eq('routeStage',stage,f'map_route_next{stage}')
        map_coords(3,position);p.go('map_done');p.label(f'map_route_next{stage}')
    p.go('map_done')
    p.label('map_c2_vehicle');map_vehicle(2,'target0_handle','map_c2_done')
    p.label('map_c2_done');p.go('map_done')
    p.label('map_c3');eq('scene',3,'map_done')
    eq('pickupCollected',0,'map_c3_targets')
    map_coords(1,SCENES[2]['pickup']);p.go('map_done')
    p.label('map_c3_targets')
    for i in SCENES[2]['guidanceOrder']:
        done=f'map_c3_next{i}'
        eq(f'target{i}_credited',0,done);eq(f'target{i}_destroyed',0,done)
        map_vehicle(4 if i==2 else 2,f'target{i}_handle',done);p.go('map_done');p.label(done)
    p.label('map_done')
    # The native arrival is in the player's starting view. No WAIT, forced
    # camera, player warp or JS timer drives this sequence. The mission opens
    # immediately; a failed landing/door task releases the normal pickup.
    eq('scene',1,'ambient_done')
    eq('arrivalStage',0,'arrival_active');p.go('ambient_done')
    p.label('arrival_active')
    eq('arrivalStage',6,'arrival_not_finished');p.go('ambient_done')
    p.label('arrival_not_finished');eq('arrivalStage',7,'arrival_not_fallback');p.go('ambient_done')
    p.label('arrival_not_fallback')
    p.branch_false('0119',G('target0_handle'),target='arrival_heli_alive')
    # Once Uzi exists, a destroyed helicopter belongs to the normal native
    # damage/credit path below, even if the brawl has not finished yet.
    p.branch_false('0028',G('arrivalStage'),I(4),target='arrival_target_lost');p.go('ambient_done')
    p.label('arrival_target_lost')
    # IS_CAR_DEAD also covers an invalid handle. Do not send a proof/freeze
    # opcode to it or leave the player waiting for an impossible first target.
    p.set('target0_destroyed',1);p.set('target0_health',0);p.set('outcome',4);p.go('finish_scene')
    p.label('arrival_heli_alive');eq('arrivalStage',1,'arrival_exit')
    p.branch_false('01AF',G('target0_handle'),*xyz(ARRIVAL_LANDING),F(3),F(3),F(0.55),I(0),target='arrival_landing_wait')
    # The helicopter has reached road height through native flight. Freezing
    # its settled body makes the real passenger door animations safe to start.
    p.emit('0519',G('target0_handle'),I(1));p.emit('00AF',G('target0_handle'),I(0))
    p.set('arrivalLanded',1);p.set('arrivalStage',2);arrival_timer(6000)
    for i in ARRIVAL_ACTORS:
        p.branch_false('056D',G(f'ambient{i}'),target='arrival_abort')
        p.emit('01D3',G(f'ambient{i}'),G('target0_handle'))
    p.go('ambient_done')
    p.label('arrival_landing_wait')
    p.branch_false('001C',G('nativeTimer'),G('arrivalDeadline'),target='ambient_done');p.go('arrival_abort')
    p.label('arrival_exit');eq('arrivalStage',2,'arrival_foreground')
    p.set('arrivalExited',0)
    for i in ARRIVAL_ACTORS:
        key=f'ambient{i}'
        p.branch_false('056D',G(key),target='arrival_abort')
        p.branch_false('0118',G(key),target=f'arrival_exit_alive{i}');p.go('arrival_abort')
        p.label(f'arrival_exit_alive{i}')
        p.branch_false('00DB',G(key),G('target0_handle'),target=f'arrival_out{i}');p.go(f'arrival_counted{i}')
        p.label(f'arrival_out{i}');p.emit('0008',G('arrivalExited'),I(1));p.label(f'arrival_counted{i}')
    eq('arrivalExited',len(ARRIVAL_CREW_MODELS),'arrival_exit_wait')
    run_to_player()
    copy('arrivalRunNotBefore','nativeTimer');p.emit('0008',G('arrivalRunNotBefore'),I(ARRIVAL_MINIMUM_RUN_MS))
    p.set('arrivalStage',3);arrival_timer(ARRIVAL_RUN_MS);p.go('ambient_done')
    p.label('arrival_exit_wait')
    p.branch_false('001C',G('nativeTimer'),G('arrivalDeadline'),target='ambient_done');p.go('arrival_abort')
    p.label('arrival_foreground');eq('arrivalStage',3,'arrival_brawl')
    for i in ARRIVAL_ACTORS:
        p.branch_false('056D',G(f'ambient{i}'),target='arrival_abort')
        p.branch_false('0118',G(f'ambient{i}'),target=f'arrival_fight_alive{i}');p.go('arrival_abort')
        p.label(f'arrival_fight_alive{i}')
    # Keep the action close to a moving player. A real proximity observation may
    # finish the rush early; blocked paths still yield to the bounded brawl.
    p.branch_false('001C',G('nativeTimer'),G('arrivalRunNotBefore'),target='arrival_run_wait')
    p.branch_false('00F2',G('ambient2'),G('ped'),F(4),F(4),I(0),target='arrival_run_wait')
    p.go('arrival_brawl_start')
    p.label('arrival_run_wait')
    p.branch_false('001C',G('nativeTimer'),G('arrivalDeadline'),target='arrival_run_refresh')
    p.go('arrival_brawl_start')
    p.label('arrival_run_refresh')
    p.branch_false('001C',G('nativeTimer'),G('arrivalRunUpdate'),target='ambient_done')
    run_to_player();p.go('ambient_done')
    p.label('arrival_brawl_start')
    # Four distinct arrivals stay together in the readable foreground beat.
    # Their short unarmed scuffle is independent of all native score records.
    p.emit('01C9',G('ambient0'),G('ambient2'));p.emit('01C9',G('ambient1'),G('ambient2'))
    p.emit('01C9',G('ambient2'),G('ambient0'));p.emit('01C9',G('ambient3'),G('ambient1'))
    p.set('ambientState',1);p.set('arrivalStage',4);arrival_timer(3200)
    # The one Uzi is released after the visible departure or a bounded fallback.
    # This prevents the C1 completion transition cutting the boarding beat off.
    p.go('ambient_done')
    p.label('arrival_brawl');eq('arrivalStage',4,'arrival_flee')
    p.branch_false('001C',G('nativeTimer'),G('arrivalDeadline'),target='ambient_done')
    for i in [0,1,3]:
        p.branch_false('056D',G(f'ambient{i}'),target=f'arrival_flee_skip{i}')
        p.emit('011C',G(f'ambient{i}'));p.emit('0291',G(f'ambient{i}'),I(0))
        p.emit('01D0',G(f'ambient{i}'),G('player'));p.label(f'arrival_flee_skip{i}')
    p.branch_false('056D',G('ambient2'),target='arrival_abort')
    p.branch_false('0118',G('ambient2'),target='escape_begin');p.go('arrival_abort')
    p.label('escape_begin')
    p.emit('011C',G('ambient2'));p.emit('0291',G('ambient2'),I(0));p.emit('01ED',G('ambient2'))
    p.emit('01D5',G('ambient2'),G('escapeBike'))
    p.set('escapeState',1);p.set('escapeAttempts',1);escape_timer(6500)
    copy('escapeRetryAt','nativeTimer');p.emit('0008',G('escapeRetryAt'),I(3300))
    p.set('ambientState',2);p.set('arrivalStage',5);arrival_timer(18000);p.go('ambient_done')
    p.label('arrival_flee');eq('arrivalStage',5,'ambient_done')
    # Keep the rider/vehicle alive until the escape state machine has released
    # the pickup. Cleanup on a scene transition remains unconditional.
    p.branch_false('0028',G('escapeState'),I(3),target='ambient_done')
    p.branch_false('001C',G('nativeTimer'),G('arrivalDeadline'),target='ambient_done')
    p.branch_false('056D',G('ambient2'),target='arrival_cleanup')
    p.branch_false('02CB',G('ambient2'),target='arrival_cleanup');p.go('ambient_done')
    p.label('arrival_cleanup')
    for i in ARRIVAL_ACTORS:clean_ambient(f'ambient{i}',f'arrival_remove{i}')
    clean('escapeBike','00A6','arrival_remove_bike')
    p.set('ambientState',3);p.set('arrivalStage',6);p.go('ambient_done')
    p.label('arrival_abort')
    # A missing/dead crew member, blocked door or slow native flight never
    # strands the exam. Skip only the unscored vignette; scoring stays native.
    p.set('arrivalStage',7);p.set('ambientState',3)
    p.set('escapeState',4)
    for i in ARRIVAL_ACTORS:clean_ambient(f'ambient{i}',f'arrival_abort_remove{i}')
    clean('escapeBike','00A6','arrival_abort_bike')
    # Keep an unfinished landing as a stable target where physics left it.
    # No teleport, new target, ammo reset or infinite autonomous fly-away.
    p.emit('00AF',G('target0_handle'),I(0));p.emit('0519',G('target0_handle'),I(1))
    unlock_arrival('fallback')
    p.label('ambient_done')
    # Native entry/AI driving; no warp, scripted coordinate movement, or fake
    # success is used. A blocked vehicle task cannot block the scored exam.
    eq('scene',1,'escape_done')
    eq('escapeState',1,'escape_check_driving')
    p.branch_false('056D',G('ambient2'),target='escape_fallback')
    p.branch_false('0118',G('ambient2'),target='escape_actor_alive');p.go('escape_fallback')
    p.label('escape_actor_alive')
    positive('escapeBike','escape_fallback')
    p.branch_false('0119',G('escapeBike'),target='escape_bike_alive');p.go('escape_fallback')
    p.label('escape_bike_alive')
    p.branch_false('00DB',G('ambient2'),G('escapeBike'),target='escape_boarding_wait')
    p.emit('046C',G('escapeBike'),G('escapeDriver'))
    p.branch_false('003A',G('escapeDriver'),G('ambient2'),target='escape_boarding_wait')
    p.set('escapeEntered',1);p.set('escapeState',2)
    p.emit('00AA',G('escapeBike'),G('escapeStartX'),G('escapeStartY'),G('escapeBikeZ'))
    p.emit('0519',G('escapeBike'),I(0));p.emit('00AD',G('escapeBike'),F(9))
    p.emit('00AE',G('escapeBike'),I(0));p.emit('02C2',G('escapeBike'),*xyz(ESCAPE_BIKE_DESTINATION))
    copy('escapeNotBefore','nativeTimer');p.emit('0008',G('escapeNotBefore'),I(900))
    escape_timer(3500);p.go('escape_done')
    p.label('escape_boarding_wait')
    p.branch_false('001C',G('nativeTimer'),G('escapeDeadline'),target='escape_retry');p.go('escape_fallback')
    p.label('escape_retry');eq('escapeAttempts',1,'escape_done')
    p.branch_false('001C',G('nativeTimer'),G('escapeRetryAt'),target='escape_done')
    p.emit('01D5',G('ambient2'),G('escapeBike'));p.set('escapeAttempts',2);p.go('escape_done')
    p.label('escape_check_driving');eq('escapeState',2,'escape_done')
    p.branch_false('056D',G('ambient2'),target='escape_fallback')
    positive('escapeBike','escape_fallback')
    p.branch_false('0119',G('escapeBike'),target='escape_riding_alive');p.go('escape_fallback')
    p.label('escape_riding_alive')
    p.branch_false('00DB',G('ambient2'),G('escapeBike'),target='escape_fallback')
    p.emit('046C',G('escapeBike'),G('escapeDriver'))
    p.branch_false('003A',G('escapeDriver'),G('ambient2'),target='escape_fallback')
    p.emit('00AA',G('escapeBike'),G('escapeBikeX'),G('escapeBikeY'),G('escapeBikeZ'))
    p.branch_false('001C',G('nativeTimer'),G('escapeNotBefore'),target='escape_wait_distance')
    p.branch_false('01AF',G('escapeBike'),G('escapeStartX'),G('escapeStartY'),F(11.2),F(6),F(6),F(5),I(0),target='escape_departed')
    p.label('escape_wait_distance')
    p.branch_false('001C',G('nativeTimer'),G('escapeDeadline'),target='escape_done');p.go('escape_fallback')
    p.label('escape_departed')
    p.set('escapeDeparted',1);p.set('escapeState',3);unlock_arrival('departed');p.go('escape_done')
    p.label('escape_fallback')
    p.set('escapeState',4);unlock_arrival('escape_fallback')
    p.branch_false('056D',G('ambient2'),target='escape_done')
    p.branch_false('0118',G('ambient2'),target='escape_fallback_alive');p.go('escape_done')
    p.label('escape_fallback_alive')
    # Do not knock a seated rider off a slowly starting bike. Only an on-foot
    # failed boarding task disperses on foot; no fabricated departure record.
    p.branch_false('00DF',G('ambient2'),target='escape_fallback_foot');p.go('escape_done')
    p.label('escape_fallback_foot');p.emit('011C',G('ambient2'));p.emit('01D0',G('ambient2'),G('player'))
    p.label('escape_done')
    # Separate native camera/proximity observations for both outsider guests.
    # A successful spawn, brief distant glimpse, or actor still seated does not
    # entitle the UI to ask the question. Facts persist in the immutable C1 record.
    p.label('arrival_observation')
    eq('scene',1,'arrival_observation_done')
    p.branch_false('0028',G('arrivalStage'),I(3),target='arrival_observation_done')
    p.branch_false('0018',G('arrivalStage'),I(5),target='arrival_observation_active');p.go('arrival_observation_done')
    p.label('arrival_observation_active')
    for label,actor in [('Pudge',2),('Steve',1)]:
        seen=f'arrival{label}Seen';since=f'arrival{label}VisibleSince';prefix=f'arrival_observe_{label.lower()}'
        eq(seen,0,prefix+'_done')
        p.branch_false('056D',G(f'ambient{actor}'),target=prefix+'_reset')
        p.branch_false('0118',G(f'ambient{actor}'),target=prefix+'_alive');p.go(prefix+'_reset')
        p.label(prefix+'_alive')
        p.branch_false('00DB',G(f'ambient{actor}'),G('target0_handle'),target=prefix+'_outside');p.go(prefix+'_reset')
        p.label(prefix+'_outside')
        p.branch_false('02CB',G(f'ambient{actor}'),target=prefix+'_reset')
        p.branch_false('0104',G('ped'),G(f'ambient{actor}'),F(18),F(18),F(5),I(0),target=prefix+'_reset')
        eq(since,0,prefix+'_elapsed')
        copy(since,'nativeTimer');p.emit('0008',G(since),I(600));p.go(prefix+'_done')
        p.label(prefix+'_elapsed');p.branch_false('001C',G('nativeTimer'),G(since),target=prefix+'_done')
        p.set(seen,1);p.go(prefix+'_done')
        p.label(prefix+'_reset');p.set(since,0)
        p.label(prefix+'_done')
    p.label('arrival_observation_done')
    eq('scene',2,'shooting');p.go('car_gameplay')
    p.label('shooting')
    eq('pickupCollected',0,'weapon_ready')
    positive('pickup','pickup_wait')
    p.branch_false('0214',G('pickup'),target='pickup_wait')
    p.set('pickupCollected',1);p.emit('01B8',G('player'),G('weapon'))
    clean('pickupBlip','0164','pickup_blip_removed');p.go('weapon_ready')
    p.label('pickup_wait')
    eq('scene',1,'pickup_wait_not_first')
    positive('pickup','pickup_wait_done')
    p.emit('03A1',G('firstPickupX'),G('firstPickupY'),G('firstPickupZ'),F(2.1));p.go('pickup_wait_done')
    p.label('pickup_wait_not_first')
    eq('scene',3,'pickup_wait_done')
    p.emit('03A1',*xyz(SCENES[2]['pickup']),F(2.4))
    p.label('pickup_wait_done');p.go('check_timeout')
    p.label('weapon_ready');p.emit('0419',G('player'),G('weapon'),G('ammo'));p.emit('046F',G('player'),G('currentWeapon'))
    eq('scene',3,'after_heli_route')
    p.branch_false('0119',G('target2_handle'),target='heli_alive');p.go('after_heli_route')
    p.label('heli_alive');p.emit('00AA',G('target2_handle'),G('heliX'),G('heliY'),G('heliZ'))
    eq('heliRoute',1,'heli_return');p.branch_false('0020',G('heliX'),F(FINALE_HELI_RIGHT[0]-2),target='after_heli_route')
    p.emit('04A2',G('target2_handle'),*xyz(FINALE_HELI_LEFT),I(2));p.set('heliRoute',2);p.go('after_heli_route')
    p.label('heli_return');p.branch_false('0022',F(FINALE_HELI_LEFT[0]+2),G('heliX'),target='after_heli_route')
    p.emit('04A2',G('target2_handle'),*xyz(FINALE_HELI_RIGHT),I(2));p.set('heliRoute',1)
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
    for stage,position in enumerate(SCENES[1]['route']):
        eq('routeStage',stage,f'marker_route_next{stage}')
        p.emit('03A1',*xyz(position),F(6 if stage==2 else 8));p.go('marker_done')
        p.label(f'marker_route_next{stage}')
    p.go('marker_done')
    p.label('marker_car');p.emit('00AA',G('target0_handle'),G('heliX'),G('heliY'),G('heliZ'))
    p.emit('03A1',G('heliX'),G('heliY'),G('heliZ'),F(3))
    p.label('marker_done')
    eq('chaseStage',1,'no_heli_follow')
    p.branch_false('001C',G('nativeTimer'),G('chaseHeliUpdate'),target='no_heli_follow')
    positive('chaseHeli','no_heli_follow')
    p.emit('04A2',G('chaseHeli'),G('playerX'),G('playerY'),F(30),I(8))
    copy('chaseHeliUpdate','nativeTimer');p.emit('0008',G('chaseHeliUpdate'),I(1200))
    p.label('no_heli_follow')
    # The abandoned original driver cannot invalidate an already completed carjack.
    eq('hijacked',1,'check_driver_alive');p.go('driver_alive')
    p.label('check_driver_alive')
    p.branch_false('0118',G('driver'),target='driver_alive');p.set('outcome',4);p.go('finish_scene')
    p.label('driver_alive');p.branch_false('0119',G('target0_handle'),target='car_alive');p.set('outcome',4);p.go('finish_scene')
    p.label('car_alive');p.branch_false('00DB',G('ped'),G('target0_handle'),target='car_player_out')
    p.emit('046C',G('target0_handle'),G('carDriver'))
    p.branch_false('003A',G('carDriver'),G('ped'),target='car_player_out');p.set('inCar',1)
    p.branch_false('00DB',G('driver'),G('target0_handle'),target='hijacked');p.go('check_timeout')
    p.label('hijacked');p.set('hijacked',1)
    eq('chaseActivated',0,'chase_already_active')
    if SCRIPTED_PURSUIT_ENABLED:
        p.emit('00A7',G('copCar'),F(278),F(-1095),F(11));p.emit('00AF',G('copCar'),I(3))
    p.set('chaseActivated',1)
    p.label('chase_already_active')
    # Two bounded civilian encounters, released only after the player really
    # occupies the designated driver's seat. Native traffic AI follows restored
    # road nodes with a cautious style and moderate cruise speed.
    p.label('street_drive_gameplay')
    for i,traffic in enumerate(ONCOMING_TRAFFIC):
        eq(f'trafficState{i}',0,f'traffic_active{i}')
        p.branch_false('0028',G('routeStage'),I(traffic['routeStage']),target=f'traffic_done{i}')
        positive(f'traffic{i}',f'traffic_disable{i}')
        p.branch_false('0119',G(f'traffic{i}'),target=f'traffic_car_valid{i}');p.go(f'traffic_disable{i}')
        p.label(f'traffic_car_valid{i}')
        p.branch_false('056D',G(f'trafficDriver{i}'),target=f'traffic_disable{i}')
        p.emit('0519',G(f'traffic{i}'),I(0))
        p.emit('00AD',G(f'traffic{i}'),F(traffic['speed']))
        p.emit('00AE',G(f'traffic{i}'),I(0))
        p.emit('02C2',G(f'traffic{i}'),*xyz(traffic['destination']))
        copy(f'trafficExpire{i}','nativeTimer');p.emit('0008',G(f'trafficExpire{i}'),I(45000))
        p.set(f'trafficState{i}',1);p.go(f'traffic_done{i}')
        p.label(f'traffic_active{i}')
        eq(f'trafficState{i}',1,f'traffic_done{i}')
        p.branch_false('001C',G('nativeTimer'),G(f'trafficExpire{i}'),target=f'traffic_done{i}')
        # Never pop a passing car out of view. The scene transition is the final
        # cleanup bound if the player keeps watching a stalled/finished vehicle.
        p.branch_false('02CA',G(f'traffic{i}'),target=f'traffic_disable{i}');p.go(f'traffic_done{i}')
        p.label(f'traffic_disable{i}')
        clean_ambient(f'trafficDriver{i}',f'traffic_retired_driver{i}')
        clean(f'traffic{i}','00A6',f'traffic_retired_car{i}')
        p.set(f'trafficState{i}',2)
        p.label(f'traffic_done{i}')
    # RC4.6 street-observation ABI remains reserved, but the outsider cast and
    # its question now belong only to the helicopter scene.
    p.label('street_observation_done')
    eq('routeStage',0,'drive_past_ramp')
    p.branch_false('01AF',G('target0_handle'),*xyz(DRIVE_MIDPOINT),F(22),F(25),F(8),I(0),target='check_timeout')
    p.set('chaseStage',1);p.set('routeStage',1)
    if SCRIPTED_PURSUIT_ENABLED:
        p.set('missionHeat',5)
        p.emit('00A5',I(PATROL_HELI_MODEL),F(272),F(-1205),F(32),G('chaseHeli'))
        p.emit('0229',G('chaseHeli'),I(0),I(1))
        p.emit('04DF',G('chaseHeli'),I(1));p.emit('0519',G('chaseHeli'),I(0))
        p.emit('02AC',G('chaseHeli'),I(1),I(1),I(1),I(1),I(1))
        p.emit('04A2',G('chaseHeli'),G('playerX'),G('playerY'),F(30),I(8))
        copy('chaseHeliUpdate','nativeTimer');p.emit('0008',G('chaseHeliUpdate'),I(1200))
    p.go('check_timeout')
    # Drive through successive real road zones. No stop timer, passenger,
    # delivery task or return trip can interrupt this continuous route.
    p.label('drive_past_ramp')
    for stage,position in enumerate(SCENES[1]['route'][1:],1):
        nxt=f'drive_next_zone{stage}'
        eq('routeStage',stage,nxt)
        p.branch_false('01AF',G('target0_handle'),*xyz(position),
                       F(7 if stage==1 else 12),F(10 if stage==1 else 16),F(6),I(0),target='check_timeout')
        if stage==len(SCENES[1]['route'])-1:
            p.set('driveCompleted',1);p.set('outcome',1);p.go('finish_scene')
        else:
            p.set('routeStage',stage+1);p.go('check_timeout')
        p.label(nxt)
    p.go('check_timeout')
    p.label('car_player_out');p.go('check_timeout')
    p.label('check_timeout')
    # Driving is open-ended. Only the native route or loss of the car ends it.
    eq('scene',2,'timed_scene');p.go('native_loop')
    p.label('timed_scene');p.branch_false('001C',G('nativeTimer'),G('sceneDeadline'),target='native_loop')
    p.set('outcome',3);p.go('finish_scene')
    p.label('finish_scene')
    for i in ARRIVAL_ACTORS:clean_ambient(f'ambient{i}',f'finish_no_ambient{i}')
    clean('escapeBike','00A6','finish_no_bike');p.set('mapValid',0)
    p.set('ambientState',3)
    clean_street('finish')
    clean_ambient('courier','finish_no_courier');clean('streetTaxi','00A6','finish_no_taxi')
    positive('copCar','no_finish_cop');p.emit('0397',G('copCar'),I(0));p.label('no_finish_cop')
    clean('chaseHeli','00A6','finish_no_heli');p.set('missionHeat',0)
    p.emit('01B4',G('player'),I(0));p.emit('0110',G('player'));p.emit('01F0',I(0));p.set('policeAlert',0)
    for n in range(1,4):
        eq('scene',n,f'not_save{n}')
        for key in RECORD_KEYS:copy(f'record{n}_{key}',key)
        if n==1:
            copy('record1_arrivalPudgeSeen','arrivalPudgeSeen');copy('record1_arrivalSteveSeen','arrivalSteveSeen')
            copy('record1_escapeEntered','escapeEntered');copy('record1_escapeDeparted','escapeDeparted')
        if n==2:copy('record2_cameoSeen','cameoSeen')
        p.set(f'record{n}_completed',1);p.go('finish_commit');p.label(f'not_save{n}')
    p.label('finish_commit');p.set('completed',1);p.set('phase',3);p.go('native_loop')
    for scene in SCENES:
        n=scene['scene'];p.label(f'prepare{n}');eq(f'record{n}_completed',1,f'new_scene{n}')
        for key in RECORD_KEYS:copy(key,f'record{n}_{key}')
        if n==1:
            copy('arrivalPudgeSeen','record1_arrivalPudgeSeen');copy('arrivalSteveSeen','record1_arrivalSteveSeen')
            copy('escapeEntered','record1_escapeEntered');copy('escapeDeparted','record1_escapeDeparted')
        if n==2:copy('cameoSeen','record2_cameoSeen')
        p.set('completed',1);p.set('phase',3);p.go('native_loop')
        p.label(f'new_scene{n}');p.set('phase',0);p.emit('01B4',G('player'),I(0))
        p.branch_false('00DF',G('ped'),target=f'not_old_car{n}');p.emit('0362',G('ped'),*xyz(scene['spawn']));p.label(f'not_old_car{n}')
        p.emit('0110',G('player'));p.emit('01F0',I(0))
        for key,op in [('driver','009B'),('cop','009B'),('copCar','00A6'),('pickup','0215'),('pickupBlip','0164'),('routeBlip','0164'),('chaseHeli','00A6'),('streetTaxi','00A6')]:clean(key,op,f'clean_{n}_{key}')
        for i in ARRIVAL_ACTORS:clean_ambient(f'ambient{i}',f'clean_{n}_ambient{i}')
        clean('escapeBike','00A6',f'clean_{n}_bike')
        clean_street(f'clean_{n}')
        clean_ambient('courier',f'clean_{n}_courier')
        for key in ['hijacked','driveCompleted','inCar','wanted','shotHit','policeAlert','policeAlertUntil','pickupCollected','chaseStage','chaseActivated','missionHeat','chaseHeliUpdate','heliRoute','sceneDeadline','completed','outcome','emptyDeadline','creditedCount']:p.set(key,0)
        for key in ['ambientState','ambientAttackUntil','ambientRemoveAt']:p.set(key,0)
        for key in ['routeStage','courierStopUntil','courierRetryAt','courierBoarding','courierAttempts','courierInCar','arrivalStage','arrivalDeadline','arrivalExited','arrivalLanded']:p.set(key,0)
        for key in ['arrivalRunUpdate','trafficState0','trafficState1','trafficExpire0','trafficExpire1','cameoSeen','cameoVisibleSince']:p.set(key,0)
        for key in ['arrivalPudgeSeen','arrivalPudgeVisibleSince','arrivalSteveSeen','arrivalSteveVisibleSince','arrivalRunNotBefore']:p.set(key,0)
        for key in ['escapeState','escapeDeadline','escapeRetryAt','escapeAttempts','escapeNotBefore','escapeEntered','escapeDeparted','mapValid','mapTargetKind']:p.set(key,0)
        p.set('escapeDriver',-1)
        p.set('carDriver',-1)
        p.set('scene',n)
        for i in range(3):
            t=f'target{i}';clean(t+'_handle','00A6',f'old_target{n}_{i}')
            for key in ['health','credited','destroyed','baseline','rpgHit']:p.set(t+'_'+key,0)
        p.emit('04D7',G('ped'),I(0));p.set('playerFrozen',0)
        p.emit('00A1',G('ped'),*xyz(scene['spawn']));p.emit('0173',G('ped'),F(180))
        p.emit('03B8',G('player'));p.set('weapon',scene['weapon']);p.set('ammoInitial',scene['ammo']);p.set('ammo',scene['ammo'])
        if n==3:pickup_for(scene)
        elif n==2:p.set('pickupCollected',1)
        # C1's pickup is released by the arrival, never by background prepare.
        p.set('targetCount',len(scene['positions']))
        for i,position in enumerate(scene['positions']):
            target=G(f'target{i}_handle');p.emit('00A5',I(scene['targetModels'][i]),*xyz(position),target)
            p.emit('0175',target,F(scene.get('targetHeading',180)));p.emit('0229',target,I(0 if scene['targetModels'][i]==156 else 3),I(1 if scene['targetModels'][i]==156 else 6))
            if scene['targetModels'][i]==PATROL_HELI_MODEL:p.emit('0229',target,I(0),I(1))
            p.emit('0224',target,I(scene.get('targetHealth',450 if n==3 else 350 if n==1 else 1000)));p.emit('03F5',target,I(1))
            if scene.get('landingTarget'):
                # Held above the road while hidden/warmed; start releases the
                # native flight task, so the arrival never plays behind A/B.
                p.emit('0519',target,I(1));p.emit('04DF',target,I(1))
            if n==3 and i==2:p.emit('0519',target,I(1));p.emit('02AA',target,I(1))
            p.emit('02AC',target,I(1),I(1),I(n!=3),I(1),I(1));p.emit('02AA',target,I(1))
        if n==2:
            p.emit('020A',G('target0_handle'),I(1));p.emit('009A',I(4),I(7),F(284),F(-1100),F(11.2),G('driver'));p.emit('036A',G('driver'),G('target0_handle'));p.emit('0526',G('driver'),I(0))
            for i,traffic in enumerate(ONCOMING_TRAFFIC):
                vehicle=G(f'traffic{i}')
                p.emit('00A5',I(traffic['model']),*xyz(traffic['position']),vehicle)
                p.emit('0175',vehicle,F(349))
                p.emit('0229',vehicle,*(I(c) for c in traffic['colour']))
                p.emit('020A',vehicle,I(2))
                p.emit('0129',vehicle,I(4),I(7),G(f'trafficDriver{i}'))
                p.emit('00AF',vehicle,I(0))
                p.emit('00AD',vehicle,F(0))
            for i,walker in enumerate(STREET_WALKERS):
                actor=G(f'street{i}')
                p.emit('009A',I(4),I(walker['model']),*xyz(walker['position']),actor)
                p.emit('0173',actor,F(0 if i==1 else 180))
                p.emit('048F',actor);p.emit('0291',actor,I(1));p.emit('011A',actor,I(0))
                p.emit('02AB',actor,I(1),I(1),I(1),I(1),I(1))
                p.emit('0192',actor)
            if SCRIPTED_PURSUIT_ENABLED:
                p.emit('00A5',I(156),F(290),F(-1120),F(11.2),G('copCar'));p.emit('0175',G('copCar'),F(0))
                p.emit('009A',I(6),I(1),F(290),F(-1120),F(11.2),G('cop'));p.emit('036A',G('cop'),G('copCar'))
                p.emit('00AD',G('copCar'),F(8));p.emit('00AE',G('copCar'),I(2))
        if n==1:
            p.emit('00A5',I(ESCAPE_BIKE_MODEL),*xyz(ESCAPE_BIKE_POSITION),G('escapeBike'))
            p.emit('0175',G('escapeBike'),F(180));p.emit('00AD',G('escapeBike'),F(0));p.emit('00AF',G('escapeBike'),I(0))
            p.emit('020A',G('escapeBike'),I(1));p.emit('02AC',G('escapeBike'),I(1),I(1),I(1),I(1),I(1))
            p.emit('00A5',I(150),*xyz(STREET_TAXI),G('streetTaxi'))
            p.emit('0175',G('streetTaxi'),F(180));p.emit('0229',G('streetTaxi'),I(6),I(6))
            p.emit('0216',G('streetTaxi'),I(1))
            p.emit('02AC',G('streetTaxi'),I(1),I(1),I(1),I(1),I(1))
            p.emit('020A',G('target0_handle'),I(1))
            for i,model in enumerate(ARRIVAL_CREW_MODELS):
                ped=G(f'ambient{i}')
                if i==0:p.emit('0129',G('target0_handle'),I(4),I(model),ped)
                else:p.emit('01C8',G('target0_handle'),I(4),I(model),I(i-1),ped)
                p.emit('048F',ped);p.emit('0291',ped,I(1));p.emit('011A',ped,I(0))
                p.emit('02AB',ped,I(1),I(1),I(1),I(1),I(1))
        p.emit('02EB');p.emit('032A',I(2));p.emit('0373');p.emit('0001',I(1400));p.emit('04D7',G('ped'),I(0));p.emit('0373')
        if n==1:
            p.emit('0519',G('streetTaxi'),I(1))  # settle on road first
            p.emit('0519',G('escapeBike'),I(1))
        if n==2:
            for i in range(2):p.emit('0519',G(f'traffic{i}'),I(1))
            for i in range(3):p.emit('04D7',G(f'street{i}'),I(1))
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
        'ambient':{'scene':1,'models':ARRIVAL_CREW_MODELS,'count':len(ARRIVAL_CREW_MODELS),'attackActor':2,
                   'attackMilliseconds':3200,'fleeMilliseconds':4500,'scored':False,
                   'reactionActors':[0,1],'reactionTrigger':'first-native-weapon-hit-and-health-loss','reactionOnce':True,
                   'reactionSemantics':'optional early interruption of the foreground brawl; otherwise timer-driven dispersion',
                   'taxiModel':150,'taxiPosition':STREET_TAXI,'taxiSettlesBeforeFreeze':True,
                   'attackTrigger':'confirmed-native-exit-then-player-directed-run'},
        'arrival':{'scene':1,'model':217,'crewModels':ARRIVAL_CREW_MODELS,'pudgeActor':2,
                   'steveActor':1,'cjLikeActor':0,'dancerActor':3,'passengerSeats':[0,1,2],
                   'airPosition':ARRIVAL_AIR,'landingPosition':ARRIVAL_LANDING,'foreground':ARRIVAL_FOREGROUND,
                   'landingTimeoutMilliseconds':8000,'exitTimeoutMilliseconds':6000,
                   'walkMilliseconds':ARRIVAL_RUN_MS,'runMilliseconds':ARRIVAL_RUN_MS,
                   'runRefreshMilliseconds':ARRIVAL_RUN_REFRESH_MS,'runTarget':'current-player-position',
                   'minimumRunMilliseconds':ARRIVAL_MINIMUM_RUN_MS,
                   'runNearRadiusMetres':4,'brawlMilliseconds':3200,'fleeMilliseconds':4500,
                   'startTrigger':'native-start-command-only','nativeExitRequired':True,
                   'pickupRelease':'confirmed-bike-departure-or-bounded-fallback','scored':False,
                   'observation':{'actors':[2,1],'models':[PUDGE_MODEL,STEVE_MODEL],
                                  'seenFields':['arrivalPudgeSeen','arrivalSteveSeen'],
                                  'storedFields':['record1_arrivalPudgeSeen','record1_arrivalSteveSeen'],
                                  'requiresBothSeen':True,'exposureMilliseconds':600,'radiusMetres':18,
                                  'requiresExitedHelicopter':True,'requiresNativeVisibility':True},
                   'stages':['prepared','landing','exiting','foreground','brawl','flee','finished','fallback']},
        'escape':{'scene':1,'actor':2,'model':ESCAPE_BIKE_MODEL,'position':ESCAPE_BIKE_POSITION,
                  'destination':ESCAPE_BIKE_DESTINATION,'heading':180,'boardingMilliseconds':6500,
                  'boardingRetryMilliseconds':3300,'maximumBoardingAttempts':2,
                  'departureMilliseconds':3500,'minimumRidingMilliseconds':900,'departureBoxHalfExtentMetres':6,
                  'cruiseSpeed':9,'drivingStyle':0,'nativeBoardingRequired':True,'nativeDriverRequired':True,
                  'nativeDepartureRequired':True,'warpAllowed':False,'scored':False,
                  'states':['prepared','boarding','riding','departed','fallback'],
                  'pickupRelease':'departure confirmed or bounded failure; never early score/auto hit',
                  'cleanup':'off-screen after 18s or unconditional finish/prepare'},
        'radar':{'readOnly':True,'nativeTelemetry':True,'worldBounds':[-2000,-2000,2000,2000],
                 'grid':[8,8],'tileMetres':500,'tileIndex':'x + 8 * y; north at top',
                 'targetKinds':{'none':0,'pickup':1,'vehicle':2,'route':3,'helicopter':4},
                 'validOnlyWhilePlaying':True},
        'helicopters':{'arrival':{'model':217,'label':'красный гражданский вертолёт'},
                       'pursuitAndFinale':{'model':PATROL_HELI_MODEL,'label':'патрульный вертолёт',
                          'variant':'supplied Maverick with authored roof pods, searchlight and patrol beacon'}},
        'drive':{'routeStages':['outbound','past-ramp','seafront','southern-bend','rpg'],
                 'passengerRequired':False,'stopRequired':False,'oneDirection':True,'scoredSeparately':False},
        'street':{'scene':2,'traffic':ONCOMING_TRAFFIC,'walkers':STREET_WALKERS,
                  'trafficRelease':'native-driver-confirmed-and-route-stage','trafficMaxCount':2,
                  'trafficDrivingStyle':0,'trafficRetireAfterMilliseconds':45000,
                  'trafficRetireOnlyOffScreen':True,'cameoQuestion':False,
                  'allAmbientScored':False,'allSceneActorsCleanedOnFinish':True},
        'result':{'engine':'vice-city-wasm','version':3,'immutable':True,'nativeOnly':True},
    }
    for scene in public_scenes:
        for field in ('criterion', 'pointsPerTarget', 'targetPoints'):
            scene.pop(field, None)
    target = HERE.parent / 'native-vc'
    (target / 'range.scm').write_bytes(result)
    (target / 'range-config.json').write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    print(f'{count} instructions; {len(result)} bytes; SHA-256 {checksum}')

if __name__ == '__main__':
    main()
