#!/usr/bin/env python3
"""A separate CJ-like native extra plus the unchanged, already shipped club NPC.

The new extra is deliberately a VC-native visual nod (white top, blue jeans),
not an assertion that an original San Andreas/CJ mesh is included. The pixel
atlas is authored below, not an edit of a supplied raster. No game asset is
downloaded or original model overwritten.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import struct
import sys
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RUNTIME = ROOT / 'dist/native-vc/runtime'
sys.path.insert(0, str(HERE.parent / 'block-ped'))
from rw_native import children, parse_native, write_dff, write_txd

MODEL_ID, MODEL_NAME = 108, 'egecj'
DANCER_ID, DANCER_NAME = 109, 'stripa'


def sha(raw): return hashlib.sha256(raw).hexdigest()


def embedded(path):
    manifest = json.loads((RUNTIME/'manifest.json').read_text())
    glue = (RUNTIME/'index.js').read_text()
    match = re.search(r'\{"filename": "'+re.escape(path)+r'", "start": (\d+), "end": (\d+)\}', glue)
    assert match, f'Missing bundled file: {path}'
    start, end = map(int, match.groups()); data = bytearray(end-start)
    for part in manifest['data']['chunks']:
        lo=max(start,part['offset']); hi=min(end,part['offset']+part['size'])
        if lo>=hi: continue
        blob=(RUNTIME/part['path']).read_bytes()
        assert len(blob)==part['size'] and sha(blob)==part['sha256']
        data[lo-start:hi-start]=blob[lo-part['offset']:hi-part['offset']]
    return bytes(data)


def geometry(path):
    top=list(children(next(children(path.read_bytes()))[2]))
    gl=next(x[2] for x in top if x[0]==26)
    g=next(x[2] for x in children(gl) if x[0]==15)
    st=next(x[2] for x in children(g) if x[0]==1)
    flags,nt,nv,nm=struct.unpack_from('<4I',st); assert nm==1
    off=28+(4*nv if flags&8 else 0)
    sets=(flags>>16)&255 or (2 if flags&128 else 1 if flags&4 else 0)
    uv=np.frombuffer(st,'<f4',nv*2,off).reshape(-1,2).copy()
    off+=8*nv*sets
    tri=np.frombuffer(st,'<u2',nt*4,off).reshape(-1,4)
    faces=tri[:,[1,0,3]].copy(); off+=8*nt+24
    positions=np.frombuffer(st,'<f4',nv*3,off).reshape(-1,3).copy(); off+=12*nv
    normals=np.frombuffer(st,'<f4',nv*3,off).reshape(-1,3).copy()
    skin=next(payload for t,_,ext,_ in children(g) if t==3 for k,_,payload,_ in children(ext) if k==0x116)
    joints=np.frombuffer(skin,'u1',nv*4,4).reshape(-1,4).copy()
    weights=np.frombuffer(skin,'<f4',nv*4,4+4*nv).reshape(-1,4).copy()
    return positions,normals,uv,faces,weights,joints


def authored_atlas():
    # Four 64x64 panels: face; white cotton; blue denim; neutral palette.
    atlas=Image.new('RGB',(128,128),(104,67,44)); draw=ImageDraw.Draw(atlas)
    draw.rectangle((0,0,63,63),fill=(111,72,49))
    # Short hair, ears, brows, small eyes and a mouth; deliberately low-detail.
    draw.rectangle((0,0,63,15),fill=(29,24,20))
    draw.rectangle((0,15,7,31),fill=(38,29,22));draw.rectangle((56,15,63,31),fill=(38,29,22))
    draw.rectangle((12,29,25,31),fill=(43,30,22));draw.rectangle((38,29,51,31),fill=(43,30,22))
    draw.rectangle((14,32,23,35),fill=(187,168,140));draw.rectangle((40,32,49,35),fill=(187,168,140))
    draw.rectangle((19,32,22,35),fill=(25,23,22));draw.rectangle((40,32,43,35),fill=(25,23,22))
    draw.rectangle((29,36,34,45),fill=(127,82,53));draw.rectangle((27,45,36,47),fill=(88,54,38))
    draw.rectangle((21,51,42,53),fill=(66,42,33));draw.rectangle((23,54,40,56),fill=(126,79,53))
    draw.rectangle((64,0,127,63),fill=(226,225,213))
    for x in (67,70,121,124):draw.line((x,4,x,59),fill=(205,206,197),width=1)
    draw.line((68,56,123,56),fill=(194,198,190),width=2)
    draw.rectangle((0,64,63,127),fill=(43,66,92))
    for x in range(1,64,4): draw.line((x,65,x,126),fill=(48,72,98),width=1)
    draw.line((9,65,9,126),fill=(73,87,101),width=1);draw.line((54,65,54,126),fill=(73,87,101),width=1)
    draw.rectangle((64,64,95,95),fill=(107,70,47))
    draw.rectangle((96,64,127,95),fill=(30,26,23))
    draw.rectangle((64,96,95,127),fill=(31,34,36))
    draw.rectangle((96,96,127,127),fill=(187,151,61))
    return atlas


def paint_uv(native, arrays):
    positions,normals,uv,faces,weights,joints=arrays
    uv=uv.copy(); order_to_bone={i:b for b,i,_ in native['hierarchy']}
    dominant=joints[np.arange(len(joints)),np.argmax(weights,axis=1)]
    for index,(x,y,z) in enumerate(positions):
        bone=order_to_bone[int(dominant[index])]
        if bone==5:
            if z > -.04: # original native head faces +Z in bind coordinates
                u=np.clip((x+.09)/.18,0,1);v=np.clip((.91-y)/.25,0,1)
                uv[index]=((2+u*59)/128,(2+v*59)/128)
            else: uv[index]=(112/128,80/128) # back of cropped hair
        elif bone==4 or bone in (21,22,23,24,25,31,32,33,34,35):
            uv[index]=(80/128,80/128)
        elif y < -.81:
            uv[index]=(80/128,112/128)
        elif y < .08 or bone in (41,42,43,51,52,53,2000,2001):
            u=np.clip((x+.26)/.52,0,1);v=np.clip((.12-y)/.95,0,1)
            uv[index]=((2+u*59)/128,(66+v*59)/128)
        elif y>.52 and abs(x)<.09:
            uv[index]=(80/128,80/128) # open neckline
        else:
            u=np.clip((x+.25)/.5,0,1);v=np.clip((.65-y)/.65,0,1)
            uv[index]=((66+u*59)/128,(2+v*59)/128)
    return positions,normals,uv,faces,weights,joints


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--install',action='store_true');args=parser.parse_args()
    out=HERE/'output';out.mkdir(exist_ok=True)
    source=RUNTIME/'remote/models/gta3.img/male01.dff'
    native=parse_native(source);arrays=paint_uv(native,geometry(source));atlas=authored_atlas()
    raw=write_dff(native,MODEL_NAME,*arrays); raw+=bytes((-len(raw))%2048)
    txd=write_txd(atlas,MODEL_NAME);txd+=bytes((-len(txd))%2048)
    (out/(MODEL_NAME+'.dff')).write_bytes(raw);(out/(MODEL_NAME+'.txd')).write_bytes(txd)
    atlas.save(out/'atlas.png')
    p,n,uv,f,w,j=arrays
    assert len(p)==941 and len(f)==970 and np.isfinite(p).all()
    assert np.allclose(w.sum(1),1,atol=1e-5) and int(j.max())<24
    np.savez(out/'native-geometry.npz',positions=p,normals=n,uv=uv,faces=f,weights=w,joints=j,
             bone_globals=np.stack([native['global_'][native['ids'][b]] for b,i,_ in sorted(native['hierarchy'],key=lambda x:x[1])]),inverse=np.stack(native['inverse']))
    ide=embedded('/vc-assets/local/data/default.ide').decode()
    peds=re.search(r'^peds\s*\n(.*?)^end',ide,re.M|re.S).group(1)
    assert not re.search(r'^\s*108\s*,',peds,re.M)
    assert re.search(r'^109,\s*special01,\s*generic,',peds,re.M)
    dancer=[]
    for ext in ('dff','txd'):
        name=f'{DANCER_NAME}.{ext}';data=embedded('/vc-assets/local/models/gta3.img/'+name)
        dancer.append({'path':'/vc-assets/local/models/gta3.img/'+name,'size':len(data),'sha256':sha(data)})
        (out/name).write_bytes(data)
    files=[]
    for ext,data in (('dff',raw),('txd',txd)):
        path=f'remote/models/gta3.img/{MODEL_NAME}.{ext}'
        files.append({'path':path,'originalPath':'/'+path,'size':len(data),'sha256':sha(data),'mimeType':'application/octet-stream'})
    report={'modelID':MODEL_ID,'model':MODEL_NAME,'description':'VC-native human extra inspired by CJ: white top and blue jeans; not an original San Andreas model',
            'sourceMesh':'remote/models/gta3.img/male01.dff','sourceSHA256':sha(source.read_bytes()),
            'vertices':len(p),'triangles':len(f),'nativeBones':24,'originalMeshAndSkinWeightsPreserved':True,
            'texture':'128x128 project-authored colour atlas','dancer':{'modelID':DANCER_ID,'model':DANCER_NAME,'files':dancer,'alreadyBundled':True,'bytesModified':False},
            'slots':{'108':'vacant native slot','109':'unused special01 assigned to existing stripa only'},
            'files':files,'additionalDownloadBytes':sum(x['size'] for x in files),'nativeGPUExecuted':False}
    (out/'model-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if args.install:
        manifest=json.loads((RUNTIME/'manifest.json').read_text())
        names={x['path'] for x in files};manifest['models']['files']=[x for x in manifest['models']['files'] if x['path'] not in names]
        manifest['models']['files'].extend(files);manifest['models']['count']=len(manifest['models']['files']);manifest['models']['size']=sum(x['size'] for x in manifest['models']['files'])
        for entry in files:
            path=RUNTIME/entry['path'];path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes((out/path.name).read_bytes())
        (RUNTIME/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
        (RUNTIME/'arrival-cast-provenance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
