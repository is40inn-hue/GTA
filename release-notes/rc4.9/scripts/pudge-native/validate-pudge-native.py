#!/usr/bin/env python3
"""Structural and CPU bind-pose acceptance; never claims native GPU execution."""
import importlib.util, json, struct
from pathlib import Path
import numpy as np
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pudge_builder',HERE/'build-pudge-native.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
raw=(HERE/'output/egepudge.dff').read_bytes();native=m.parse_native(HERE/'output/egepudge.dff')
clump=list(m.children(next(m.children(raw))[2]));geomlist=next(x[2] for x in clump if x[0]==0x1a)
geom=next(x[2] for x in m.children(geomlist) if x[0]==15);parts=list(m.children(geom))
g=next(x[2] for x in parts if x[0]==1);flags,nt,nv,nm=struct.unpack_from('<4I',g)
skin=next(payload for kind,_,ext,_ in parts if kind==3 for t,_,payload,_ in m.children(ext) if t==0x116)
joints=np.frombuffer(skin,'u1',nv*4,4).reshape(-1,4)
weights=np.frombuffer(skin,'<f4',nv*4,4+nv*4).reshape(-1,4)
offset=28+nv*8+nt*8+24
positions=np.frombuffer(g,'<f4',nv*3,offset).reshape(-1,3)
assert np.isfinite(positions).all() and np.isfinite(weights).all()
assert joints.max()<24 and weights.min()>=0 and np.max(np.abs(weights.sum(1)-1))<1e-6
frame_for_order={index:native['ids'][bone] for bone,index,flags in native['hierarchy']}
globals_=np.stack([native['global_'][frame_for_order[i]] for i in range(24)])
inverse=np.stack(native['inverse']);identity=globals_@inverse
bind_error=float(np.max(np.abs(identity-np.eye(4))));assert bind_error<1e-5
ph=np.c_[positions,np.ones(nv)]
reconstructed=sum(np.einsum('nij,nj->ni',identity[joints[:,k]],ph)*weights[:,k,None] for k in range(4))[:,:3]
vertex_error=float(np.max(np.linalg.norm(reconstructed-positions,axis=1)));assert vertex_error<1e-5
# Both shoulders share the original, side-correct VC frame chain. Test the
# source-to-native anchor correspondence, not just nonzero weights.
j,b=m.glb(HERE/'source/pudge-candidate.glb');world=m.world_matrices(j);ret=m.make_retarget(native,world)
anchor_errors={}
for bone in (22,23,24,32,33,34):
 source=world[m.ANCHOR[bone]][:,3];target=globals_[native['order'][bone]][:,3]
 error=float(np.max(np.abs(ret[bone]@source-target)));anchor_errors[str(bone)]=error;assert error<1e-8
clavicle_errors={}
for bone,upper in ((21,22),(31,32)):
 source=world[m.ANCHOR[upper]][:,3];target=globals_[native['order'][upper]][:,3]
 error=float(np.max(np.abs(ret[bone]@source-target)));clavicle_errors[str(bone)]=error;assert error<1e-8
 assert np.max(np.abs(np.linalg.svd(ret[bone][:3,:3],compute_uv=False)-1))<1e-8, 'Clavicle skin must not stretch toward the neck'
assert globals_[native['order'][22]][0,3]<0<globals_[native['order'][32]][0,3]
report={'modelID':8,'nativeBones':24,'vertices':nv,'triangles':nt,'inverseBindMaxError':bind_error,
 'reconstructedBindVertexMaxError':vertex_error,'shoulderAnchorMaxErrors':anchor_errors,
 'clavicleOuterAnchorMaxErrors':clavicle_errors,'clavicleSkinUnitScale':True,
 'weightsNormalized':True,'indicesInRange':True,'leftRightNotSwapped':True,
 'nativeGPUExecuted':False,'scope':'CPU structure and bind-pose acceptance only; no claim about actual Vice City animation, seating, clipping or performance.'}
(HERE/'output/validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
