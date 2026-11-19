"""Small RenderWare 3.3 writer using the shipped VC ped's native skeleton.

The structural parser and writer follow the already working project exporter.
They do not depend on the Pudge converter or change its skeleton or model.
"""
import struct
import numpy as np
from PIL import Image

VERSION = 0x0c02ffff


def chunk(kind, data):
    return struct.pack('<III', kind, len(data), VERSION) + data


def children(raw, begin=0, end=None):
    end = len(raw) if end is None else end
    while begin + 12 <= end:
        kind, size, version = struct.unpack_from('<III', raw, begin)
        if kind == 0 and size == 0:
            break
        if begin + size + 12 > end:
            raise ValueError('Truncated RenderWare chunk')
        yield kind, begin, raw[begin + 12:begin + size + 12], version
        begin += size + 12


def parse_native(path):
    raw = path.read_bytes()
    top = next(children(raw))
    assert top[0] == 0x10
    clump = list(children(top[2]))
    frames = next(c[2] for c in clump if c[0] == 0xe)
    frame_parts = list(children(frames))
    n = struct.unpack_from('<I', frame_parts[0][2])[0]
    mats, globals_, parents = [], [], []
    for i in range(n):
        row = struct.unpack_from('<12f2i', frame_parts[0][2], 4 + 56*i)
        m = np.eye(4)
        m[:3, :3] = np.array(row[:9]).reshape(3, 3).T
        m[:3, 3] = row[9:12]
        parents.append(row[12])
        mats.append(m)
        globals_.append(m if row[12] < 0 else globals_[row[12]] @ m)
    ids, names, hierarchy = {}, {}, []
    for i, ext in enumerate(frame_parts[1:]):
        for kind, off, payload, ver in children(ext[2]):
            if kind == 0x253f2fe:
                names[i] = payload.decode().rstrip('\0')
            if kind == 0x11e:
                _, bone, count = struct.unpack_from('<iii', payload)
                ids[bone] = i
                if count:
                    hierarchy = [struct.unpack_from('<III', payload, 20+k*12) for k in range(count)]
    order = {bone:index for bone,index,flags in hierarchy}
    geomlist = next(c[2] for c in clump if c[0] == 0x1a)
    geom = next(c[2] for c in children(geomlist) if c[0] == 0xf)
    skin = next(payload for kind,off,ext,ver in children(geom) if kind == 3
        for t,_,payload,_ in children(ext) if t == 0x116)
    header = next(c[2] for c in children(geom) if c[0] == 1)
    nv = struct.unpack_from('<I', header, 8)[0]
    assert skin[0] == 24 and skin[1] == 0
    inverse, offset = [], 4+nv*20
    for _ in range(24):
        assert struct.unpack_from('<I', skin, offset)[0] == 0xdeaddead
        offset += 4
        matrix = np.frombuffer(skin, '<f4', 16, offset).reshape(4,4).T.copy()
        offset += 64
        matrix[3, :] = [0, 0, 0, 1]
        inverse.append(matrix)
    return dict(raw=raw, frames=chunk(0xe, frames),
        atom=next(chunk(c[0], c[2]) for c in clump if c[0] == 0x14),
        global_=globals_, local=mats, parent=parents, ids=ids, names=names,
        order=order, inverse=inverse, hierarchy=hierarchy)


def rotation_between(a, b):
    a = np.asarray(a, dtype=float); b = np.asarray(b, dtype=float)
    a = a/np.linalg.norm(a); b = b/np.linalg.norm(b)
    c = np.clip(a@b, -1, 1); v = np.cross(a,b)
    if c > 1-1e-10:
        return np.eye(3)
    if c < -1+1e-10:
        axis = np.cross(a, [1,0,0] if abs(a[0]) < .9 else [0,1,0])
        axis /= np.linalg.norm(axis)
        return 2*np.outer(axis,axis)-np.eye(3)
    k = np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]])
    return np.eye(3)+k+k@k/(1+c)


def write_dff(native, name, p, normals, uv, faces, weights, joints):
    count, tri = len(p), len(faces)
    flags = 0x10036  # positions, UV0, normals, light; triangle list
    center = (p.min(0)+p.max(0))/2
    radius = np.linalg.norm(p-center,axis=1).max()
    data = struct.pack('<4I3f',flags,tri,count,1,1,0,1)+np.asarray(uv,'<f4').tobytes()
    rt = np.zeros((tri,4),dtype='<u2')
    rt[:,0]=faces[:,1]; rt[:,1]=faces[:,0]; rt[:,3]=faces[:,2]
    data += rt.tobytes()+struct.pack('<4f2I',*center,radius,1,1)
    data += np.asarray(p,'<f4').tobytes()+np.asarray(normals,'<f4').tobytes()
    encoded = (name.encode('ascii')+b'\0')
    encoded += bytes((-len(encoded))%4)
    # Nearest-neighbour sampling keeps the tiny pixel artwork crisp.
    tex = chunk(6,chunk(1,struct.pack('<I',0x3301))+chunk(2,encoded)+chunk(2,b'\0'*4)+chunk(3,b''))
    mat = chunk(7,chunk(1,struct.pack('<I4BII3f',0,255,255,255,255,0,1,1,0,1))+tex+chunk(3,b''))
    ml = chunk(8,chunk(1,struct.pack('<Ii',1,-1))+mat)
    indices = np.asarray(faces,'<u4').reshape(-1)
    binmesh = chunk(0x50e,struct.pack('<3I2I',0,1,len(indices),len(indices),0)+indices.tobytes())
    skin = struct.pack('<4B',24,0,0,0)+np.asarray(joints,'u1').tobytes()+np.asarray(weights,'<f4').tobytes()
    for inverse in native['inverse']:
        skin += struct.pack('<I',0xdeaddead)+np.asarray(inverse.T,'<f4').tobytes()
    ext=chunk(3,binmesh+chunk(0x116,skin)+chunk(0x105,struct.pack('<I',0)))
    geom=chunk(0xf,chunk(1,data)+ml+ext)
    return chunk(0x10,chunk(1,struct.pack('<III',1,0,0))+native['frames']+
        chunk(0x1a,chunk(1,struct.pack('<I',1))+geom)+native['atom']+chunk(3,b''))


def write_txd(atlas, name):
    indexed = atlas.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
    pal = np.array(indexed.getpalette(),dtype='u1').reshape(-1,3)
    palette = np.c_[pal,np.full(len(pal),255,dtype='u1')].astype('u1').tobytes().ljust(1024,b'\0')
    pixels = np.asarray(indexed,dtype='u1').tobytes()
    h=struct.pack('<II32s32sIIHHBBBB',8,0x3301,name.encode('ascii'),b'',0x2500,0,atlas.width,atlas.height,8,1,4,0)
    native=chunk(0x15,chunk(1,h+palette+struct.pack('<I',len(pixels))+pixels)+chunk(3,b''))
    return chunk(0x16,chunk(1,struct.pack('<HH',1,0))+native+chunk(3,b''))
