#!/usr/bin/env python3
"""CPU geometry preview of actual DFF bytes; not a game screenshot or GPU test."""
from pathlib import Path
import sys,struct
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
sys.path.insert(0,str(HERE.parent/'block-ped'))
from rw_native import children
def ps(b):return [(k,p) for k,_,p,_ in children(b)]
def child(b,k):return next(p for t,p in ps(b) if k==t)
def mesh(name):
    raw=(ROOT/'dist/native-vc/runtime/remote/models/gta3.img'/f'{name}.dff').read_bytes();top=ps(child(raw,0x10))
    fp=ps(next(p for k,p in top if k==0xe));st=fp[0][1];mats=[]
    names=[child(p,0x253f2fe).decode().rstrip('\0') for _,p in fp[1:]]
    for i in range(struct.unpack_from('<I',st)[0]):
        row=struct.unpack_from('<12f2i',st,4+i*56);m=np.eye(4);m[:3,:3]=np.array(row[:9]).reshape(3,3).T;m[:3,3]=row[9:12]
        mats.append(m if row[12]<0 else mats[row[12]]@m)
    gs=[p for k,p in ps(next(p for k,p in top if k==0x1a)) if k==0xf];out=[]
    for atom in [p for k,p in top if k==0x14]:
        fi,gi,_,_=struct.unpack('<4I',child(atom,1))
        # Alpha rotor sheets need their original texture. Omit only from this
        # geometry-only inspection, along with the duplicate low-detail mesh.
        if 'rotor' in names[fi] or '_vlo' in names[fi]:continue
        g=gs[gi];s=child(g,1);flags,nt,nv,_=struct.unpack_from('<4I',s);o=28
        colors=np.frombuffer(s,'u1',nv*4,o).reshape(-1,4).copy()/255 if flags&8 else None
        if flags&8:o+=nv*4
        sets=(flags>>16)&255 or (2 if flags&128 else 1 if flags&4 else 0);o+=8*nv*sets
        t=np.frombuffer(s,'<u2',nt*4,o).reshape(-1,4).copy();o+=nt*8+24
        p=np.frombuffer(s,'<f4',nv*3,o).reshape(-1,3).copy();p=(mats[fi]@np.c_[p,np.ones(nv)].T).T[:,:3]
        matcols=[]
        for k,v in ps(child(g,8)):
            if k!=7:continue
            rgba=np.array(struct.unpack_from('<4B',child(v,1),4),float)/255
            if tuple((rgba*255).astype(int)[:3])==(60,255,0):rgba=np.array([.10,.15,.24,1])
            if tuple((rgba*255).astype(int)[:3])==(255,0,175):rgba=np.array([.87,.87,.82,1])
            matcols.append(rgba)
        for row in t:
            idx=row[[1,0,3]];face=p[idx];col=colors[idx].mean(0) if colors is not None else matcols[row[2]]
            normal=np.cross(face[1]-face[0],face[2]-face[0]);length=np.linalg.norm(normal)
            if length<1e-9:continue
            shade=.60+.40*abs(normal/length@np.array([.3,.4,.866]));col=col.copy();col[:3]*=shade
            out.append((face,col))
    return out
fig=plt.figure(figsize=(12,5),facecolor='#f6f0df')
for i,(name,title) in enumerate([('pcj600','Лёгкий native-мотоцикл'),('polmav','Патрульный вертолёт')]):
    ax=fig.add_subplot(1,2,i+1,projection='3d');ax.set_facecolor('#f6f0df');faces=mesh(name)
    ax.add_collection3d(Poly3DCollection([f for f,c in faces],facecolors=[c for f,c in faces],edgecolor='none',linewidth=.1))
    p=np.concatenate([f for f,c in faces]);center=(p.min(0)+p.max(0))/2;half=(p.max(0)-p.min(0))/2;range_=max(half)*1.03
    ax.set_xlim(center[0]-range_,center[0]+range_);ax.set_ylim(center[1]-range_,center[1]+range_);ax.set_zlim(center[2]-range_,center[2]+range_)
    ax.set_box_aspect((1,1,1));ax.view_init(elev=14,azim=42 if name=='pcj600' else 47);ax.set_axis_off();ax.set_title(title,color='#23273f',fontsize=15,pad=0)
fig.text(.5,.04,'CPU-проверка DFF · движок не запущен · текстуры упрощены, альфа-роторы скрыты в превью',ha='center',fontsize=10,color='#625e5a')
out=HERE/'scene-vehicles/CPU-RC49-vehicles.png';fig.savefig(out,dpi=150,bbox_inches='tight');print(out)
