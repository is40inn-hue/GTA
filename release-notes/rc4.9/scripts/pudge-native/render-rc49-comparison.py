"""CPU geometry comparison, never a screenshot of native GTA runtime."""
from pathlib import Path
import importlib.util, json, sys
import bpy, numpy as np
from mathutils import Vector
HERE=Path(__file__).resolve().parent
detail='--detail' in sys.argv
sp=importlib.util.spec_from_file_location('pose',HERE/'native-pose-validation.py');pose=importlib.util.module_from_spec(sp);sp.loader.exec_module(pose)
builder=pose.builder
animations=pose.animation_tracks();animations.update(pose.animation_tracks((builder.RUNTIME/'remote/models/gta3.img/bikes.ifp').read_bytes()))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mat=bpy.data.materials.new('Source diffuse atlas');mat.use_nodes=True
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(HERE/'output/atlas.png'))
bsdf=mat.node_tree.nodes.get('Principled BSDF');mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);bsdf.inputs['Roughness'].default_value=.9

def add_mesh(data,points,label,x,z):
 mesh=bpy.data.meshes.new(label);mesh.from_pydata([(float(a+x),float(-c),float(b+z)) for a,b,c in points],[],data['faces'].tolist());mesh.update()
 layer=mesh.uv_layers.new(name='UVMap')
 for poly in mesh.polygons:
  poly.use_smooth=True
  for loop_index in poly.loop_indices:
   k=mesh.loops[loop_index].vertex_index;layer.data[loop_index].uv=(float(data['uv'][k,0]),float(1-data['uv'][k,1]))
 ob=bpy.data.objects.new(label,mesh);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)

def label(text,x,z):
 d=bpy.data.curves.new(text,'FONT');d.body=text;d.size=.13;d.align_x='CENTER';o=bpy.data.objects.new(text,d);bpy.context.collection.objects.link(o);o.location=(x,-.8,z);o.rotation_euler=(np.pi/2,0,0)
for row,(title,filename) in enumerate([('RC4.8','reference-rc48.npz'),('RC4.9','native-geometry.npz')]):
 data=np.load(HERE/'output'/filename)
 native=builder.parse_native(HERE/'output'/('reference-rc48.dff' if row == 0 else 'egepudge.dff'))
 clips=['IDLE_stance','IDLE_stance'] if detail else ['BIND','IDLE_stance','run_civi','BIKEs_Ride']
 for col,clip in enumerate(clips):
  points=data['positions']
  if clip!='BIND':points=pose.deform(points,data['weights'],data['joints'],pose.sampled_pose(native,animations[clip],.25),data['inverse'])
  if col==3 or detail and col==1: points=points@np.array([[0,0,-1],[0,1,0],[1,0,0]])
  x=(col-(len(clips)-1)/2)*2.7
  add_mesh(data,points,title+' '+clip,x,(1-row)*2.9)
  label(title+' / '+('IDLE FRONT' if col==0 else 'IDLE SIDE') if detail else title+' / '+clip,x,(1-row)*2.9+1.55)
world=bpy.context.scene.world;world.color=(.23,.23,.23)
for name,loc,power,size in [('Key',(-3,-4,6),1300,5),('Fill',(4,-2,5),1000,4)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('QA camera');cam=bpy.data.objects.new('QA camera',camdata);bpy.context.collection.objects.link(cam);cam.location=(0,-12,2.6);cam.rotation_euler=(Vector((0,0,1.5))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=7.0 if detail else 11.0
label('CPU / SAMPLED IFP / NOT NATIVE GAMEPLAY',0,4.65)
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=False;scene.render.resolution_x=1100 if detail else 1800;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'output'/('CPU-RC49-shoulder-detail.png' if detail else 'CPU-RC49-shoulders.png'));scene.view_settings.view_transform='Standard';bpy.ops.render.render(write_still=True)
