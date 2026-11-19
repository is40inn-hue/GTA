#!/usr/bin/env python3
"""Build a tiny six-cuboid native pedestrian for the Ocean Drive cameo.

The reference is a design reference only; its raster is not embedded or edited.
All geometry/pixel colours are authored here. No delayed scene-time network call.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import numpy as np
from PIL import Image
from rw_native import parse_native, rotation_between, write_dff, write_txd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RUNTIME = ROOT / 'dist/native-vc/runtime'
MODEL_ID = 107
MODEL_NAME = 'egesteve'
REFERENCE = ROOT.parent / 'upload/image(20261116-215737).png'
ATLAS_SIZE = 128


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def reference_slot():
    """Read the actual packaged IDE, not a hand-written test fixture."""
    manifest = json.loads((RUNTIME/'manifest.json').read_text())
    glue = (RUNTIME/'index.js').read_text()
    match = re.search(r'\{"filename": "/vc-assets/local/data/default.ide", "start": (\d+), "end": (\d+)\}', glue)
    assert match, 'Missing native IDE index'
    start, end = map(int, match.groups())
    data = bytearray(end-start)
    for part in manifest['data']['chunks']:
        lo=max(start,part['offset']); hi=min(end,part['offset']+part['size'])
        if lo>=hi:
            continue
        blob=(RUNTIME/part['path']).read_bytes()
        assert len(blob)==part['size'] and sha(blob)==part['sha256']
        data[lo-start:hi-start]=blob[lo-part['offset']:hi-part['offset']]
    text=data.decode()
    peds=re.search(r'^peds\s*\n(.*?)^end',text,re.M|re.S).group(1)
    ids={int(x) for x in re.findall(r'^\s*(\d+)\s*,',peds,re.M)}
    assert MODEL_ID not in ids, f'Native slot {MODEL_ID} is occupied'
    assert 9 in ids, 'Unexpected default IDE: slot 9 must not be replaced'
    return {'freeSlot':MODEL_ID,'slot9Preserved':'HFYST','defaultIDE_SHA256':sha(bytes(data))}


COLORS = {
    'skin':(166,112,84),'skinLight':(184,134,105),'skinDark':(145,91,70),
    'hair':(53,33,19),'hairLight':(69,43,27),'hairDark':(39,25,18),
    'shirt':(0,167,177),'shirtLight':(8,182,188),'shirtDark':(0,146,158),
    'pants':(62,52,170),'pantsLight':(72,60,185),'pantsDark':(49,44,147),
    'shoe':(88,102,110),'shoeDark':(73,84,93),'eyeWhite':(223,224,230),
    'eyeBlue':(73,67,171),'mouth':(91,53,37),
}


def flat_pixels(width,height,name,seed):
    base=np.empty((height,width,3),dtype=np.uint8);base[:]=COLORS[name]
    rng=np.random.default_rng(seed)
    dark=COLORS.get(name+'Dark',COLORS[name]);light=COLORS.get(name+'Light',COLORS[name])
    for y in range(height):
        for x in range(width):
            roll=rng.integers(0,12)
            if roll<2:base[y,x]=dark
            elif roll==2:base[y,x]=light
    return base


def pixel_face(part,face,seed):
    if part=='head':
        a=flat_pixels(8,8,'hair' if face in ('back','top') else 'skin',seed)
        if face=='front':
            a[:2]=COLORS['hair'];a[2,0]=a[2,7]=COLORS['hairDark']
            a[2,1]=a[2,6]=COLORS['hair']
            a[3,1:3]=a[3,5:7]=COLORS['eyeWhite']
            a[3,2]=a[3,5]=COLORS['eyeBlue']
            a[4:6,3:5]=COLORS['skinDark']
            a[5,1]=a[5,6]=COLORS['mouth']
            a[6,1:7]=COLORS['mouth'];a[6,3:5]=COLORS['skinLight']
            a[7,2:6]=COLORS['mouth']
        elif face in ('left','right'):
            a[:3]=COLORS['hair'];a[3:6,:2]=COLORS['hair']
            a[4:6,3:5]=COLORS['skinLight']
        return a
    if part=='body':
        a=flat_pixels(8,12,'shirt',seed)
        if face=='front':
            a[0,3:5]=COLORS['skin'];a[1,3:5]=COLORS['skinDark']
            a[3:10,3]=COLORS['shirtDark'];a[9:11,5]=COLORS['shirtLight']
        if face in ('left','right'):a[:,0]=COLORS['shirtDark']
        return a
    if part=='arm':
        a=flat_pixels(4,12,'skin',seed)
        a[:4]=flat_pixels(4,4,'shirt',seed+17)
        if face in ('left','right','front'):a[5:8,1]=COLORS['skinDark']
        if face=='top':a[:]=COLORS['shirt']
        return a
    a=flat_pixels(4,12,'pants',seed)
    a[-2:]=COLORS['shoe'];a[-1]=COLORS['shoeDark']
    if face=='bottom':a[:]=COLORS['shoeDark']
    if face=='front':a[7,1:3]=COLORS['pantsDark']
    return a


class Atlas:
    def __init__(self):
        self.image=Image.new('RGB',(ATLAS_SIZE,ATLAS_SIZE),COLORS['shirt'])
        self.count=0

    def face(self,part,face):
        index=self.count;self.count+=1
        x=(index%8)*16;y=(index//8)*16
        im=Image.fromarray(pixel_face(part,face,17+index)).resize((12,12),Image.Resampling.NEAREST)
        self.image.paste(im,(x+2,y+2))
        self.image.paste(im.crop((0,0,1,12)).resize((2,12)),(x,y+2))
        self.image.paste(im.crop((11,0,12,12)).resize((2,12)),(x+14,y+2))
        self.image.paste(self.image.crop((x,y+2,x+16,y+3)).resize((16,2)),(x,y))
        self.image.paste(self.image.crop((x,y+13,x+16,y+14)).resize((16,2)),(x,y+14))
        return [(x+2.5)/ATLAS_SIZE,(y+2.5)/ATLAS_SIZE,(x+13.5)/ATLAS_SIZE,(y+13.5)/ATLAS_SIZE]


def build_geometry(native):
    atlas=Atlas();positions=[];normals=[];uvs=[];faces=[];joints=[];weights=[];parts=[]
    # Each face owns four vertices; no shared normals or averaged skin weights.
    # The 6-cuboid silhouette remains blocky throughout native walk/run cycles.
    quads=[('front',(0,0,1),[(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]),
           ('back',(0,0,-1),[(1,-1,-1),(-1,-1,-1),(-1,1,-1),(1,1,-1)]),
           ('right',(1,0,0),[(1,-1,1),(1,-1,-1),(1,1,-1),(1,1,1)]),
           ('left',(-1,0,0),[(-1,-1,-1),(-1,-1,1),(-1,1,1),(-1,1,-1)]),
           ('top',(0,1,0),[(-1,1,1),(1,1,1),(1,1,-1),(-1,1,-1)]),
           ('bottom',(0,-1,0),[(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1)])]

    def box(name,kind,bone,lo,hi,rotation=None,origin=None):
        rotation=np.eye(3) if rotation is None else rotation
        origin=np.zeros(3) if origin is None else np.array(origin)
        lo=np.array(lo,dtype=float);hi=np.array(hi,dtype=float)
        center=(lo+hi)/2;half=(hi-lo)/2;start=len(positions)
        for face,normal,verts in quads:
            a,b,c,d=atlas.face(kind,face)
            tex=[(a,d),(c,d),(c,b),(a,b)]
            offset=len(positions)
            for corner,t in zip(verts,tex):
                positions.append(rotation@(center+half*np.array(corner))+origin)
                normals.append(rotation@normal);uvs.append(t)
                joints.append([native['order'][bone],0,0,0]);weights.append([1,0,0,0])
            faces.extend([(offset,offset+1,offset+2),(offset,offset+2,offset+3)])
        parts.append({'name':name,'type':kind,'boneID':bone,'startVertex':start,'vertices':24,'triangles':12})

    box('torso','body',3,(-.227,-.22,-.19),(.227,.60,.11))
    box('head','head',5,(-.25,.56,-.28),(.25,1.06,.22))
    for side,bone,direction in [('left',32,1),('right',22,-1)]:
        anchor=native['global_'][native['ids'][bone]][:3,3]
        # Native human shoulders are narrow. An outward rigid mesh offset
        # puts the block arms beside the torso after the native idle lowers
        # them, instead of burying half of each teal sleeve in the chest.
        shift=.14*direction
        box(side+'-arm','arm',bone,(-.115+shift,-.78,-.125),(.115+shift,.025,.125),
            rotation_between((0,-1,0),(direction,0,0)),anchor)
    for side,bone in [('left',41),('right',51)]:
        anchor=native['global_'][native['ids'][bone]][:3,3]
        # A small overlap at the waist hides the deliberately rigid knee rig.
        box(side+'-leg','leg',bone,(-.112,-.98,-.12),(.112,-.17,.12),origin=anchor)
    arrays=tuple(np.asarray(x) for x in (positions,normals,uvs,faces,weights,joints))
    return arrays,atlas.image,parts


def validate(native,arrays,parts):
    p,n,uv,f,w,j=arrays
    assert len(p)==144 and len(f)==72 and len(parts)==6
    assert np.isfinite(p).all() and np.isfinite(n).all()
    assert f.max()<len(p) and f.min()>=0
    assert np.all(w[:,0]==1) and np.all(w[:,1:]==0)
    assert np.allclose(np.linalg.norm(n,axis=1),1,atol=1e-7)
    assert np.all((uv>0)&(uv<1))
    by_order={i:b for b,i,_ in native['hierarchy']}
    matrices=np.stack([native['global_'][native['ids'][by_order[i]]]@native['inverse'][i] for i in range(24)])
    rest=np.einsum('nij,nj->ni',matrices[j[:,0]],np.c_[p,np.ones(len(p))])[:,:3]
    error=float(np.max(np.abs(rest-p)))
    assert error<2e-5, f'Inverse bind mismatch: {error}'
    assert -1.02<float(p[:,1].min())<-.94
    assert 1.0<float(p[:,1].max())<1.12
    for part in parts:
        vs=p[part['startVertex']:part['startVertex']+24]
        assert np.linalg.matrix_rank(vs-vs.mean(0))==3
        assert set(j[part['startVertex']:part['startVertex']+24,0])=={native['order'][part['boneID']]}
    return {'finiteGeometry':True,'unitNormals':True,'rigidOneBonePerCuboid':True,
        'nativeInverseBindMaximumError':error,'bounds':[p.min(0).tolist(),p.max(0).tolist()]}


def install(output,report):
    # Only root invokes --install after the concurrent Pudge build is finished.
    path=RUNTIME/'manifest.json';manifest=json.loads(path.read_text());files=manifest['models']['files']
    names={f'remote/models/gta3.img/{MODEL_NAME}.{ext}' for ext in ('dff','txd')}
    files[:]=[f for f in files if f.get('path') not in names]
    for ext in ('dff','txd'):
        raw=(output/f'{MODEL_NAME}.{ext}').read_bytes();rel=f'remote/models/gta3.img/{MODEL_NAME}.{ext}'
        (RUNTIME/rel).write_bytes(raw)
        files.append({'path':rel,'originalPath':'/'+rel,'size':len(raw),'sha256':sha(raw),'mimeType':'application/octet-stream'})
    manifest['models']['size']=sum(f['size'] for f in files);manifest['models']['count']=len(files)
    path.write_text(json.dumps(manifest,indent=2)+'\n')
    (RUNTIME/'block-ped-provenance.json').write_text(json.dumps(report,indent=2)+'\n')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--install',action='store_true');args=parser.parse_args()
    template=RUNTIME/'remote/models/gta3.img/male01.dff';native=parse_native(template)
    slot=reference_slot();arrays,atlas,parts=build_geometry(native)
    checks=validate(native,arrays,parts);dff=write_dff(native,MODEL_NAME,*arrays);txd=write_txd(atlas,MODEL_NAME)
    dff+=bytes((-len(dff))%2048);txd+=bytes((-len(txd))%2048)
    assert len(dff)+len(txd)<50*1024
    output=HERE/'output';output.mkdir(exist_ok=True)
    (output/f'{MODEL_NAME}.dff').write_bytes(dff);(output/f'{MODEL_NAME}.txd').write_bytes(txd);atlas.save(output/'atlas.png')
    p,n,uv,f,w,j=arrays
    np.savez_compressed(output/'native-geometry.npz',positions=p,normals=n,uv=uv,faces=f,weights=w,joints=j,
        bone_globals=np.stack([native['global_'][native['ids'][bone]] for bone,_,_ in sorted(native['hierarchy'],key=lambda row:row[1])]),
        inverse=np.stack(native['inverse']))
    report={'modelID':MODEL_ID,'model':MODEL_NAME,'authorship':'Project-authored six-cuboid reference adaptation',
        'reference':REFERENCE.name,'referenceSHA256':sha(REFERENCE.read_bytes()) if REFERENCE.exists() else None,
        'template':'native-vc/runtime/remote/models/gta3.img/male01.dff','templateSHA256':sha(template.read_bytes()),
        'vertices':len(p),'triangles':len(f),'nativeBones':24,'weightedBones':6,'nativeMaterials':1,
        'textureDimensions':[128,128],'textureFilter':'nearest','parts':parts,'checks':checks,'slot':slot,
        'nativeGPUExecuted':False,'files':[{'path':f'remote/models/gta3.img/{MODEL_NAME}.{ext}','size':len(raw),'sha256':sha(raw)} for ext,raw in [('dff',dff),('txd',txd)]]}
    (output/'model-report.json').write_text(json.dumps(report,indent=2)+'\n')
    if args.install:install(output,report)
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
