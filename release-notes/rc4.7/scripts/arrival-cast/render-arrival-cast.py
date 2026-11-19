"""CPU inspection of shipped/derived geometry, never native gameplay evidence."""
from pathlib import Path
import importlib.util
import io
import struct
import sys
import bpy
import numpy as np
from PIL import Image
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'block-ped'))
from rw_native import children,parse_native,rotation_between
spec=importlib.util.spec_from_file_location('cast_builder',HERE/'build-arrival-cast.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)


def original_texture():
    payload=next(children((HERE/'output/stripa.txd').read_bytes()))[2]
    texture=next(b for k,_,b,_ in children(payload) if k==0x15)
    data=next(b for k,_,b,_ in children(texture) if k==1)
    width,height=struct.unpack_from('<HH',data,80);assert data[87]==1
    size=struct.unpack_from('<I',data,88)[0]
    header=b'DDS '+struct.pack('<7I',124,0x81007,height,width,size,0,1)+bytes(44)+struct.pack('<II4s5I',32,4,b'DXT1',0,0,0,0,0)+struct.pack('<5I',0x1000,0,0,0,0)
    Image.open(io.BytesIO(header+data[92:92+size])).save(HERE/'output/stripa-original-texture.png')


def synthetic_pose(native,arrays):
    p,n,uv,faces,weights,joints=arrays
    order_to_bone={i:b for b,i,_ in native['hierarchy']}
    frames={i:native['ids'][b] for i,b in order_to_bone.items()}
    frame_to_order={frame:i for i,frame in frames.items()}
    parents=[frame_to_order.get(native['parent'][frames[i]],-1) for i in range(24)]
    local=[native['local'][frames[i]].copy() for i in range(24)]
    globals_=np.stack([native['global_'][frames[i]] for i in range(24)])
    for bone,child,target in [(22,23,(-.18,-.98,0)),(32,33,(.18,-.98,0))]:
        i=native['order'][bone];j=native['order'][child];parent=parents[i]
        delta=rotation_between(globals_[j][:3,3]-globals_[i][:3,3],np.array(target))
        local[i][:3,:3]=np.linalg.inv(globals_[parent][:3,:3])@delta@globals_[i][:3,:3]
    posed={}
    def get(i):
        if i not in posed:posed[i]=(get(parents[i]) if parents[i]>=0 else np.eye(4))@local[i]
        return posed[i]
    skin=np.stack([get(i)@native['inverse'][i] for i in range(24)])
    points=np.c_[p,np.ones(len(p))]
    transformed=sum(np.einsum('nij,nj->ni',skin[joints[:,k]],points)*weights[:,k,None] for k in range(4))[:,:3]
    return transformed,uv,faces


def add_actor(model,texture,x,label):
    native=parse_native(HERE/'output'/model)
    p,uv,faces=synthetic_pose(native,builder.geometry(HERE/'output'/model))
    mesh=bpy.data.meshes.new(label);mesh.from_pydata([(float(a+x),float(-c),float(b+1)) for a,b,c in p],[],faces.tolist());mesh.update()
    layer=mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:
            vi=mesh.loops[li].vertex_index;layer.data[li].uv=(float(uv[vi,0]),float(1-uv[vi,1]))
    obj=bpy.data.objects.new(label,mesh);bpy.context.collection.objects.link(obj)
    mat=bpy.data.materials.new(label+' texture');mat.use_nodes=True
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(HERE/'output'/texture))
    tex.interpolation='Closest';bsdf=mat.node_tree.nodes.get('Principled BSDF')
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);bsdf.inputs['Roughness'].default_value=.85
    obj.data.materials.append(mat)


original_texture()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
add_actor('egecj.dff','atlas.png',-.72,'CJ-like VC extra')
add_actor('stripa.dff','stripa-original-texture.png',.72,'Original club dancer')
for label,x in [('VC EXTRA / CPU',-.72),('ORIGINAL STRIPA / CPU',.72)]:
    curve=bpy.data.curves.new(label,'FONT');curve.body=label;curve.size=.12;curve.align_x='CENTER'
    obj=bpy.data.objects.new(label,curve);bpy.context.collection.objects.link(obj);obj.location=(x,0,2.17);obj.rotation_euler=(1.45,0,0)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=False
scene.world.color=(.4,.4,.4);scene.view_settings.view_transform='Standard'
for label,loc,power in [('Key',(-3,-4,5),450),('Fill',(4,-2,3),300)]:
    light=bpy.data.lights.new(label,'AREA');light.energy=power;light.size=4
    obj=bpy.data.objects.new(label,light);bpy.context.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.cameras.new('CPU inspection');obj=bpy.data.objects.new('CPU inspection',camera);bpy.context.collection.objects.link(obj)
obj.location=(.4,-8,2.6);obj.rotation_euler=(Vector((0,0,1.15))-obj.location).to_track_quat('-Z','Y').to_euler()
camera.type='ORTHO';camera.ortho_scale=3.4;scene.camera=obj
scene.render.resolution_x=960;scene.render.resolution_y=760;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'output/CPU-cast-inspection.png')
bpy.ops.render.render(write_still=True)
