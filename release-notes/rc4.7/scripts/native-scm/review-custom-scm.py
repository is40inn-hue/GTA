#!/usr/bin/env python3
"""Read-only SCM structural review using the fetched primary VC opcode catalogue."""
import json,struct,sys,pathlib
p=pathlib.Path(sys.argv[1]);d=p.read_bytes();db=json.loads((p.parent/'vc-opcodes.json').read_text())
ops={int(c['id'],16):c for e in db['extensions'] if e['name']=='default' for c in e['commands']}
def u32(o):return struct.unpack_from('<I',d,o)[0]
def jump(o):
 assert d[o:o+3]==b'\x02\0\x01',('header jump encoding',o)
 return u32(o+3)
g=jump(0);seg3=jump(g);entry=jump(seg3)
assert d[7]==ord('m'),('VC game ID',d[7])
count=u32(g+8);assert seg3==g+12+count*24,('models size',g,count,seg3)
main_size=u32(seg3+8);largest=u32(seg3+12);missions,exclusive=struct.unpack_from('<HH',d,seg3+16)
assert main_size==len(d),('main_size/file mismatch',main_size,len(d))
assert entry==seg3+20+missions*4,('mission header size',entry,seg3,missions)
assert missions==0 and largest==0 and exclusive==0,('expected standalone',missions,largest,exclusive)
o=entry;rows=[];branches=[];globals_seen=set()
while o<len(d):
 start=o;op=struct.unpack_from('<H',d,o)[0];o+=2;c=ops.get(op&0x7fff)
 assert c,('unknown opcode',start,hex(op))
 params=c.get('input',[])+c.get('output',[]);vals=[]
 assert c.get('num_params',len(params))==len(params),('variable/unsupported parameter count',start,c['name'])
 for pdef in params:
  if pdef.get('type')=='string':
   vals.append(repr(d[o:o+8].split(b'\0')[0].decode('latin1')));o+=8;continue
  t=d[o];o+=1
  if t==1:v=struct.unpack_from('<i',d,o)[0];o+=4
  elif t==2:
   n=struct.unpack_from('<H',d,o)[0];o+=2;globals_seen.add(n)
   assert n%4==0 and 8<=n<g,('global outside reserved region or unaligned',start,n,g)
   v='G'+str(n)
  elif t==3:v='L'+str(struct.unpack_from('<H',d,o)[0]);o+=2
  elif t==4:v=struct.unpack_from('<b',d,o)[0];o+=1
  elif t==5:v=struct.unpack_from('<h',d,o)[0];o+=2
  elif t==6:v=round(struct.unpack_from('<f',d,o)[0],6);o+=4
  else:raise AssertionError(('unexpected operand type',start,c['name'],pdef,t))
  if pdef.get('type')=='label':branches.append((start,v))
  vals.append(v)
 rows.append((start,op,c['name'],vals))
assert o==len(d),('decode size',o,len(d))
boundaries={r[0] for r in rows}
for start,target in branches:assert target in boundaries,('branch target not instruction boundary',start,target)
print('VALID STRUCTURE',str(p),'bytes',len(d),'globals',g,'models',count,'entry',entry,'instructions',len(rows),'branches',len(branches),'max_global',max(globals_seen))
for start,op,name,vals in rows:print(f'{start:6} {op:04X} {name:<38}',', '.join(map(str,vals)))
