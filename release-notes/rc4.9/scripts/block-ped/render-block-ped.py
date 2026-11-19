"""CPU mesh/pose illustration. This is not a native gameplay screenshot."""
from pathlib import Path
import sys
import math
import bpy
import numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from rw_native import parse_native,rotation_between

ROOT=HERE.parents[1]
data=np.load(HERE/'output/native-geometry.npz')
p=data['positions'];faces=data['faces'];uv=data['uv'];joints=data['joints'];weights=data['weights'];g=data['bone_globals'];inv=data['inverse']
native=parse_native(ROOT/'dist/native-vc/runtime/remote/models/gta3.img/male01.dff')
bone_for_order={i:b for b,i,_ in native['hierarchy']}
frame_for_order={i:native['ids'][b] for i,b in bone_for_order.items()}
order_for_frame={frame:i for i,frame in frame_for_order.items()}
parents=[order_for_frame.get(native['parent'][frame_for_order[i]],-1) for i in range(24)]


def pose(walk=0):
    local=[native['local'][frame_for_order[i]].copy() for i in range(24)]
    def set_direction(bone,child,target):
        i=native['order'][bone];ci=native['order'][child];parent=parents[i]
        delta=rotation_between(g[ci][:3,3]-g[i][:3,3],target)
        local[i][:3,:3]=np.linalg.inv(g[parent][:3,:3])@delta@g[i][:3,:3]
    for b,c,side in [(22,23,-1),(32,33,1)]:
        set_direction(b,c,np.array([.025*side,-.999,walk*side*.5]))
    if walk:
        for b,c,side in [(41,42,1),(51,52,-1)]:
            set_direction(b,c,np.array([side*.035,-1,walk*side*.4]))
    posed={}
    def get(i):
        if i not in posed:
            posed[i]=(get(parents[i]) if parents[i]>=0 else np.eye(4))@local[i]
        return posed[i]
    matrices=np.stack([get(i)@inv[i] for i in range(24)])
    return np.einsum('nij,nj->ni',matrices[joints[:,0]],np.c_[p,np.ones(len(p))])[:,:3]


def reset():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False
    scene.view_settings.view_transform='Standard';scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
    scene.world.color=(.35,.35,.35)
    return scene


def material():
    mat=bpy.data.materials.new('Procedural pixel palette');mat.use_nodes=True
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(HERE/'output/atlas.png'))
    tex.interpolation='Closest';bsdf=mat.node_tree.nodes.get('Principled BSDF')
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value=1
    return mat


def mesh(points,name,x,mat):
    m=bpy.data.meshes.new(name)
    m.from_pydata([(float(a+x),float(-c),float(b+.98)) for a,b,c in points],[],faces.tolist());m.update()
    layer=m.uv_layers.new(name='UVMap')
    for poly in m.polygons:
        poly.use_smooth=False
        for li in poly.loop_indices:
            vi=m.loops[li].vertex_index;layer.data[li].uv=(float(uv[vi,0]),float(1-uv[vi,1]))
    o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.data.materials.append(mat)


def rig_camera(scene,location,target,scale):
    d=bpy.data.cameras.new('CPU illustration camera');o=bpy.data.objects.new('CPU illustration camera',d)
    bpy.context.collection.objects.link(o);o.location=location
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    d.type='ORTHO';d.ortho_scale=scale;scene.camera=o
    for name,loc,power,size in [('Key',(-3,-4,5),500,4),('Fill',(4,-2,3),350,4),('Rim',(0,3,4),400,3)]:
        ld=bpy.data.lights.new(name,'AREA');ld.energy=power;ld.size=size
        lo=bpy.data.objects.new(name,ld);bpy.context.collection.objects.link(lo);lo.location=loc
        lo.rotation_euler=(Vector((0,0,1))-lo.location).to_track_quat('-Z','Y').to_euler()


scene=reset();mat=material();mesh(pose(0),'Block pedestrian / CPU neutral',0,mat)
rig_camera(scene,(2.4,-6,2.6),(0,0,1.03),2.42)
scene.render.resolution_x=480;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.filepath=str(HERE/'output/steve-choice.png');bpy.ops.render.render(write_still=True)

scene=reset();mat=material();mesh(pose(0),'CPU neutral',-.8,mat);mesh(pose(1),'CPU synthetic stride',.8,mat)
rig_camera(scene,(1,-8,3),(0,0,1.05),3.8)
scene.render.resolution_x=1040;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.filepath=str(HERE/'output/CPU-pose-check.png');bpy.ops.render.render(write_still=True)
