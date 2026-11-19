#!/usr/bin/env python3
"""Native RenderWare classroom prop for the *shipped* Vice City WASM engine.

Original authored room / desks / chalkboard, no non-shipped city or classroom
assets.  Teacher WFYBU ID 67 comes from the game's already shipped VC model.
This emits a single simple prelit static object plus a project-authored TXD.
"""
import sys, struct, json, hashlib, importlib.util
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT=Path(__file__).resolve().parents[3]  # dist project root
SCM=ROOT/'release-notes/rc4.9/scripts/native-scm/build-scene-vehicles.py'
RW=ROOT/'release-notes/rc4.9/scripts/block-ped/rw_native.py'
spec=importlib.util.spec_from_file_location('ege_rw_native',RW);rw=importlib.util.module_from_spec(spec);sys.modules[spec.name]=rw;spec.loader.exec_module(rw)
# Use battle-tested project mesh primitives from 4.9, not an external renderer.
spec=importlib.util.spec_from_file_location('ege_scene_mesh',SCM);mod=importlib.util.module_from_spec(spec);sys.modules[spec.name]=mod;spec.loader.exec_module(mod)
M=mod.Mesh

def sector(data): return data+bytes((-len(data))%2048)

def room():
 m=M()
 chalk=(31,68,71); wood=(130,86,62); woodlight=(187,127,80); cream=(239,218,176)
 base=(85,67,62); ink=(46,48,63); paper=(248,239,204); metal=(91,106,106)
 # All coordinates are metres in an authored, single native DFF object.
 # x -5..5, y -5.8..5.8, z 0..4.8.  Camera peers in from the front.
 m.box((-5.1,-5.85,-.17),(5.1,5.85,.05),(153,125,112)) # wooden linoleum
 for i in range(13):
  y=-5.7+i*.9;m.box((-5,y,.06),(5,y+.035,.072),(128,97,86))
 # walls plus openings; the windows face real Vice City sunlight.
 m.box((-5.1,5.7,.06),(5.1,5.82,4.65),cream)
 m.box((-5.17,-5.83,.06),(-5.0,5.82,1.65),cream)
 m.box((5.0,-5.83,.06),(5.17,5.82,1.65),cream)
 m.box((-5.17,-5.83,3.75),(-5.0,5.82,4.73),cream)
 m.box((5.0,-5.83,3.75),(5.17,5.82,4.73),cream)
 m.box((-5.17,-5.83,4.63),(5.17,5.82,4.79),(240,226,198))
 # Side window frames, each 2.2 m wide and with actual in-engine city outside.
 for x in [-5.06,5.06]:
  for y in [-5.4,-2.6,.2,3.0,5.4]:
   m.box((x-.08,y-.07,1.6),(x+.08,y+.07,3.76),(104,72,63))
  m.box((x-.10,-5.4,2.65),(x+.10,5.4,2.72),(104,72,63))
 # Chalkboard / border / clock on back wall.
 m.box((-3.15,5.47,1.62),(3.15,5.67,3.72),(100,71,51))
 m.box((-2.98,5.42,1.79),(2.98,5.50,3.55),chalk)
 m.box((-2.5,5.40,3.10),(0.8,5.405,3.15),(243,238,209))
 for i in range(9):
  m.box((-2.2+i*.26,5.388,2.63),(-2.03+i*.26,5.408,2.66),(180,196,181))
 m.box((3.43,5.40,3.15),(4.17,5.61,3.88),wood)
 m.box((3.52,5.39,3.24),(4.08,5.41,3.78),paper)
 # Teacher's desk and papers.
 def desk(x,y,teacher=False):
  w=2.9 if teacher else 1.65;d=1.0 if teacher else .91;h=.98 if teacher else .81
  m.box((x-w/2,y-d/2,h-.13),(x+w/2,y+d/2,h),woodlight)
  for dx in [-w/2+.15,w/2-.15]:
   for dy in [-d/2+.12,d/2-.12]:
    m.box((x+dx-.055,y+dy-.055,.07),(x+dx+.055,y+dy+.055,h-.13),wood)
  m.box((x-.39,y-.24,h+.006),(x+.36,y+.17,h+.022),paper)
  m.box((x-.39,y-.24,h+.024),(x+.36,y-.21,h+.034),(211,59,96))
  if teacher:
   m.box((x-.44,y-.36,h+.04),(x+.39,y-.29,h+.2),(36,45,66)) # ledger
   m.box((x+1.00,y+.07,h+.04),(x+1.14,y+.20,h+.29),(212,210,179)) # mug
 def chair(x,y):
  m.box((x-.38,y-.28,.40),(x+.38,y+.35,.49),wood)
  m.box((x-.39,y+.28,.43),(x+.39,y+.36,1.17),wood)
  for a in [-.30,.30]:
   m.box((x+a-.035,y-.18,.09),(x+a+.035,y-.12,.40),metal)
   m.box((x+a-.035,y+.24,.09),(x+a+.035,y+.30,.40),metal)
 desk(0,3.55,True);chair(0,4.36)
 for yy in [1.04,-1.4,-3.6]:
  for xx in [-2.35,2.35]: desk(xx,yy);chair(xx,yy-.80)
 # door trim at left of back wall, safety notice on wall, no additional screens.
 m.box((-4.55,5.41,.05),(-3.55,5.6,2.69),wood)
 m.box((-4.45,5.39,.08),(-3.64,5.41,2.55),(74,91,111))
 m.box((3.33,5.39,1.55),(4.30,5.41,2.78),(189,148,101))
 m.box((3.44,5.38,1.69),(4.19,5.40,2.64),paper)
 # Overhead fluorescent panels, as actual game geometry.
 for yy in [-2.4,1.7]:
  for xx in [-2.0,2.0]:
   m.box((xx-.78,yy-.21,4.48),(xx+.78,yy+.21,4.63),(172,162,139))
   m.box((xx-.69,yy-.15,4.46),(xx+.69,yy+.15,4.50),(251,247,222))
 # Exam ticket set piece on foreground desk, catches third in-game camera.
 m.box((-.47,-3.82,.825),(.47,-3.10,.852),(251,246,222))
 m.box((-.35,-3.45,.856),(.35,-3.40,.861),(37,55,94))
 m.box((-.35,-3.31,.856),(.15,-3.28,.861),(203,53,104))
 frame=mod.frame_chunk([mod.frame('egeclass',-1)])
 # A plain RW Atomic rather than a vehicle/skin plugin: static scene object.
 atomic=rw.chunk(0x14,rw.chunk(1,struct.pack('<4I',0,0,5,0))+rw.chunk(3,b''))
 dff=rw.chunk(0x10,rw.chunk(1,struct.pack('<III',1,0,0))+frame+rw.chunk(0x1a,rw.chunk(1,struct.pack('<I',1))+m.geometry())+atomic+rw.chunk(3,b''))
 return sector(dff),len(m.p),len(m.f)

def teacher_txd():
 # Self-authored low-res palette. WFYBU geometry is already in provided game.
 atlas=Image.new('RGB',(128,256),(63,53,105));d=ImageDraw.Draw(atlas)
 d.rectangle((0,0,127,40),fill=(180,125,87))
 d.ellipse((16,5,73,94),fill=(204,146,111))
 d.rectangle((0,86,127,256),fill=(69,61,102))
 d.polygon([(51,86),(77,86),(66,168)],fill=(229,222,192))
 d.polygon([(58,85),(70,85),(66,151)],fill=(150,42,87))
 for x in (32,91):d.line((x,92,x,247),fill=(38,38,72),width=4)
 d.rectangle((0,222,127,255),fill=(55,47,83))
 return sector(rw.write_txd(atlas,'wfybu'))

def main():
 dst=ROOT/'native-vc/intro-assets';dst.mkdir(parents=True,exist_ok=True)
 dff,v,t=room();school=sector(rw.write_txd(Image.new('RGB',(4,4),(242,232,207)),'egeclass'))
 files={'egeclass.dff':dff,'egeclass.txd':school,'wfybu.txd':teacher_txd()}
 for n,b in files.items(): (dst/n).write_bytes(b)
 report={'nativeEngine':'shipped Vice City WASM','roomModelId':5035,'teacherModelId':67,
  'model':'author-built prelit RenderWare classroom','vertexCount':v,'triangleCount':t,
  'bytes':{n:len(b) for n,b in files.items()},'sha256':{n:hashlib.sha256(b).hexdigest() for n,b in files.items()},
  'gpuVerified':False,'teacher':{'baseDFF':'already shipped WFYBU','suitTXD':'authored 128x256 pixel atlas'}}
 (dst/'provenance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__': main()
