"""Static native contract checks; runtime evidence lives in docs/qa-police-response."""
import hashlib,json,pathlib,re
root=pathlib.Path(__file__).resolve().parents[2]
source=(root/'scripts/native-scm/build-native-exam-scm.py').read_text()
contract=json.loads((root/'scripts/native-scm/native-exam-main.contract.json').read_text())
config=json.loads((root/'dist/native-vc/range-config.json').read_text())
scm=(root/'dist/native-vc/range.scm').read_bytes()
assert hashlib.sha256(scm).hexdigest()==config['sha256']==contract['sha256']
assert config['slots']['policeAlert']<64 and config['slots']['policeAlertUntil']<64
assert len(set(config['slots'].values()))==len(config['slots'])
# Recorded historical grading fields are unchanged; this transient alert cannot score.
for s in range(1,4):
 assert 'record%d_policeAlert'%s not in config['slots']
assert "p.emit('01F0',I(0))" in source
assert not re.search(r"p\.emit\('01F0',I\([1-9]",source)
assert "p.emit('00AE',G('copCar'),I(0))" in source
assert not re.search(r"p\.emit\('00AE',G\('copCar'\),I\([23]\)\)",source)
assert source.count("p.emit('0397',G('copCar'),I(1))")==1
assert source.count("p.emit('0397',G('copCar'),I(0))")==2
assert "G('policeAlertUntil'),I(5000)" in source
assert source.index("p.label('hijack_verified')")<source.index("p.emit('0397',G('copCar'),I(1))")<source.index("p.label('drive_check')")
print('PASS: SHA, isolated transient ABI, 5s cutoff, terminal cutoff, no native pursuit/wanted, single confirmed-hijack trigger')
