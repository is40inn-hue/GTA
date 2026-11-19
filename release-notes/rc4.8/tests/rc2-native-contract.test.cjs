'use strict';

// Emitted-SCM control-flow checks with explicit native-query fixtures.
// This does not execute WASM, render pedestrians, or verify native combat on GPU.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const scriptRoot = path.join(root, 'scripts/native-scm');
const bytes = fs.readFileSync(path.join(root, 'dist/native-vc/range.scm'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'dist/native-vc/range-config.json')));
const contract = JSON.parse(fs.readFileSync(path.join(scriptRoot, 'native-exam-main.contract.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(scriptRoot, 'vc-opcodes.json')));
const commands = new Map(catalog.extensions.find(e => e.name === 'default').commands.map(c => [parseInt(c.id, 16), c]));
const labels = contract.validation.labels;
const fieldAddress = Object.fromEntries(Object.entries(contract.fields).map(([k,v]) => [k, contract.globalByteOffset + v.offset]));
const addressField = Object.fromEntries(Object.entries(fieldAddress).map(([k,v]) => [v,k]));
const hash = data => createHash('sha256').update(data).digest('hex');
const canon = x => Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canon(x[k])])) : x;
const rows = [], rowAt = new Map();
for (let offset = contract.validation.codeStart; offset < bytes.length;) {
  const at = offset, opcode = bytes.readUInt16LE(offset); offset += 2;
  const command = commands.get(opcode); assert(command, 'Known VC opcode at ' + at);
  const args = [];
  for (const param of [...(command.input || []), ...(command.output || [])]) {
    if (param.type === 'string') { args.push(bytes.subarray(offset, offset + 8).toString('latin1').replace(/\0.*$/, '')); offset += 8; continue; }
    const type = bytes[offset++];
    if (type === 1) { args.push(bytes.readInt32LE(offset)); offset += 4; }
    else if (type === 2) { args.push({ global: bytes.readUInt16LE(offset) }); offset += 2; }
    else if (type === 6) { args.push(bytes.readFloatLE(offset)); offset += 4; }
    else throw new Error('Unexpected parameter type ' + type + ' at ' + at);
  }
  const row = { at, opcode, name: command.name, args, next: offset };
  rows.push(row); rowAt.set(at, row);
}

function machine(initial = {}, supplied = {}) {
  const state = Object.assign({ phase: 2, scene: 1, player: 0, ped: 2, pickupCollected: 1, pickup: 50, pickupBlip: -1,
    ambient0: 31, ambient1: 32, ambient2: 33, ambient3: 34, ambientState: 0, nativeTimer: 1000, copCar: -1,
    streetTaxi: -1, courier: -1, carDriver: -1, chaseHeli: -1,
    street0: -1, street1: -1, street2: -1, traffic0: -1, traffic1: -1,
    trafficDriver0: -1, trafficDriver1: -1, trafficState0: 0, trafficState1: 0,
    cameoSeen: 0, cameoVisibleSince: 0, arrivalRunUpdate: 0, arrivalRunNotBefore: 0,
    arrivalPudgeSeen:0,arrivalSteveSeen:0,arrivalPudgeVisibleSince:0,arrivalSteveVisibleSince:0,
    arrivalStage: 0, arrivalDeadline: 0, arrivalExited: 0, arrivalLanded: 0 }, initial);
  const calls = [], writes = [], living = new Set([31,32,33,34,...(supplied.living || [])]);
  let nextHandle = 1000;
  const fixture = Object.assign({ exists: true, dead: false, near: true, collected: false,
    carHealth: {}, deadCars: new Set(), deadActors: new Set(), weaponDamage: {}, carCoords: {},
    occupants: {}, drivers: {}, stoppedCars: new Set(), charCoords: {}, charHeadings: {},
    onScreenChars: new Set(), onScreenCars: new Set() }, supplied);
  function run(from, to) {
    let pc = labels[from], condition = false;
    const stops = (Array.isArray(to) ? to : [to]).map(name => labels[name]);
    const value = v => v && typeof v === 'object' ? state[addressField[v.global]] || 0 : v;
    const put = (dest, next) => { assert(dest && typeof dest.global === 'number'); const name = addressField[dest.global]; assert(name); state[name] = next; writes.push(name); };
    for (let step = 0; step < 500; step++) {
      if (stops.includes(pc)) return pc;
      const row = rowAt.get(pc); assert(row, 'Valid instruction boundary ' + pc); pc = row.next;
      const a = row.args.map(value);
      switch (row.opcode) {
        case 0x00D6: break; // IF
        case 0x0004: case 0x0084: put(row.args[0], a[1]); break;
        case 0x0008: put(row.args[0], a[0] + a[1]); break;
        case 0x0038: case 0x003A: condition = a[0] === a[1]; break;
        case 0x0028: condition = a[0] >= a[1]; break;
        case 0x0018: case 0x001C: condition = a[0] > a[1]; break;
        case 0x0002: pc = a[0]; break;
        case 0x004D: if (!condition) pc = a[0]; break;
        case 0x056D: condition = fixture.exists && living.has(a[0]); break;
        case 0x0118: condition = fixture.dead || fixture.deadActors.has(a[0]); break;
        case 0x00FC: case 0x00F2: condition = fixture.near; break;
        case 0x02CB: condition = fixture.onScreenChars.has(a[0]); break;
        case 0x02CA: condition = fixture.onScreenCars.has(a[0]); break;
        case 0x0104: {
          const left=fixture.charCoords[a[0]],right=fixture.charCoords[a[1]];
          assert(left&&right,'Explicit native character-zone fixture');
          condition=left.every((v,i)=>Math.abs(v-right[i])<=a[i+2]);break;
        }
        case 0x0214: condition = fixture.collected; break;
        case 0x031E: condition = (fixture.weaponDamage[a[0]] || []).includes(a[1]); break;
        case 0x0119: condition = fixture.deadCars.has(a[0]); break;
        case 0x0227: put(row.args[1], fixture.carHealth[a[0]]); break;
        case 0x00AA: {
          const coords = fixture.carCoords[a[0]]; assert(coords, 'Explicit native coordinate fixture');
          for (let i=0;i<3;i++) put(row.args[i+1],coords[i]);
          break;
        }
        case 0x04C4: {
          const p=fixture.charCoords[a[0]] || [290,-1065,11.5];
          const radians=(fixture.charHeadings[a[0]] ?? 180)*Math.PI/180;
          const coords=[p[0]+a[1]*Math.cos(radians)-a[2]*Math.sin(radians),p[1]+a[1]*Math.sin(radians)+a[2]*Math.cos(radians),p[2]+a[3]];
          for(let i=0;i<3;i++)put(row.args[i+4],coords[i]);
          calls.push([row.opcode,a.slice(0,4)]);break;
        }
        case 0x00DB: condition = fixture.occupants[a[1]]?.has(a[0]) || false; break;
        case 0x046C: put(row.args[1], fixture.drivers[a[0]] ?? -1); break;
        case 0x01AF: case 0x01B0: {
          const coords = fixture.carCoords[a[0]]; assert(coords, 'Explicit native car-zone fixture');
          condition = coords.every((coord, i) => Math.abs(coord - a[i + 1]) <= a[i + 4]) &&
            (row.opcode !== 0x01B0 || fixture.stoppedCars.has(a[0]));
          break;
        }
        case 0x009A: {
          const handle = nextHandle++; living.add(handle); put(row.args[5], handle);
          calls.push([row.opcode, [...a.slice(0, 5), handle]]); break;
        }
        case 0x00A5: {
          const handle = nextHandle++; put(row.args[4], handle); fixture.carCoords[handle] = a.slice(1, 4);
          calls.push([row.opcode, [...a.slice(0, 4), handle]]); break;
        }
        case 0x0129: {
          const handle=nextHandle++;living.add(handle);put(row.args[3],handle);
          fixture.drivers[a[0]]=handle;fixture.occupants[a[0]]=new Set([handle]);
          calls.push([row.opcode,[...a.slice(0,3),handle]]);break;
        }
        case 0x032B: { const h=nextHandle++; put(row.args[6],h); calls.push([row.opcode,[...a.slice(0,6),h]]); break; }
        case 0x03DC: { const h=nextHandle++; put(row.args[1],h); calls.push([row.opcode,[a[0],h]]); break; }
        case 0x009B: living.delete(a[0]); calls.push([row.opcode, a]); break;
        case 0x01CA: case 0x01D0: case 0x03A1: case 0x01B8: case 0x0164:
        case 0x00A6: case 0x0192: case 0x01D4: case 0x0211: case 0x02AB:
        case 0x0173: case 0x048F: case 0x0291: case 0x011A: case 0x04DF:
        case 0x0519: case 0x02AC: case 0x00A7: case 0x00AF: case 0x0397:
        case 0x04A2: case 0x0365: case 0x04D0: case 0x01D3: case 0x0239: case 0x01C9:
        case 0x04D7: case 0x00AD: case 0x00AE: case 0x02C2: case 0x0110: case 0x01F0:
        case 0x01B4: calls.push([row.opcode, a]); break;
        default: throw new Error('Unexpected command in focused trace: ' + row.name);
      }
    }
    throw new Error('Trace did not terminate');
  }
  return { state, calls, writes, fixture, run };
}

test('RC4.4 native output preserves grading, ammunition, protocol, and the original ABI prefix', () => {
  assert.deepEqual(bytes, fs.readFileSync(path.join(scriptRoot, 'native-exam-main.scm')));
  assert.equal(hash(bytes), config.sha256); assert.equal(config.sha256, contract.sha256); assert.equal(bytes.length, config.size);
  const gradingKeys = ['scene','action','weapon','model','ammo','burst','pointsPerTarget','targetPoints','targetCount'];
  const semantics = { version:config.version, magic:config.magic, slots:Object.fromEntries(Object.entries(config.slots).filter(([,slot])=>slot<=163)), phases:config.phases,
    commands:config.commands, result:config.result, contentEdition:config.contentEdition,
    scenes:config.scenes.map(scene => Object.fromEntries(gradingKeys.filter(key => key in scene).map(key => [key,scene[key]]))) };
  // Captured from the unchanged RC4 before RC4.2: world geometry and target
  // appearance may change, but the protocol, score weights and ammo may not.
  assert.equal(hash(JSON.stringify(canon(semantics))), 'a898c01f34fa06aa7dbd275398267425e3b8a4a9e2597564b4f03a46dccf461c');
  assert.equal(new Set(Object.values(config.slots)).size, Object.keys(config.slots).length);
  assert.deepEqual(Object.entries(config.slots).filter(([name,slot]) => name.startsWith('ambient')&&slot<=163),
    [['ambient0',158],['ambient1',159],['ambient2',160],['ambientState',161],['ambientAttackUntil',162],['ambientRemoveAt',163]]);
  for (const row of rows) if ([0x0002,0x004D].includes(row.opcode)) assert(rowAt.has(row.args[0]), 'Branch lands on an instruction');
});

test('RC4.4 RPG pickup is two metres ahead at the end of the drive, with one native marker until collection', () => {
  const scene = config.scenes[2];
  assert.deepEqual(scene.spawn, [193,-1500,11.5]);
  assert.deepEqual(scene.spawn,config.scenes[1].route.at(-1),'Driving ends exactly at the RPG scene');
  assert.deepEqual(scene.pickup, [193,-1502,11.5]); assert.equal(scene.pickup[2], scene.spawn[2]);
  assert.equal(Math.hypot(scene.pickup[0]-scene.spawn[0], scene.pickup[1]-scene.spawn[1]), 2);
  assert(Math.abs(scene.positions[0][0]-scene.spawn[0])<=10,'First target remains in front along the road bend');
  const waiting = machine({ scene:3, pickupCollected:0 }); waiting.run('shooting', 'check_timeout');
  const markers = waiting.calls.filter(([op]) => op === 0x03A1);
  assert.equal(markers.length, 1); assert.deepEqual(markers[0][1].slice(0,3), scene.pickup);
  assert(Math.abs(markers[0][1][3] - 2.4) < 0.00001);
  const collected = machine({ scene:3, pickupCollected:0, weapon:30 }, { collected:true });
  collected.run('shooting', 'weapon_ready'); assert.equal(collected.state.pickupCollected, 1);
  assert.equal(collected.calls.some(([op]) => op === 0x03A1), false);
  assert(collected.calls.some(([op,args]) => op === 0x01B8 && args[1] === 30));
  const other = machine({ scene:1, pickupCollected:0,firstPickupX:290,firstPickupY:-1068,firstPickupZ:11.5 }); other.run('shooting','check_timeout');
  assert.deepEqual(other.calls.find(([op]) => op===0x03A1)[1].slice(0,3),[290,-1068,11.5]);
});

// Explicit native-coordinate/occupancy observations: the test VM does not fly
// the helicopter or auto-complete LEAVE_CAR. Real GPU movement remains a gate.
function arrival(initial = {}, supplied = {}) {
  return machine({scene:1,phase:2,arrivalStage:1,target0_handle:101,pickup:-1,pickupCollected:0,
    arrivalDeadline:9000,...initial}, {carCoords:{101:config.arrival.airPosition},
    occupants:{101:new Set([31,32,33,34])},...supplied});
}

test('RC4.4 arrival is dormant during prepare, then native start commands a nonzero landing route', () => {
  const prepared=rows.filter(row=>row.at>=labels.new_scene1&&row.at<labels.prepare2);
  assert.equal(prepared.some(row=>row.opcode===0x04A2),false,'Prewarming cannot play the landing');
  assert.equal(prepared.some(row=>[0x01D3,0x01C9,0x032B].includes(row.opcode)),false,'No hidden exit, fight or Uzi pickup');
  assert(prepared.some(row=>row.opcode===0x0129&&row.args[2]===108));
  assert(prepared.some(row=>row.opcode===0x01C8&&row.args[2]===8&&row.args[3]===1));
  assert(prepared.some(row=>row.opcode===0x01C8&&row.args[2]===107&&row.args[3]===0));
  assert(prepared.some(row=>row.opcode===0x01C8&&row.args[2]===109&&row.args[3]===2));
  assert.equal(prepared.filter(row=>[0x0129,0x01C8].includes(row.opcode)).length,4);
  const m=arrival({phase:1,command:2,requestedScene:1,arrivalStage:0,nativeTimer:1000});
  m.run('dispatch_start','gameplay');
  assert.equal(m.state.phase,2);assert.equal(m.state.arrivalStage,1);assert.equal(m.state.arrivalDeadline,9000);
  const flight=m.calls.find(([op,args])=>op===0x04A2&&args[0]===101);assert(flight);
  assert.deepEqual(flight[1].slice(1,4),config.arrival.landingPosition.map(Math.fround));
  assert.notDeepEqual(config.arrival.airPosition,config.arrival.landingPosition,'No zero-length native flight vector');
  assert.equal(m.calls.some(([op])=>op===0x032B),false);
  const parked=arrival({arrivalStage:0});parked.run('gameplay','ambient_done');
  assert.equal(parked.calls.length,0);
});

test('RC4.6 crew leave only after native road-height arrival, then run to the observed player position', () => {
  const m=arrival({playerX:291,playerY:-1061});m.run('gameplay','ambient_done');
  assert.equal(m.state.arrivalStage,1);assert.equal(m.calls.some(([op])=>op===0x01D3),false);
  m.fixture.carCoords[101]=config.arrival.landingPosition;
  m.run('gameplay','ambient_done');assert.equal(m.state.arrivalStage,2);assert.equal(m.state.arrivalLanded,1);
  assert.deepEqual(m.calls.filter(([op])=>op===0x01D3).map(([,a])=>a[0]),[31,32,33,34]);
  m.run('gameplay','ambient_done');assert.equal(m.state.arrivalStage,2);assert.equal(m.state.arrivalExited,0);
  m.fixture.occupants[101].delete(31);m.fixture.occupants[101].delete(32);
  m.run('gameplay','ambient_done');assert.equal(m.state.arrivalStage,2);assert.equal(m.state.arrivalExited,2);
  assert.equal(m.calls.some(([op])=>op===0x01C9),false);
  m.fixture.occupants[101].delete(33);m.run('gameplay','ambient_done');
  assert.equal(m.state.arrivalExited,3);assert.equal(m.state.arrivalStage,2,'The fourth real passenger must also leave');
  m.fixture.occupants[101].delete(34);m.run('gameplay','ambient_done');
  assert.equal(m.state.arrivalExited,4);assert.equal(m.state.arrivalStage,3);
  const move=m.calls.filter(([op])=>op===0x0239);assert.equal(move.length,4);
  assert.deepEqual(move.map(([,a])=>a.slice(1)),[[291,-1061],[291,-1061],[291,-1061],[291,-1061]]);
  assert.equal(m.state.arrivalDeadline,m.state.nativeTimer+4800);
});

test('RC4.4 short foreground brawl, pickup release, dispersion and cleanup happen once without score writes', () => {
  const m=arrival({arrivalStage:3,arrivalDeadline:1000,nativeTimer:1001},
    {carCoords:{101:config.arrival.landingPosition},occupants:{101:new Set()}});
  m.run('gameplay','ambient_done');assert.equal(m.state.arrivalStage,4);assert.equal(m.state.arrivalDeadline,4201);
  assert.deepEqual(m.calls.filter(([op])=>op===0x01C9).map(([,a])=>a),[[31,33],[32,33],[33,31],[34,32]]);
  assert.equal(m.calls.filter(([op])=>op===0x032B).length,1);assert(m.state.pickup>=0);
  m.state.nativeTimer=4200;m.run('gameplay','ambient_done');assert.equal(m.state.arrivalStage,4);
  m.state.nativeTimer=4202;m.run('gameplay','ambient_done');assert.equal(m.state.arrivalStage,5);
  assert.equal(m.calls.filter(([op])=>op===0x01D0).length,4);
  m.state.nativeTimer=m.state.arrivalDeadline+1;m.run('gameplay','ambient_done');assert.equal(m.state.arrivalStage,6);
  assert.deepEqual(m.calls.filter(([op])=>op===0x009B).map(([,a])=>a[0]),[31,32,33,34]);
  for(let i=0;i<3;i++){m.state.nativeTimer+=10000;m.run('gameplay','ambient_done');}
  assert.equal(m.calls.filter(([op])=>op===0x01C9).length,4);assert.equal(m.calls.filter(([op])=>op===0x032B).length,1);
  assert(m.writes.every(n=>n.startsWith('arrival')||n.startsWith('ambient')||n.startsWith('firstPickup')||['pickup','pickupBlip'].includes(n)), 'Story writes cannot change ammo, deadlines, targets or grade records');
});

test('RC4.4 blocked native flight, blocked doors and missing/dead crew release a playable fallback', () => {
  const cases=[
    [{arrivalStage:1,nativeTimer:9001},{}],
    [{arrivalStage:2,nativeTimer:9001},{carCoords:{101:config.arrival.landingPosition}}],
    [{arrivalStage:2},{exists:false}],
    [{arrivalStage:3,nativeTimer:9001},{deadActors:new Set([33])}],
  ];
  for(const [initial,fixture] of cases){
    const m=arrival(initial,fixture);m.run('gameplay','ambient_done');
    assert.equal(m.state.arrivalStage,7);assert(m.state.pickup>=0,'Fallback leaves a real native weapon pickup');
    assert.equal(m.calls.some(([op])=>op===0x00AB||op===0x0362),false,'No fake landing or ejection warp');
    assert.equal(m.calls.some(([op])=>op===0x01C9),false);
    assert.equal(m.state.outcome||0,0);assert.equal(m.state.completed||0,0);
    const before=m.calls.length;m.run('gameplay','ambient_done');assert.equal(m.calls.length,before,'Fallback runs once');
  }
});

test('RC4.4 an invalid early helicopter ends honestly; a successful Uzi explosion during the brawl still reaches scoring', () => {
  const early=arrival({arrivalStage:1},{deadCars:new Set([101])});
  early.run('gameplay','finish_scene');assert.equal(early.state.outcome,4);
  assert.equal(early.state.target0_destroyed,1);assert.equal(early.state.target0_credited||0,0);
  assert.equal(early.calls.some(([op])=>[0x02AC,0x00AF,0x0519].includes(op)),false,'No property write to a dead/invalid vehicle');
  for(const arrivalStage of [4,5,6,7]){
    const m=arrival({arrivalStage,pickupCollected:1,weapon:23,ammoInitial:40,ammo:37,targetCount:1,
      target0_baseline:320},{deadCars:new Set([101]),carHealth:{101:0},weaponDamage:{101:[23]}});
    m.run('gameplay','ambient_done');assert.equal(m.state.outcome||0,0);
    m.run('after_heli_route','finale_marker');assert.equal(m.state.target0_credited,1);
  }
});

test('RC4.4 all scene crew are cleaned on terminal transition including an interrupted arrival', () => {
  for(const scene of [1,2,3])for(let arrivalStage=0;arrivalStage<8;arrivalStage++){
    const m=machine({scene,arrivalStage});m.run('finish_scene','no_finish_cop');
    assert.deepEqual(m.calls.filter(([op])=>op===0x009B).map(([,a])=>a[0]),[31,32,33,34]);
    assert.deepEqual([m.state.ambient0,m.state.ambient1,m.state.ambient2,m.state.ambient3],[-1,-1,-1,-1]);
  }
  assert.deepEqual(rows.filter(row=>row.opcode===0x0247).map(row=>row.args[0]),[7,8,107,108,109,1,130,150,156,217,282,287]);
  const model=fs.readFileSync(path.join(root,'dist/native-vc/runtime/remote/models/gta3.img/male01.dff'));
  assert.equal(hash(model),'e354e60f0ceef6eb14960c4cdd612f51f1715b437cf2c41a73b05a2c10e02b4f','Existing human/player model is not replaced');
});

test('RC4.4 C1 protects the native landing, then permits real bullet/fire target damage', () => {
  const scene=config.scenes[0],target=fieldAddress.target0_handle;
  assert.deepEqual(scene.targetModels,[217]);assert.equal(scene.landingTarget,true);
  const prepared=rows.filter(row=>row.at>=labels.new_scene1&&row.at<labels.prepare2);
  const targetRows=prepared.filter(row=>row.args[0]?.global===target);
  assert(targetRows.some(row=>row.opcode===0x0519&&row.args[1]===1));
  assert(targetRows.some(row=>row.opcode===0x0224&&row.args[1]===320));
  assert.deepEqual(targetRows.find(row=>row.opcode===0x02AC).args.slice(1),[1,1,1,1,1]);
  const m=arrival({arrivalStage:3,arrivalDeadline:1000,nativeTimer:1001});m.run('gameplay','ambient_done');
  assert.deepEqual(m.calls.find(([op])=>op===0x02AC)[1],[101,0,0,1,1,1]);
  const next=rows.filter(row=>row.at>=labels.new_scene2&&row.at<labels.prepare3);
  assert(next.find(row=>row.opcode===0x00A6&&row.args[0]?.global===target).at<next.find(row=>row.opcode===0x00A5&&row.args[4]?.global===target).at);
});

test('RC4.2 the two peaceful pedestrians react once to a native-confirmed first hit, without changing attack or score state', () => {
  const initial={scene:1,weapon:23,target0_handle:101,target0_baseline:320,target0_health:300,target0_rpgHit:0};
  const m=machine(initial,{weaponDamage:{101:[23]}});
  m.run('bullet0','count0');
  assert.deepEqual(m.calls.filter(([op])=>op===0x01D0).map(([,args])=>args[0]),[31,32]);
  assert.equal(m.state.target0_rpgHit,1);assert.equal(m.state.ambientState,0);
  assert(m.writes.every(name=>name==='target0_rpgHit'));
  m.run('bullet0','count0');assert.equal(m.calls.filter(([op])=>op===0x01D0).length,2,'Second hit does not restart fleeing');
  for(const [changes,fixture] of [[{},{}],[{target0_health:320},{weaponDamage:{101:[23]}}],
    [{target0_rpgHit:1},{weaponDamage:{101:[23]}}],[{}, {weaponDamage:{101:[23]},exists:false}],
    [{}, {weaponDamage:{101:[23]},dead:true}]]){
    const other=machine({...initial,...changes},fixture);other.run('bullet0','count0');
    assert.equal(other.calls.some(([op])=>op===0x01D0),false);
  }
});

test('RC4.2 finale draws at most one marker for a surviving uncredited target in every target-state combination', () => {
  assert.deepEqual(config.scenes[2].guidanceOrder,[0,1,2]);
  const carCoords={101:[263,-1308,11.2],102:[258,-1327,11.2],103:[249,-1340,25]};
  for(let mask=0;mask<64;mask++){
    const initial={scene:3};let wanted=-1;
    for(let i=0;i<3;i++){
      const credited=(mask>>(i*2))&1,destroyed=(mask>>(i*2+1))&1;
      Object.assign(initial,{[`target${i}_handle`]:101+i,[`target${i}_credited`]:credited,[`target${i}_destroyed`]:destroyed});
      if(wanted<0&&!credited&&!destroyed)wanted=i;
    }
    const m=machine(initial,{carCoords});m.run('finale_marker','finale_marker_done');
    const markers=m.calls.filter(([op])=>op===0x03A1);
    assert.equal(markers.length,wanted<0?0:1);
    if(wanted>=0)assert.deepEqual(markers[0][1].slice(0,3),carCoords[101+wanted]);
    assert(m.writes.every(name=>['heliX','heliY','heliZ'].includes(name)),'Guidance cannot credit a target or change ammo');
  }
  const other=machine({scene:1},{carCoords});other.run('finale_marker','finale_marker_done');assert.equal(other.calls.length,0);
});

test('RC4.2 C1 draws the promised red marker on the live helicopter after pickup and never on a wreck', () => {
  const carCoords={101:config.scenes[0].positions[0]};
  for(const [credited,destroyed] of [[0,0],[1,0],[0,1],[1,1]]){
    const m=machine({scene:1,target0_handle:101,target0_credited:credited,target0_destroyed:destroyed},{carCoords});
    m.run('c1_target_marker','finale_marker');
    const markers=m.calls.filter(([op])=>op===0x03A1);
    assert.equal(markers.length,!credited&&!destroyed?1:0);
    if(markers.length)assert.deepEqual(markers[0][1],carCoords[101].concat(5));
    assert(m.writes.every(name=>['heliX','heliY','heliZ'].includes(name)));
  }
  const waiting=machine({scene:1,pickupCollected:0,firstPickupX:291,firstPickupY:-1071,firstPickupZ:11.5});waiting.run('shooting','check_timeout');
  const waitingMarkers=waiting.calls.filter(([op])=>op===0x03A1);
  assert.equal(waitingMarkers.length,1,'The only guidance before collection must identify the released weapon');
  assert.deepEqual(waitingMarkers[0][1],[291,-1071,11.5,Math.fround(2.1)]);
  const other=machine({scene:3},{carCoords});other.run('c1_target_marker','finale_marker');assert.equal(other.calls.length,0);
});

test('RC4.2 out-of-order RPG target credit still requires native weapon damage, spent ammo, health loss and destruction', () => {
  const initial={scene:3,ammoInitial:6,ammo:5,targetCount:3};
  for(let i=0;i<3;i++)Object.assign(initial,{[`target${i}_handle`]:101+i,[`target${i}_baseline`]:450});
  const fixture={carHealth:{101:450,102:450,103:0},deadCars:new Set([103]),weaponDamage:{103:[41]}};
  const m=machine(initial,fixture);m.run('after_heli_route','finale_marker');
  assert.equal(m.state.target2_credited,1,'Helicopter can be credited before either car');
  assert.equal(m.state.creditedCount,1);assert.equal(m.state.target0_credited||0,0);assert.equal(m.state.target1_credited||0,0);
  for(const [changes,replacements] of [[{ammo:6},{}],[{}, {weaponDamage:{}}],
    [{},{carHealth:{101:450,102:450,103:450}}],[{}, {deadCars:new Set()}]]){
    const invalid=machine({...initial,...changes},{...fixture,...replacements});
    invalid.run('after_heli_route','finale_marker');assert.equal(invalid.state.target2_credited||0,0);
  }
  assert.equal(m.state.ammo,5,'Credit logic cannot issue ammunition');
});

function drive(initial = {}, supplied = {}) {
  return machine({scene:2,ped:2,driver:10,target0_handle:20,copCar:60,hijacked:1,
    chaseActivated:1,chaseStage:0,routeStage:0,sceneDeadline:151000,...initial},
    {occupants:{20:new Set([2])},drivers:{20:2},carCoords:{20:[...config.scenes[1].positions[0]]},...supplied});
}

test('RC4.4 continuous drive requires every actual road zone and the native driver without stop or passenger gates', () => {
  const m=drive({hijacked:0});m.run('car_gameplay','check_timeout');assert.equal(m.state.hijacked,1);
  const route=config.scenes[1].route;
  const visit=coords=>{m.fixture.carCoords[20]=[...coords];m.state.nativeTimer+=100;m.run('car_gameplay',['check_timeout','finish_scene']);};
  visit(route.at(-1));assert.equal(m.state.driveCompleted||0,0,'Jumping straight to RPG cannot bypass the trip');
  route.forEach((point,i)=>{visit(point);assert.equal(m.state.routeStage,Math.min(i+1,route.length-1));});
  assert.equal(m.state.driveCompleted,1);assert.equal(m.state.outcome,1);assert.equal(m.state.chaseStage,1);
  assert(m.calls.some(([op])=>op===0x04A2),'Native aerial pursuit still joins the drive');
  assert.equal(m.calls.some(([op])=>[0x009A,0x01D4,0x01B0].includes(op)),false,'No courier, passenger door or stationary condition');
  assert(m.writes.every(n=>!n.startsWith('record')),'Only terminal transition can persist grade records');
});

test('RC4.4 on-foot/wrong-seat progress is rejected; leaving and re-entering retains completed driving zones', () => {
  for(const supplied of [{occupants:{20:new Set()},drivers:{20:-1}},{drivers:{20:99}}]){
    const m=drive({routeStage:4},{carCoords:{20:config.scenes[1].route[4]},...supplied});
    m.run('car_gameplay','check_timeout');assert.equal(m.state.driveCompleted||0,0);assert.equal(m.state.inCar,0);
  }
  const m=drive({routeStage:2},{occupants:{20:new Set()},drivers:{20:-1},carCoords:{20:config.scenes[1].route[2]}});
  m.run('car_gameplay','check_timeout');assert.equal(m.state.routeStage,2);
  m.fixture.occupants[20].add(2);m.fixture.drivers[20]=2;m.run('car_gameplay','check_timeout');
  assert.equal(m.state.routeStage,3);assert.equal(m.state.inCar,1);
});

test('RC4.4 one-direction route grows past 400 metres with one marker, unchanged 150 seconds and no blocking waits', () => {
  const route=[config.scenes[1].positions[0],...config.scenes[1].route];
  const distance=route.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-route[i][0],p[1]-route[i][1]),0);
  assert(distance>400&&distance<450);assert(route.slice(1).every((p,i)=>p[1]<route[i][1]));
  assert.equal(config.scenes[1].timeLimitSeconds,150);assert.equal(config.drive.passengerRequired,false);
  assert.equal(config.drive.stopRequired,false);assert.equal(config.drive.oneDirection,true);
  for(let routeStage=0;routeStage<5;routeStage++){
    const m=drive({routeStage});m.run('car_gameplay','marker_done');
    const markers=m.calls.filter(([op])=>op===0x03A1);assert.equal(markers.length,1);
    assert.deepEqual(markers[0][1].slice(0,3),config.scenes[1].route[routeStage]);
  }
  assert.deepEqual(rows.filter(row=>row.opcode===0x0001).map(row=>row.args[0]),[0,1400,1400,1400,100]);
  const m=drive({nativeTimer:151001});m.run('check_timeout','finish_scene');assert.equal(m.state.outcome,3);
  assert.equal(m.state.driveCompleted||0,0,'Timeout cannot invent route completion');
});

test('RC4.4 old courier ABI is reserved and empty; the taxi settles before freezing and all props clean up', () => {
  for(const [key,slot] of Object.entries({streetTaxi:164,routeStage:165,courier:166,courierStopUntil:167,courierRetryAt:168,courierBoarding:169,carDriver:170,courierAttempts:171,courierInCar:172}))assert.equal(config.slots[key],slot);
  assert.equal(rows.some(row=>row.opcode===0x01D4),false);
  assert.equal(rows.some(row=>row.opcode===0x009A&&row.args[5]?.global===fieldAddress.courier),false);
  const own=rows.filter(row=>row.at>=labels.new_scene1&&row.at<labels.prepare2);
  const settle=own.find(row=>row.opcode===0x0001&&row.args[0]===1400);
  const freeze=own.find(row=>row.opcode===0x0519&&row.args[0]?.global===fieldAddress.streetTaxi);
  assert(settle&&freeze&&freeze.at>settle.at,'Taxi gets gravity/contact before it is parked');
  const m=machine({streetTaxi:35});m.run('finish_scene','no_finish_cop');
  assert(m.calls.some(([op,a])=>op===0x00A6&&a[0]===35));assert.equal(config.ambient.scored,false);
});

test('RC4.6 the crew retargets its run to a moving player without restarting the bounded scene', () => {
  const m=arrival({arrivalStage:3,arrivalDeadline:5800,arrivalRunUpdate:1700,
    nativeTimer:1000,playerX:290,playerY:-1065},{near:false});
  m.run('gameplay','ambient_done');assert.equal(m.calls.length,0,'No per-frame task spam');
  Object.assign(m.state,{nativeTimer:1701,playerX:294,playerY:-1062});
  m.run('gameplay','ambient_done');
  assert.deepEqual(m.calls.filter(([op])=>op===0x0239).map(([,a])=>a),
    [[31,294,-1062],[32,294,-1062],[33,294,-1062],[34,294,-1062]]);
  assert.equal(m.state.arrivalDeadline,5800,'Tracking cannot extend the encounter');
  assert.equal(m.state.arrivalRunUpdate,2401);
  m.state.nativeTimer=1750;m.run('gameplay','ambient_done');assert.equal(m.calls.length,4);
  m.fixture.near=true;m.run('gameplay','ambient_done');
  assert.equal(m.state.arrivalStage,4,'Native proximity ends the run near the player');
  assert.equal(m.calls.filter(([op])=>op===0x01C9).length,4);
  assert.equal(m.calls.filter(([op])=>op===0x032B).length,1);
  assert.equal(m.calls.some(([op])=>[0x00A1,0x00AB,0x0362].includes(op)),false,'No crew/player warp');
  const blocked=arrival({arrivalStage:3,arrivalDeadline:5800,nativeTimer:5801},{near:false});
  blocked.run('gameplay','ambient_done');assert.equal(blocked.state.arrivalStage,4);
  assert(blocked.state.pickup>=0,'An unreachable player cannot strand the weapon behind the vignette');
});

test('RC4.6 C2 prepares a bounded street population; walking and driving wait for their native activation gates', () => {
  const prepared=rows.filter(row=>row.at>=labels.new_scene2&&row.at<labels.prepare3);
  const settle=prepared.find(row=>row.opcode===0x0001&&row.args[0]===1400);
  assert.equal(prepared.filter(row=>row.opcode===0x009A&&row.args[1]===107).length,0);
  assert.equal(rows.filter(row=>row.opcode===0x01C8&&row.args[2]===107).length,1,'Steve is a real C1 passenger, not duplicated in C2/C3');
  assert.equal(prepared.some(row=>[0x0211,0x0239,0x02C2].includes(row.opcode)),false,'No walk or drive while hidden/prepared');
  for(let i=0;i<2;i++){
    const handle=fieldAddress['traffic'+i];
    assert.equal(prepared.filter(row=>row.opcode===0x00A5&&row.args[4]?.global===handle).length,1);
    const freeze=prepared.find(row=>row.opcode===0x0519&&row.args[0]?.global===handle);
    assert(freeze.at>settle.at,'Incoming cars settle on the actual road before freeze');
  }
  for(let i=0;i<3;i++){
    const freeze=prepared.find(row=>row.opcode===0x04D7&&row.args[0]?.global===fieldAddress['street'+i]);
    assert(freeze.at>settle.at,'Pedestrians settle before briefing');
  }
  const m=drive({phase:1,command:2,requestedScene:2,street0:41,street1:42,street2:43},{living:[41,42,43]});
  m.run('dispatch_start','gameplay');
  assert.equal(m.state.phase,2);assert.equal(m.state.streetActive,1);assert.equal(m.state.sceneDeadline,151000);
  assert.deepEqual(m.calls.filter(([op])=>op===0x0211).map(([,a])=>a[0]),[41,42,43]);
  assert.equal(m.calls.some(([op])=>op===0x02C2),false,'Traffic still waits for a real carjack');
});

function streetDrive(initial={},supplied={}) {
  return drive({traffic0:70,traffic1:80,trafficDriver0:71,trafficDriver1:81,...initial},
    {living:[71,81,42],...supplied});
}

test('RC4.6 two oncoming cars activate once, in order, only for the genuine driver', () => {
  for(const supplied of [{occupants:{20:new Set()},drivers:{20:-1}},{drivers:{20:99}}]){
    const m=streetDrive({},supplied);m.run('car_gameplay','check_timeout');
    assert.equal(m.calls.some(([op])=>op===0x02C2),false);
    assert.equal(m.state.trafficState0,0);assert.equal(m.state.trafficState1,0);
  }
  const m=streetDrive();m.run('car_gameplay','check_timeout');
  assert.equal(m.state.trafficState0,1);assert.equal(m.state.trafficState1,0);
  assert.deepEqual(m.calls.filter(([op])=>op===0x02C2).map(([,a])=>a),[[70,...config.street.traffic[0].destination.map(Math.fround)]]);
  m.state.nativeTimer+=500;m.run('car_gameplay','check_timeout');
  assert.equal(m.calls.filter(([op])=>op===0x02C2).length,1,'No repeated task issue');
  m.state.routeStage=1;m.run('car_gameplay','check_timeout');
  assert.equal(m.state.trafficState1,1);
  assert.deepEqual(m.calls.filter(([op])=>op===0x02C2).map(([,a])=>a[0]),[70,80]);
  assert.deepEqual(m.calls.filter(([op])=>op===0x00AE).map(([,a])=>a),[[70,0],[80,0]],'Civilian cautious driving');
  assert.deepEqual(m.calls.filter(([op])=>op===0x00AD).map(([,a])=>a),[[70,6.5],[80,7.5]]);
  assert(m.writes.every(n=>!n.startsWith('record')&&!n.match(/^target\d_(credited|destroyed)$/)));
  assert.equal(m.state.driveCompleted||0,0,'Street encounters never complete driving zones');
});

test('RC4.6 expired traffic is removed off camera, never while visibly passing', () => {
  const m=streetDrive({trafficState0:1,trafficState1:2,trafficExpire0:900,nativeTimer:1000},
    {onScreenCars:new Set([70])});
  m.run('street_drive_gameplay','street_observation_done');
  assert.equal(m.state.trafficState0,1);assert.equal(m.calls.some(([op])=>op===0x00A6),false);
  m.fixture.onScreenCars.delete(70);m.run('street_drive_gameplay','street_observation_done');
  assert.equal(m.state.trafficState0,2);assert.equal(m.state.traffic0,-1);assert.equal(m.state.trafficDriver0,-1);
  assert(m.calls.some(([op,a])=>op===0x009B&&a[0]===71));assert(m.calls.some(([op,a])=>op===0x00A6&&a[0]===70));
});

test('RC4.7 both arrival guests need independent, continuous, nearby native exposure after actually leaving', () => {
  const options={arrivalStage:3};
  const observation={onScreenChars:new Set([32,33]),charCoords:{2:[290,-1065,11.5],32:[291,-1075,11.2],33:[289,-1074,11.2]},occupants:{101:new Set()}};
  const m=arrival(options,observation);m.run('arrival_observation','arrival_observation_done');
  assert.equal(m.state.arrivalPudgeSeen,0);assert.equal(m.state.arrivalPudgeVisibleSince,1600);assert.equal(m.state.arrivalSteveVisibleSince,1600);
  m.state.nativeTimer=1500;m.fixture.onScreenChars.delete(33);m.run('arrival_observation','arrival_observation_done');
  assert.equal(m.state.arrivalPudgeVisibleSince,0,'An interrupted glimpse restarts only that guest');
  m.state.nativeTimer=1601;m.run('arrival_observation','arrival_observation_done');assert.equal(m.state.arrivalSteveSeen,1);assert.equal(m.state.arrivalPudgeSeen,0);
  m.fixture.onScreenChars.add(33);m.state.nativeTimer=1700;m.run('arrival_observation','arrival_observation_done');
  m.state.nativeTimer=2300;m.run('arrival_observation','arrival_observation_done');assert.equal(m.state.arrivalPudgeSeen,0);
  m.state.nativeTimer=2301;m.run('arrival_observation','arrival_observation_done');assert.equal(m.state.arrivalPudgeSeen,1);
  m.fixture.onScreenChars.clear();m.run('arrival_observation','arrival_observation_done');assert.equal(m.state.arrivalPudgeSeen,1,'An observed guest stays observed');
  assert(m.writes.every(n=>!n.startsWith('record')&&!n.match(/^target\d_(credited|destroyed)$/)));
  for(const supplied of [
    {onScreenChars:new Set()},
    {charCoords:{2:[290,-1065,11.5],32:[291,-1075,11.2],33:[330,-1074,11.2]}},
    {deadActors:new Set([33])},
    {occupants:{101:new Set([33])}}
  ]){
    const no=arrival(options,{...observation,...supplied});
    no.run('arrival_observation','arrival_observation_done');no.state.nativeTimer=5000;no.run('arrival_observation','arrival_observation_done');
    assert.equal(no.state.arrivalPudgeSeen,0,'Offscreen, far, dead or still-seated guests cannot trigger the question');
  }
});

test('RC4.6 terminal transitions clean every extra actor while retaining the observed C2 fact', () => {
  for(const outcome of [1,3,4]){
    const m=streetDrive({scene:2,outcome,cameoSeen:1,street0:41,street1:42,street2:43,
      ambient0:-1,ambient1:-1,ambient2:-1,ambient3:-1,driveCompleted:outcome===1?1:0},
      {living:[41,42,43,71,81]});
    m.run('finish_scene','native_loop');
    assert.equal(m.state.phase,3);assert.equal(m.state.completed,1);
    assert.equal(m.state.cameoSeen,1);assert.equal(m.state.record2_cameoSeen,1);
    assert.equal(m.state.record2_outcome,outcome);assert.equal(m.state.record2_hijacked,1);
    assert.deepEqual(m.calls.filter(([op])=>op===0x009B).map(([,a])=>a[0]).sort((a,b)=>a-b),[41,42,43,71,81]);
    for(const key of ['street0','street1','street2','traffic0','traffic1','trafficDriver0','trafficDriver1'])assert.equal(m.state[key],-1);
    m.state.cameoSeen=0;const count=m.calls.length;m.run('prepare2','native_loop');
    assert.equal(m.state.cameoSeen,1,'Completed-scene restoration also restores observation');
    assert.equal(m.calls.length,count,'Restoring an immutable result does not respawn traffic');
  }
});

test('RC4.7 unified cast and street metadata preserve all RC4.6 ABI addresses', () => {
  assert.equal(config.street.cameoQuestion,false);assert.equal(config.street.traffic.length,2);
  assert.deepEqual(config.street.walkers.map(x=>x.model),[7,7,1]);
  assert.deepEqual(config.arrival.crewModels,[108,107,8,109]);assert.deepEqual(config.arrival.passengerSeats,[0,1,2]);
  for(const name of ['arrivalRunUpdate','traffic0','traffic1','street0','street1','street2','cameoSeen','cameoVisibleSince','record2_cameoSeen'])assert(config.slots[name]>176);
  assert.equal(config.slots.arrivalStage,173);assert.equal(config.slots.arrivalLanded,176);
  assert.equal(config.arrival.observation.requiresNativeVisibility,true);assert.equal(config.arrival.observation.requiresBothSeen,true);
  assert.equal(config.slots.ambient3,193);assert.equal(config.slots.arrivalPudgeSeen,197);assert.equal(config.slots.arrivalSteveSeen,199);
  assert.equal(config.slots.record2_cameoSeen,192);assert.equal(config.slots.record1_arrivalPudgeSeen,202);assert.equal(config.slots.record1_arrivalSteveSeen,203);
  assert.equal(config.street.allAmbientScored,false);
  assert(config.street.traffic.every(t=>t.destination[1]>t.position[1]),'Incoming cars travel north against the southbound player');
});

test('RC4.7 pickup is created once in front of the current player instead of their old spawn', () => {
  for(const [position,heading,expected] of [[[290,-1080,11.5],180,[290,-1083,11.5]],[[300,-1070,11.5],90,[297,-1070,11.5]]]){
    const m=arrival({arrivalStage:3,nativeTimer:5000,arrivalDeadline:4999},{charCoords:{2:position},charHeadings:{2:heading}});
    m.run('gameplay','ambient_done');
    assert.deepEqual(m.calls.find(([op])=>op===0x04C4)[1],[2,0,3,0]);
    const created=m.calls.find(([op])=>op===0x032B)[1].slice(3,6);
    for(let i=0;i<3;i++)assert(Math.abs(created[i]-expected[i])<0.00001);
    assert.notDeepEqual(created,config.scenes[0].pickup,'The weapon must follow the player who moved during the landing');
    m.run('gameplay','ambient_done');assert.equal(m.calls.filter(([op])=>op===0x032B).length,1);
  }
});

test('RC4.7 a close player still sees a short approach and C1 facts survive finish and restoration', () => {
  const m=arrival({arrivalStage:3,arrivalRunNotBefore:2200,arrivalDeadline:5800,arrivalRunUpdate:1700,nativeTimer:1000},{near:true});
  m.run('gameplay','ambient_done');assert.equal(m.state.arrivalStage,3,'No instant scuffle at the exit door');
  m.state.nativeTimer=2201;m.run('gameplay','ambient_done');assert.equal(m.state.arrivalStage,4);
  m.state.arrivalPudgeSeen=1;m.state.arrivalSteveSeen=1;m.state.outcome=1;
  m.run('finish_scene','native_loop');
  assert.equal(m.state.record1_arrivalPudgeSeen,1);assert.equal(m.state.record1_arrivalSteveSeen,1);
  m.state.arrivalPudgeSeen=0;m.state.arrivalSteveSeen=0;const calls=m.calls.length;
  m.run('prepare1','native_loop');assert.equal(m.state.arrivalPudgeSeen,1);assert.equal(m.state.arrivalSteveSeen,1);
  assert.equal(m.calls.length,calls,'No second arrival while restoring an immutable C1 score');
});
