#!/usr/bin/env python3
"""Convert the project's Pudge GLB to a dedicated Vice City ped.

No network, Blender, or installed GTA is needed to rebuild. Input skeleton and
HAnim/atomic plugins come from the already shipped original male01 DFF; the
source Pudge geometry, UVs, colours and authorship come from our inspected GLB.
Only model slot 8 is installed. Runtime is still the existing Vice City WASM.
"""
from pathlib import Path
import argparse, hashlib, io, json, math, struct
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RUNTIME = ROOT / 'dist/native-vc/runtime'
VERSION = 0x0c02ffff  # RW 3.3.0.2, exactly the known-working original VC ped.
MODEL_NAME = 'egepudge'
MODEL_ID = 8
CHUNK = 512 * 1024
SHOULDER_OUTSET = .125
SHOULDER_DROP = .060


def sha(b): return hashlib.sha256(b).hexdigest()


def chunk(kind, data): return struct.pack('<III', kind, len(data), VERSION) + data


def children(raw, begin=0, end=None):
    end = len(raw) if end is None else end
    while begin + 12 <= end:
        kind, size, version = struct.unpack_from('<III', raw, begin)
        if kind == 0 and size == 0: break  # IMG sector padding.
        if begin + size + 12 > end: raise ValueError('Truncated RenderWare chunk')
        yield kind, begin, raw[begin + 12:begin + size + 12], version
        begin += size + 12


def glb(path):
    raw = path.read_bytes()
    assert struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw))
    offset = 12; parts = {}
    while offset < len(raw):
        size, kind = struct.unpack_from('<II', raw, offset); offset += 8
        parts[kind] = raw[offset:offset + size]; offset += size
    return json.loads(parts[0x4e4f534a]), parts[0x004e4942]


def acc(j, b, index):
    a = j['accessors'][index]; view = j['bufferViews'][a['bufferView']]
    assert 'sparse' not in a
    dtype = np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']])
    width = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    offset = view.get('byteOffset',0) + a.get('byteOffset',0)
    result = np.ndarray((a['count'],width),dtype,buffer=b,offset=offset,
        strides=(view.get('byteStride',dtype.itemsize*width),dtype.itemsize)).copy()
    if a.get('normalized'): result = result.astype(float) / np.iinfo(dtype).max
    assert np.isfinite(result).all()
    return result


def world_matrices(j):
    parents = {child: index for index,n in enumerate(j['nodes']) for child in n.get('children',[])}
    result = {}
    def world(i):
        if i in result: return result[i]
        n = j['nodes'][i]
        if 'matrix' in n: local = np.array(n['matrix']).reshape(4,4,order='F')
        else:
            x,y,z,w = n.get('rotation',[0,0,0,1])
            rot = np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
            local = np.eye(4); local[:3,:3] = rot @ np.diag(n.get('scale',[1,1,1]))
            local[:3,3] = n.get('translation',[0,0,0])
        result[i] = (world(parents[i]) if i in parents else np.eye(4)) @ local
        return result[i]
    return [world(i) for i in range(len(j['nodes']))]


def parse_native(path):
    raw = path.read_bytes()
    top = next(children(raw)); assert top[0] == 0x10
    clump = list(children(top[2])); frames = next(c[2] for c in clump if c[0]==0xe)
    frame_parts = list(children(frames)); n = struct.unpack_from('<I',frame_parts[0][2])[0]
    mats=[]; globals_=[]; parents=[]
    for i in range(n):
        row = struct.unpack_from('<12f2i',frame_parts[0][2],4+56*i)
        m=np.eye(4);m[:3,:3]=np.array(row[:9]).reshape(3,3).T;m[:3,3]=row[9:12]
        parents.append(row[12]);mats.append(m)
        globals_.append(m if row[12]<0 else globals_[row[12]]@m)
    ids={}; names={}; hierarchy=[]
    for i,ext in enumerate(frame_parts[1:]):
        for kind,off,payload,ver in children(ext[2]):
            if kind==0x253f2fe:names[i]=payload.decode().rstrip('\0')
            if kind==0x11e:
                _,bone,count=struct.unpack_from('<iii',payload)
                ids[bone]=i
                if count:hierarchy=[struct.unpack_from('<III',payload,20+k*12) for k in range(count)]
    order={bone:index for bone,index,flags in hierarchy}
    geomlist=next(c[2] for c in clump if c[0]==0x1a)
    geom=next(c[2] for c in children(geomlist) if c[0]==0xf)
    skin=next(payload for kind,off,ext,ver in children(geom) if kind==3
        for t,_,payload,_ in children(ext) if t==0x116)
    header=next(c[2] for c in children(geom) if c[0]==1)
    nv=struct.unpack_from('<I',header,8)[0]
    assert skin[0]==24 and skin[1]==0
    inverse=[];offset=4+nv*20
    for _ in range(24):
        assert struct.unpack_from('<I',skin,offset)[0]==0xdeaddead;offset+=4
        matrix=np.frombuffer(skin,'<f4',16,offset).reshape(4,4).T.copy();offset+=64
        matrix[3,:]=[0,0,0,1]  # RW Matrix flag/padding words are not float values.
        inverse.append(matrix)
    return dict(raw=raw,frames=chunk(0xe,frames),atom=next(chunk(c[0],c[2]) for c in clump if c[0]==0x14),
        global_=globals_,local=mats,parent=parents,ids=ids,names=names,order=order,inverse=inverse,hierarchy=hierarchy)


def fit_shoulder_sockets(native):
    """Give Pudge's broad deltoids their own native shoulder pivots.

    RC4.4 fitted the mesh to male01's 41 cm-wide shoulder sockets while keeping
    Pudge's thick arm cross sections. When native animations lowered his arms,
    those sections rotated into his neck. Moving vertices alone would leave the
    animation pivot in the wrong place. Widen/lower the two *socket frames* and
    regenerate inverse binds together; keep every ID, orientation, parent and
    animation channel unchanged. The existing upper/lower arm lengths stay exact.
    The original male01 asset is never written.
    """
    local = [m.copy() for m in native['local']]
    for bone, side in ((22, -1), (32, 1)):
        frame = native['ids'][bone]
        parent = native['parent'][frame]
        delta = np.array([side * SHOULDER_OUTSET, -SHOULDER_DROP, 0.0])
        local[frame][:3, 3] += np.linalg.solve(native['global_'][parent][:3, :3], delta)
    globals_ = []
    for i, m in enumerate(local):
        parent = native['parent'][i]
        globals_.append(m.copy() if parent < 0 else globals_[parent] @ m)

    # Re-encode only the frame matrix structure. Name/HAnim extensions are the
    # original chunks; the hierarchy and atomic plugin therefore keep their ABI.
    frame_parts = list(children(next(children(native['frames']))[2]))
    rows = bytearray(struct.pack('<I', len(local)))
    original_rows = frame_parts[0][2]
    for i, m in enumerate(local):
        flags = struct.unpack_from('<i', original_rows, 4 + 56 * i + 52)[0]
        rows += struct.pack('<12f2i', *m[:3,:3].T.reshape(-1), *m[:3,3], native['parent'][i], flags)
    frames = chunk(0xe, chunk(1, rows) + b''.join(chunk(t,p) for t,_,p,_ in frame_parts[1:]))
    inverse = [None] * len(native['inverse'])
    for bone, index, _ in native['hierarchy']:
        inverse[index] = np.linalg.inv(globals_[native['ids'][bone]])
    return dict(native, local=local, global_=globals_, inverse=inverse, frames=frames)


def rotation_between(a,b):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b);c=np.clip(a@b,-1,1);v=np.cross(a,b)
    if c>1-1e-10:return np.eye(3)
    if c<-1+1e-10:
        axis=np.cross(a,[1,0,0] if abs(a[0])<.9 else [0,1,0]);axis/=np.linalg.norm(axis)
        return 2*np.outer(axis,axis)-np.eye(3)
    k=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]])
    return np.eye(3)+k+k@k/(1+c)


# Canonical source anchors for VC's fixed native HAnim IDs. Accessories and
# secondary flesh bones collapse to their nearest meaningful animation channel.
ANCHOR={0:5,1:24,2:25,3:27,4:42,5:43,21:28,22:29,23:30,24:31,25:39,
    31:49,32:50,33:51,34:52,35:56,41:61,42:62,43:63,2000:64,51:65,52:66,53:67,2001:68}
SOURCE_TO_ID={5:0,24:1,25:2,26:3,27:3,28:21,29:22,30:23,31:24,32:24,33:24,
    34:24,35:25,36:25,37:25,38:25,39:25,40:25,41:23,
    42:4,43:5,44:5,46:3,47:3,48:3,49:31,50:32,51:33,52:34,
    53:34,54:35,55:34,56:35,57:3,58:3,59:3,60:2,
    61:41,62:42,63:43,64:2000,65:51,66:52,67:53,68:2001,
    69:1,71:1,73:1,75:1,76:1,78:1,79:1,80:41,82:1,83:1,84:41,86:2,88:2}
NEXT_ID={21:22,22:23,23:24,24:25,31:32,32:33,33:34,34:35,
    41:42,42:43,43:2000,51:52,52:53,53:2001}


def make_retarget(native,world):
    transforms={}
    for bone,node in ANCHOR.items():
        source=world[node][:3,3];target=native['global_'][native['ids'][bone]][:3,3]
        linear=np.eye(3)
        if bone in NEXT_ID:
            following=NEXT_ID[bone];a=world[ANCHOR[following]][:3,3]-source
            b=native['global_'][native['ids'][following]][:3,3]-target
            rotation=rotation_between(a,b)
            axis=a/np.linalg.norm(a);ratio=np.linalg.norm(b)/np.linalg.norm(a)
            # Change length along each limb, retaining the characteristic thick
            # cross section instead of shrinking the entire model to a human.
            linear=rotation @ (np.eye(3)+(ratio-1)*np.outer(axis,axis))
        m=np.eye(4);m[:3,:3]=linear;m[:3,3]=target-linear@source;transforms[bone]=m
    # End bones inherit the hand/foot rest orientation; an identity rotation
    # here leaves the fingertips in the original bent source pose and appears
    # as detached wrists after the arm is reposed into VC's T-pose.
    for bone,parent in ((25,24),(35,34),(2000,43),(2001,53)):
        source=world[ANCHOR[bone]][:3,3];target=native['global_'][native['ids'][bone]][:3,3]
        transforms[bone][:3,:3]=transforms[parent][:3,:3]
        transforms[bone][:3,3]=target-transforms[bone][:3,:3]@source
    return transforms


def bake_meshes(j,b,native):
    world=world_matrices(j);transforms=make_retarget(native,world);skin=j['skins'][0]
    joint_ids=[SOURCE_TO_ID[x] for x in skin['joints']]
    inverse=acc(j,b,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
    original=np.stack([world[node]@inv for node,inv in zip(skin['joints'],inverse)])
    positions=[];normals=[];uvs=[];faces=[];weights=[];joints=[];materials=[];audit=[];offset=0
    for ni,node in enumerate(j['nodes']):
        if 'mesh' not in node:continue
        mi=node['mesh']
        for prim in j['meshes'][mi]['primitives']:
            a=prim['attributes'];p=acc(j,b,a['POSITION']);n=acc(j,b,a['NORMAL']);uv=acc(j,b,a['TEXCOORD_0'])
            sj=acc(j,b,a['JOINTS_0']).astype(int);sw=acc(j,b,a['WEIGHTS_0']).astype(float)
            sw/=sw.sum(1)[:,None];ph=np.c_[p,np.ones(len(p))]
            source=sum(np.einsum('nij,nj->ni',original[sj[:,k]],ph)*sw[:,k,None] for k in range(4))[:,:3]
            source_n=sum(np.einsum('nij,nj->ni',original[sj[:,k],:3,:3],n)*sw[:,k,None] for k in range(4))
            source_n/=np.maximum(np.linalg.norm(source_n,axis=1)[:,None],1e-12)
            merged=np.zeros((len(p),24))
            for k in range(4):
                inds=np.array([native['order'][joint_ids[x]] for x in sj[:,k]])
                np.add.at(merged,(np.arange(len(p)),inds),sw[:,k])
            picked=np.argsort(-merged,axis=1)[:,:4];nw=np.take_along_axis(merged,picked,axis=1);nw/=nw.sum(1)[:,None]
            bone_for_order={v:k for k,v in native['order'].items()}
            ret=np.zeros_like(source);ret_n=np.zeros_like(source)
            for k in range(4):
                mats=np.stack([transforms[bone_for_order[x]] for x in picked[:,k]])
                ret+=np.einsum('nij,nj->ni',mats,np.c_[source,np.ones(len(source))])[:,:3]*nw[:,k,None]
                normal_m=np.linalg.inv(mats[:,:3,:3]).transpose(0,2,1)
                ret_n+=np.einsum('nij,nj->ni',normal_m,source_n)*nw[:,k,None]
            ret_n/=np.maximum(np.linalg.norm(ret_n,axis=1)[:,None],1e-12)
            idx=acc(j,b,prim['indices']).reshape(-1,3).astype(int)
            positions.append(ret);normals.append(ret_n);uvs.append(uv);faces.append(idx+offset);weights.append(nw);joints.append(picked);materials.append(np.full(len(p),prim['material']))
            audit.append({'sourceMesh':mi,'sourceNode':ni,'vertices':len(p),'triangles':len(idx),'startVertex':offset,
                'sourceBounds':[source.min(0).tolist(),source.max(0).tolist()],
                'nativeBounds':[ret.min(0).tolist(),ret.max(0).tolist()],
                'usedBoneIDs':sorted({bone_for_order[x] for x in picked[nw>.001]})})
            offset+=len(p)
    return tuple(np.concatenate(x) for x in (positions,normals,uvs,faces,weights,joints,materials)),audit,transforms


def texture_atlas(j,b,uv,materials):
    atlas=Image.new('RGB',(1024,512));new_uv=uv.copy().astype(float)
    # Seven diffuse textures occupy a single atlas. 4px duplicated gutters
    # prevent neighbouring tiles bleeding into shoulder/face edges.
    for mi,mat in enumerate(j['materials']):
        tex=j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]
        view=j['bufferViews'][j['images'][tex['source']]['bufferView']]
        raw=b[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        im=Image.open(io.BytesIO(raw)).convert('RGB').resize((248,248),Image.Resampling.LANCZOS)
        cell=Image.new('RGB',(256,256));cell.paste(im,(4,4))
        cell.paste(im.crop((0,0,1,248)).resize((4,248)),(0,4));cell.paste(im.crop((247,0,248,248)).resize((4,248)),(252,4))
        cell.paste(cell.crop((0,4,256,5)).resize((256,4)),(0,0));cell.paste(cell.crop((0,251,256,252)).resize((256,4)),(0,252))
        x=(mi%4)*256;y=(mi//4)*256;atlas.paste(cell,(x,y));mask=materials==mi
        new_uv[mask,0]=(x+4+np.clip(uv[mask,0],0,1)*247)/1024
        new_uv[mask,1]=(y+4+np.clip(uv[mask,1],0,1)*247)/512
    return atlas,new_uv


def write_dff(native,p,n,uv,faces,w,joints):
    count=len(p);tri=len(faces)
    flags=0x10036 # positions + UV0 + normals + light, non-native triangle list
    center=(p.min(0)+p.max(0))/2;radius=np.linalg.norm(p-center,axis=1).max()
    data=struct.pack('<4I3f',flags,tri,count,1,1,0,1)+np.asarray(uv,'<f4').tobytes()
    rt=np.zeros((tri,4),dtype='<u2');rt[:,0]=faces[:,1];rt[:,1]=faces[:,0];rt[:,3]=faces[:,2]
    data+=rt.tobytes()+struct.pack('<4f2I',*center,radius,1,1)+np.asarray(p,'<f4').tobytes()+np.asarray(n,'<f4').tobytes()
    tex=chunk(6,chunk(1,struct.pack('<I',0x3302))+chunk(2,b'egepudge\0\0\0\0')+chunk(2,b'\0'*4)+chunk(3,b''))
    mat=chunk(7,chunk(1,struct.pack('<I4BII3f',0,255,255,255,255,0,1,1,0,1))+tex+chunk(3,b''))
    ml=chunk(8,chunk(1,struct.pack('<Ii',1,-1))+mat)
    indices=np.asarray(faces,'<u4').reshape(-1)
    binmesh=chunk(0x50e,struct.pack('<3I2I',0,1,len(indices),len(indices),0)+indices.tobytes())
    skin=struct.pack('<4B',24,0,0,0)+np.asarray(joints,'u1').tobytes()+np.asarray(w,'<f4').tobytes()
    for inverse in native['inverse']:skin+=struct.pack('<I',0xdeaddead)+np.asarray(inverse.T,'<f4').tobytes()
    ext=chunk(3,binmesh+chunk(0x116,skin)+chunk(0x105,struct.pack('<I',0)))
    geom=chunk(0xf,chunk(1,data)+ml+ext)
    return chunk(0x10,chunk(1,struct.pack('<III',1,0,0))+native['frames']+chunk(0x1a,chunk(1,struct.pack('<I',1))+geom)+native['atom']+chunk(3,b''))


def write_txd(atlas):
    # PC D3D8 PAL8, supported by the same native VC runtime as shipped TXDs.
    indexed=atlas.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
    pal=np.array(indexed.getpalette(),dtype='u1').reshape(-1,3)
    palette=np.c_[pal,np.full(len(pal),255,dtype='u1')].astype('u1').tobytes()
    palette=palette.ljust(1024,b'\0')
    pixels=np.asarray(indexed,dtype='u1').tobytes()
    h=struct.pack('<II32s32sIIHHBBBB',8,0x3302,b'egepudge',b'',0x2500,0,atlas.width,atlas.height,8,1,4,0)
    native=chunk(0x15,chunk(1,h+palette+struct.pack('<I',len(pixels))+pixels)+chunk(3,b''))
    return chunk(0x16,chunk(1,struct.pack('<HH',1,0))+native+chunk(3,b''))


def install_manifest(dff,txd):
    path=RUNTIME/'manifest.json';manifest=json.loads(path.read_text());files=manifest['models']['files']
    files[:]=[f for f in files if f.get('path') not in ('remote/models/gta3.img/egepudge.dff','remote/models/gta3.img/egepudge.txd')]
    for ext,raw in [('dff',dff),('txd',txd)]:
        rel='remote/models/gta3.img/egepudge.'+ext;dest=RUNTIME/rel;dest.write_bytes(raw)
        f={'path':rel,'originalPath':'/'+rel,'size':len(raw),'sha256':sha(raw),'mimeType':'application/octet-stream'}
        if len(raw)>CHUNK:
            parts=[]
            for offset in range(0,len(raw),CHUNK):
                payload=raw[offset:offset+CHUNK];part=rel+'.'+str(offset//CHUNK+1).zfill(3)+'.bin'
                (RUNTIME/part).write_bytes(payload);parts.append({'offset':offset,'path':part,'size':len(payload),'sha256':sha(payload)})
            f['chunks']=parts
        files.append(f)
    manifest['models']['size']=sum(f['size'] for f in files);manifest['models']['count']=len(files)
    path.write_text(json.dumps(manifest,indent=2)+'\n')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--install',action='store_true');args=parser.parse_args()
    source=HERE/'source/pudge-candidate.glb';template=RUNTIME/'remote/models/gta3.img/male01.dff'
    j,b=glb(source);native=fit_shoulder_sockets(parse_native(template));(p,n,uv,f,w,joints,materials),audit,retarget=bake_meshes(j,b,native)
    atlas,uv=texture_atlas(j,b,uv,materials);dff=write_dff(native,p,n,uv,f,w,joints);txd=write_txd(atlas)
    dff += bytes((-len(dff)) % 2048);txd += bytes((-len(txd)) % 2048)
    out=HERE/'output';out.mkdir(exist_ok=True);(out/'egepudge.dff').write_bytes(dff);(out/'egepudge.txd').write_bytes(txd);atlas.save(out/'atlas.png')
    np.savez_compressed(out/'native-geometry.npz',positions=p,normals=n,uv=uv,faces=f,weights=w,joints=joints,
        bone_globals=np.stack([native['global_'][native['ids'][bone]] for bone,_,_ in sorted(native['hierarchy'],key=lambda row:row[1])]),inverse=np.stack(native['inverse']))
    report={'status':'native-converted-cpu-validated; actual Vice City runtime visual QA still required','modelID':MODEL_ID,'model':MODEL_NAME,
        'source':str(source.relative_to(ROOT)),'sourceSHA256':sha(source.read_bytes()),'templateSHA256':sha(template.read_bytes()),
        'vertices':len(p),'triangles':len(f),'nativeBones':24,'nativeMaterials':1,'textureDimensions':[1024,512],
        'changes':['Original GLB rest skin baked before retargeting.','58 source joints consolidated to 24 original VC HAnim channels.',
          'RC4.6: upper-arm sockets moved 12.5 cm outward and 6 cm down per side; native frame translations and inverse binds are rebuilt together.',
          'Original bone names, IDs, parent hierarchy and rest orientations are retained; arm segment lengths and the original male01 file are unchanged.',
          'Native limb lengths matched along bone axes; thick Pudge cross sections retained.','All nine character meshes retained, including the original cosmetic hook and cleaver; no gameplay weapon is granted.',
          'One diffuse atlas with padded tiles; no extra game engine or delayed asset fetch.'],
        'shoulderFit':{'outsetPerSide':SHOULDER_OUTSET,'drop':SHOULDER_DROP,'nativeFramesAndInverseBindsUpdatedTogether':True},
        'bounds':[p.min(0).tolist(),p.max(0).tolist()],'meshes':audit,
        'files':[{'path':'remote/models/gta3.img/egepudge.'+ext,'size':len(raw),'sha256':sha(raw)} for ext,raw in [('dff',dff),('txd',txd)]],
        'attribution':j['asset'].get('extras',{}),'nativeGPUExecuted':False}
    (out/'model-report.json').write_text(json.dumps(report,indent=2)+'\n')
    if args.install:install_manifest(dff,txd)
    print(json.dumps({k:report[k] for k in ('modelID','vertices','triangles','nativeBones','bounds','files')},indent=2))


if __name__=='__main__':main()
