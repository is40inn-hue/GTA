#!/usr/bin/env python3
"""Build a separate Vice City SCM for an authentic engine-rendered EGE classroom.

This does not modify native-vc/range.scm or any of the practice ABI/score logic.
The native intro has three timed in-engine camera shots and stock WFYBU teacher.
"""
import hashlib, importlib.util, json, struct, sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
BUILDER=ROOT/'release-notes/rc4.9/scripts/native-scm/build-native-exam-scm.py'
spec=importlib.util.spec_from_file_location('vc_intro_base',BUILDER)
m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
P=m.Program;I=m.I;F=m.F;G=m.G
X,Y,Z=m.SPAWN
p=P()
p.emit('0001',I(0))
p.emit('016A',I(0),I(0)) # black while model streaming
p.emit('00C0',I(16),I(45))
p.emit('01B6',I(0))
p.emit('04BB',I(0))
p.emit('04E4',F(X),F(Y))
p.emit('0053',I(0),F(X),F(Y-7.0),F(Z+.1),G('player'))
p.emit('01F5',G('player'),G('ped'))
p.emit('0352',G('ped'),m.S('player2'))
p.emit('01B4',G('player'),I(0))
for model in (5035,67,7):p.emit('0247',I(model))
p.emit('038B')
p.emit('03CB',F(X),F(Y),F(Z))
p.emit('0001',I(350))
# The physical objects, teacher and pupils exist in native VC's streaming world.
p.emit('0107',I(5035),F(X),F(Y),F(Z),G('target0_handle'))
p.emit('009A',I(4),I(67),F(X),F(Y+2.65),F(Z+.06),G('ambient0'))
p.emit('0173',G('ambient0'),F(180.0))
p.emit('04D7',G('ambient0'),I(1))
p.emit('02AB',G('ambient0'),I(1),I(1),I(1),I(1),I(1))
for i,px in enumerate((-2.35,2.35)):
 p.emit('009A',I(4),I(7),F(X+px),F(Y-1.95),F(Z+.06),G(['ambient1','ambient2'][i]))
 p.emit('0173',G(['ambient1','ambient2'][i]),F(0.0))
 p.emit('04D7',G(['ambient1','ambient2'][i]),I(1))
# Stage shots. The creator's authored classroom is 10m x 11.6m; all
# camera locations are inside the actual streamed DFF, not web CSS transforms.
def camera(eye,point,cut=2):
 p.emit('015F',F(X+eye[0]),F(Y+eye[1]),F(Z+eye[2]),F(0),F(0),F(0))
 p.emit('0160',F(X+point[0]),F(Y+point[1]),F(Z+point[2]),I(cut))
camera((.25,-5.05,2.15),(0,2.9,2.10));p.emit('016A',I(500),I(1))
p.emit('0001',I(3200))
camera((1.45,-1.05,2.16),(.0,2.67,1.73));p.emit('0001',I(4250))
camera((-.25,-2.70,1.83),(0,-3.46,.84));p.emit('0001',I(3450))
p.emit('016A',I(700),I(0))
p.label('hold');p.emit('0001',I(1000));p.go('hold')
code,listing,labels,count=p.build()
# Native main.scm header matches the verified working RC4.9 compiler.
def skip(to):return struct.pack('<HBi',2,1,to)
header=bytearray(skip(m.GLOBAL_SIZE)+b'm')
header.extend(b'\0'*(m.GLOBAL_SIZE-len(header)))
header+=skip(m.GLOBAL_SIZE+36)+b'\0'+struct.pack('<I',1)+b'\0'*24
header+=skip(m.CODE_START)+b'\0'+struct.pack('<IIHH',m.CODE_START+len(code),0,0,0)
assert len(header)==m.CODE_START,(len(header),m.CODE_START)
result=bytes(header)+code
output=ROOT/'native-vc/intro-assets/intro.scm';output.write_bytes(result)
(HERE/'intro.listing.txt').write_text(listing)
contract={'nativeEngine':'shipped Vice City WASM','type':'standalone scene only; isolated from RC4.9 practice',
          'roomDffId':5035,'teacherPedId':67,'studentsPedId':7,'spawn':m.SPAWN,
          'cameraShots':3,'durationMilliseconds':12000,'instructions':count,'sha256':hashlib.sha256(result).hexdigest(),
          'size':len(result),'gpuVerified':False,'scmValidated':True,'labels':labels}
(output.parent/'intro-contract.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(contract,ensure_ascii=False))
