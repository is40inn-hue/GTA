#!/usr/bin/env python3
"""Validate fitted shoulder skin against shipped sports-bike animation channels.

Only CPU transforms are evaluated. Engine blending, seating offsets, inverse
kinematics and collisions are deliberately outside this report.
"""
from pathlib import Path
import hashlib, importlib.util, json
import numpy as np
HERE=Path(__file__).resolve().parent
sp=importlib.util.spec_from_file_location('pose',HERE/'native-pose-validation.py')
pose=importlib.util.module_from_spec(sp);sp.loader.exec_module(pose)
m=pose.builder
native=m.parse_native(HERE/'output/egepudge.dff')
data=np.load(HERE/'output/native-geometry.npz')
source,b=m.glb(HERE/'source/pudge-candidate.glb');world=m.world_matrices(source)
ret=m.make_retarget(native,world)
fit=[]
for collar,upper in ((21,22),(31,32)):
 axis=world[m.ANCHOR[upper]][:3,3]-world[m.ANCHOR[collar]][:3,3]
 projected=ret[collar][:3,:3]@axis
 scale=float(np.linalg.norm(projected)/np.linalg.norm(axis))
 assert abs(scale-1)<1e-9,'Collar skin was stretched toward the neck'
 endpoint=ret[collar]@world[m.ANCHOR[upper]][:,3]
 error=float(np.linalg.norm(endpoint-native['global_'][native['ids'][upper]][:,3]))
 assert error<1e-8,'Collar outer end is not seated on the upper-arm socket'
 fit.append({'bone':collar,'skinLengthScale':scale,'outerAnchorError':error})
positions,weights,joints=[data[k] for k in ('positions','weights','joints')]
groups={}
for i,p in enumerate(positions):groups.setdefault(tuple(np.round(p,5)),[]).append(i)
pairs=[(g[0],i) for g in groups.values() for i in g[1:]]
package=m.RUNTIME/'remote/models/gta3.img/bikes.ifp'
animations=pose.animation_tracks(package.read_bytes())
reports=[];seam_max=0
for name in ('BIKEs_jumponL','BIKEs_jumponR','BIKEs_Ride','BIKEs_Still','BIKEs_Left','BIKEs_Right'):
 tracks=animations[name]
 for bone in (21,22,31,32):assert tracks[bone]['type']=='KR00','Bike clip overwrites fitted shoulder translations'
 for phase in (0,.25,.5,.75,1):
  transformed=pose.deform(positions,weights,joints,pose.sampled_pose(native,tracks,phase),data['inverse'])
  assert np.isfinite(transformed).all()
  span=transformed.max(0)-transformed.min(0)
  assert float(span.max())<4,'Unbounded deformation in motorcycle sample'
  separation=max(float(np.linalg.norm(transformed[a]-transformed[b])) for a,b in pairs)
  assert separation<.002,'Coincident skin seam detached in motorcycle sample'
  seam_max=max(seam_max,separation)
  reports.append({'clip':name,'phase':phase,'boundsSpan':span.tolist(),'maxCoincidentVertexGap':separation})
report={'scope':'CPU samples of shipped bikes.ifp rotation channels with normalized root; not native engine, vehicle seating, IK, collisions, gameplay or GPU verification.',
 'nativeGPUExecuted':False,'clavicleSkin':fit,'sportsBikeAnimationCount':len(animations),
 'sportsBikeAnimationSHA256':hashlib.sha256(package.read_bytes()).hexdigest(),
 'shoulderTranslationsPreserved':True,'coincidentVertexPairs':len(pairs),
 'maximumAnimatedSeamGap':seam_max,'samples':reports}
(HERE/'output/rc49-shoulder-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
