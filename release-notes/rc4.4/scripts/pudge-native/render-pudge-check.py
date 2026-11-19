"""CPU-only geometry inspection, not a screenshot or test of Vice City."""
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector
HERE=Path(__file__).resolve().parent
data=np.load(HERE/'output/native-geometry.npz')
p=data['positions'];faces=data['faces'];uv=data['uv'];joints=data['joints'];weights=data['weights'];g=data['bone_globals'];inv=data['inverse']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mat=bpy.data.materials.new('Source diffuse atlas');mat.use_nodes=True
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(HERE/'output/atlas.png'))
bsdf=mat.node_tree.nodes.get('Principled BSDF');mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);bsdf.inputs['Roughness'].default_value=.9
def add_mesh(points,label,x):
 mesh=bpy.data.meshes.new(label);mesh.from_pydata([(float(a+x),float(-c),float(b+1.0)) for a,b,c in points],[],faces.tolist());mesh.update()
 layer=mesh.uv_layers.new(name='UVMap')
 for poly in mesh.polygons:
  poly.use_smooth=True
  for loop_index in poly.loop_indices:
   k=mesh.loops[loop_index].vertex_index;layer.data[loop_index].uv=(float(uv[k,0]),float(1-uv[k,1]))
 ob=bpy.data.objects.new(label,mesh);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)
 return ob
add_mesh(p,'Native bind pose',-1.45)
# An explicit CPU synthetic pose checks shoulder deformation. This is not
# labelled or used as an in-game animation proof.
parents=[-1,0,1,1,1,2,5,6,6,6,8,10,11,12,7,14,15,16,4,18,19,3,21,22]
# Correct parent relationships are inferred directly from the template frames.
import importlib.util
spec=importlib.util.spec_from_file_location('pudge',HERE/'build-pudge-native.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
native=builder.parse_native(builder.RUNTIME/'remote/models/gta3.img/male01.dff')
bone_for_order={i:bone for bone,i,flags in native['hierarchy']}
frame_for_order={i:native['ids'][bone] for i,bone in bone_for_order.items()}
order_for_frame={frame:i for i,frame in frame_for_order.items()}
local=[];parents=[]
for i in range(24):
 frame=frame_for_order[i];parent=native['parent'][frame];parents.append(order_for_frame.get(parent,-1))
 local.append(native['local'][frame].copy())
# Native upper-arm axes are local X. Alter local rotation to lower arms at the
# shoulder while retaining the original translations and bone lengths.
for bone,next_bone,target in [(22,23,(-.34,-.94,0)),(32,33,(.34,-.94,0))]:
 i=native['order'][bone];child=native['order'][next_bone];parent=parents[i]
 delta=builder.rotation_between(g[child][:3,3]-g[i][:3,3],np.array(target))
 local[i][:3,:3]=np.linalg.inv(g[parent][:3,:3])@delta@g[i][:3,:3]
posed={}
def get(i):
 if i not in posed:posed[i]=(get(parents[i]) if parents[i]>=0 else np.eye(4))@local[i]
 return posed[i]
trans=np.stack([get(i)@inv[i] for i in range(24)]);ph=np.c_[p,np.ones(len(p))]
pp=sum(np.einsum('nij,nj->ni',trans[joints[:,k]],ph)*weights[:,k,None] for k in range(4))[:,:3]
add_mesh(pp,'CPU synthetic shoulder pose',1.45)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));ground=bpy.context.object
gm=bpy.data.materials.new('Ground');gm.diffuse_color=(.09,.10,.13,1);ground.data.materials.append(gm)
world=bpy.context.scene.world;world.color=(.23,.23,.23)
for name,loc,power,size in [('Key',(-3,-4,6),900,5),('Fill',(4,1,5),800,4)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('QA camera');cam=bpy.data.objects.new('QA camera',camdata);bpy.context.collection.objects.link(cam);cam.location=(.6,-8,3.1);cam.rotation_euler=(Vector((0,0,1.15))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=7

for label,x in [('CPU / BIND POSE',-1.45),('CPU / SYNTHETIC POSE',1.45)]:
 d=bpy.data.curves.new(label,'FONT');d.body=label;d.size=.14;d.align_x='CENTER';o=bpy.data.objects.new(label,d);bpy.context.collection.objects.link(o);o.location=(x,0,2.58);o.rotation_euler=cam.rotation_euler
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=False;scene.render.resolution_x=1100;scene.render.resolution_y=560;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'output/CPU-geometry-inspection.png');scene.view_settings.view_transform='Standard';bpy.ops.render.render(write_still=True)
