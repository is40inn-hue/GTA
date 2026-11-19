"""Blender CPU comparison of sampled IFP poses. This is NOT game playback."""
from pathlib import Path
import importlib.util, sys
import bpy, numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pose_checks',HERE/'native-pose-validation.py')
poses=importlib.util.module_from_spec(spec);spec.loader.exec_module(poses)
before=HERE.parents[1]/'dist/release-notes/rc4.5/scripts/pudge-native'
if '--' in sys.argv:
    supplied=sys.argv[sys.argv.index('--')+1:]
    if supplied:before=Path(supplied[0])
assert (before/'output/egepudge.dff').is_file(), 'Pass the prior Pudge authoring directory after --'
tracks=poses.animation_tracks()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
material=bpy.data.materials.new('Unchanged original diffuse atlas');material.use_nodes=True
image=material.node_tree.nodes.new('ShaderNodeTexImage');image.image=bpy.data.images.load(str(HERE/'output/atlas.png'))
shader=material.node_tree.nodes.get('Principled BSDF');material.node_tree.links.new(image.outputs['Color'],shader.inputs['Base Color']);shader.inputs['Roughness'].default_value=.9

for row,(directory,version,z) in enumerate(((before,'RC4.5',2.8),(HERE,'RC4.6',0))):
    data=np.load(directory/'output/native-geometry.npz');native=poses.builder.parse_native(directory/'output/egepudge.dff')
    for col,(clip,phase,x) in enumerate((('IDLE_stance',.25,-1.8),('run_civi',.25,1.8))):
        p=poses.deform(data['positions'],data['weights'],data['joints'],poses.sampled_pose(native,tracks[clip],phase),data['inverse'])
        mesh=bpy.data.meshes.new(version+' '+clip);mesh.from_pydata([(float(a+x),float(-c),float(b+1+z))for a,b,c in p],[],data['faces'].tolist());mesh.update()
        layer=mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            poly.use_smooth=True
            for loop in poly.loop_indices:
                k=mesh.loops[loop].vertex_index;layer.data[loop].uv=(float(data['uv'][k,0]),float(1-data['uv'][k,1]))
        obj=bpy.data.objects.new(version+' '+clip,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(material)
        d=bpy.data.curves.new(version+' '+clip,'FONT');d.body=version+' / '+clip;d.size=.17;d.align_x='CENTER'
        ob=bpy.data.objects.new(d.body,d);bpy.context.collection.objects.link(ob);ob.location=(x,-.05,z+2.36);ob.rotation_euler=(np.pi/2,0,0)

bpy.context.scene.world.color=(.20,.20,.20)
for name,loc,power,size in [('Key',(-4,-6,8),1500,6),('Fill',(5,-1,5),1000,5)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,3))-ob.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('CPU QA camera');camera=bpy.data.objects.new('CPU QA camera',data);bpy.context.collection.objects.link(camera)
camera.location=(0,-14,3.2);camera.rotation_euler=(Vector((0,0,2.85))-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=7.3
d=bpy.data.curves.new('CPU ONLY','FONT');d.body='CPU / SAMPLED IFP ROTATIONS / NOT AN IN-GAME SCREENSHOT';d.size=.13;d.align_x='CENTER'
ob=bpy.data.objects.new('CPU ONLY',d);bpy.context.collection.objects.link(ob);ob.location=(0,0,5.63);ob.rotation_euler=camera.rotation_euler
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False
scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'output/CPU-shoulder-before-after.png');scene.view_settings.view_transform='Standard';bpy.ops.render.render(write_still=True)
