'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');

function harness() {
  const fixture = path.join(__dirname, 'vice-port.test.cjs');
  const source = fs.readFileSync(fixture, 'utf8').split("\ntest('VM contract:")[0];
  const context = {require:createRequire(fixture),__dirname,Buffer,URL,URLSearchParams,TextEncoder,AbortController,Blob,console,module:{exports:{}}};
  vm.runInNewContext(source+'\nmodule.exports=makeHarness;',context,{filename:fixture});
  return context.module.exports({edition:19,continuous:true});
}

test('C1 never tells a player to collect a weapon before the actual pickup exists', async () => {
  const h = harness();
  try {
    await h.boot(); h.playing(1);
    h.setPacket({pickup:-1,pickupCollected:0,arrivalStage:4,escapeState:0,escapeEntered:0}); h.frame();
    assert.match(h.nodes.get('mission-objective').textContent,/Гости не поделили дорогу/);
    assert.equal(h.nodes.get('native-fire').disabled,true);
    h.setPacket({arrivalStage:5,escapeState:1}); h.frame();
    assert.match(h.nodes.get('mission-objective').textContent,/Пудж заметил мотоцикл/);
    h.setPacket({escapeState:2,escapeEntered:1}); h.frame();
    assert.match(h.nodes.get('mission-objective').textContent,/Пудж уезжает/);
    h.setPacket({escapeState:3,escapeDeparted:1,pickup:812}); h.frame();
    assert.match(h.nodes.get('mission-objective').textContent,/Подбери Узи/);
    assert.equal(h.nodes.get('native-fire').disabled,true,'Seeing the pickup is not collecting it');
    h.setPacket({pickupCollected:1}); h.frame();
    assert.match(h.nodes.get('mission-objective').textContent,/Взорви вертолёт/);
    assert.equal(h.nodes.get('native-fire').disabled,false);
  } finally { h.destroy(); }
});
