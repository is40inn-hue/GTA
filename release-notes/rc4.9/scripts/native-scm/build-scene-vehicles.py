#!/usr/bin/env python3
"""RC4.9: tiny authored native bike and patrol variant of the supplied Maverick.

No downloaded game models. Native PCJ handling/collision/bikes.ifp and native
POLMAV handling/collision are already in the supplied package. The frame names
are verified against reVC VehicleModelInfo.cpp/Bike.cpp, saved in rc49-source.
"""
from pathlib import Path
import argparse, hashlib, json, struct, sys
import numpy as np
from PIL import Image

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
RUNTIME=ROOT/'dist/native-vc/runtime'
sys.path.insert(0,str(HERE.parent/'block-ped'))
from rw_native import chunk, children, write_txd

def sha(b):return hashlib.sha256(b).hexdigest()
def sector(b):return b+bytes((-len(b))%2048)
def parts(b):return [(k,p) for k,_,p,_ in children(b)]
def first(b,k):return next(p for t,p in parts(b) if t==k)
def nodename(n):return chunk(3,chunk(0x253f2fe,n.encode()+b'\0'))

class Mesh:
    def __init__(self):self.p=[];self.n=[];self.c=[];self.f=[]
    def face(self,verts,colour):
        off=len(self.p);v=np.array(verts,float);normal=np.cross(v[1]-v[0],v[2]-v[0]);normal/=np.linalg.norm(normal)
        for point in v:self.p.append(point);self.n.append(normal);self.c.append((*colour,255))
        for i in range(1,len(v)-1):self.f.append((off,off+i,off+i+1))
    def box(self,lo,hi,col):
        lo=np.array(lo);hi=np.array(hi)
        for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
            corners=[(lo[0],lo[1],lo[2]),(hi[0],lo[1],lo[2]),(hi[0],hi[1],lo[2]),(lo[0],hi[1],lo[2]),(lo[0],lo[1],hi[2]),(hi[0],lo[1],hi[2]),(hi[0],hi[1],hi[2]),(lo[0],hi[1],hi[2])]
            self.face([corners[i] for i in face],col)
    def cylinder(self,a,b,r,col,segments=12):
        a=np.array(a,float);b=np.array(b,float);axis=b-a;axis/=np.linalg.norm(axis)
        u=np.cross(axis,[0,0,1] if abs(axis[2])<.9 else [1,0,0]);u/=np.linalg.norm(u);v=np.cross(axis,u)
        ring=[r*(np.cos(i*2*np.pi/segments)*u+np.sin(i*2*np.pi/segments)*v) for i in range(segments)]
        for i in range(segments):
            j=(i+1)%segments;self.face([a+ring[i],a+ring[j],b+ring[j],b+ring[i]],col)
        self.face([a+x for x in reversed(ring)],col);self.face([b+x for x in ring],col)
    def geometry(self):
        p=np.array(self.p);n=np.array(self.n);c=np.array(self.c,dtype='u1');f=np.array(self.f,dtype='<u2')
        center=(p.min(0)+p.max(0))/2;radius=np.linalg.norm(p-center,axis=1).max()
        st=struct.pack('<4I3f',0x7a,len(f),len(p),1,1,.15,1)+c.tobytes()
        rt=np.zeros((len(f),4),dtype='<u2');rt[:,0]=f[:,1];rt[:,1]=f[:,0];rt[:,3]=f[:,2]
        st+=rt.tobytes()+struct.pack('<4f2I',*center,radius,1,1)+np.asarray(p,'<f4').tobytes()+np.asarray(n,'<f4').tobytes()
        mat=chunk(7,chunk(1,struct.pack('<I4BII3f',0,255,255,255,255,0,0,1,.15,1))+chunk(3,b''))
        mats=chunk(8,chunk(1,struct.pack('<Ii',1,-1))+mat)
        ind=np.array(f,'<u4').ravel();bm=chunk(0x50e,struct.pack('<5I',0,1,len(ind),len(ind),0)+ind.tobytes())
        return chunk(0xf,chunk(1,st)+mats+chunk(3,bm+chunk(0x105,struct.pack('<I',0))))

def frame(name,parent,pos=(0,0,0)):
    return (name,parent,tuple(pos))
def frame_chunk(frames):
    st=struct.pack('<I',len(frames))
    for name,parent,pos in frames:st+=struct.pack('<12f2i',1,0,0,0,1,0,0,0,1,*pos,parent,0)
    return chunk(0xe,chunk(1,st)+b''.join(nodename(n) for n,_,_ in frames))
def atomic(frame_index,geometry_index):
    # Use the actual supplied vehicle atomic MatFX plugin, not a ped/morph
    # extension. Native material setup installs the vehicle callback itself.
    return chunk(0x14,chunk(1,struct.pack('<4I',frame_index,geometry_index,5,0))+chunk(3,chunk(0x120,struct.pack('<I',1))))

def build_bike():
    # +Y is forward and +Z up. Wheel rotations are native, each pivot is real.
    frames=[frame('pcj600',-1),frame('chassis_dummy',0),frame('forks_front',1,(0,.40,.48)),
        frame('forks_rear',1,(0,-.25,.12)),frame('wheel_front',2,(0,.38,-.69)),
        frame('wheel_rear',3,(0,-.57,-.33)),frame('mudguard',2,(0,.38,-.69)),
        frame('handlebars',1,(0,.40,.48)),frame('ped_frontseat',1,(0,-.27,.55)),
        frame('ped_backseat',1,(0,-.65,.58)),frame('headlights',1,(0,.78,.51)),
        frame('taillights',1,(0,-1.06,.45)),frame('exhaust',1,(.24,-1.05,-.08))]
    meshes=[]
    def mesh(index):m=Mesh();meshes.append((index,m));return m
    ink=(27,33,49);cream=(219,216,194);metal=(146,156,161);pink=(167,35,79);rubber=(21,21,24)
    m=mesh(1)
    m.box((-.20,-.55,-.14),(.20,.22,.18),metal)
    m.box((-.26,-.1,.18),(.26,.45,.44),pink)
    m.box((-.25,-.91,.39),(.25,-.10,.57),ink)
    m.box((-.22,-1.03,.22),(.22,-.68,.42),cream)
    m.box((-.20,-1.06,.35),(.20,-1.03,.44),(216,29,44))
    for x in (-.18,.18):
        m.cylinder((x,-.72,.12),(x,.40,.40),.038,ink,8)
        m.cylinder((x,.30,.05),(x,-.61,.40),.035,ink,8)
    m.cylinder((.25,-.95,-.15),(.25,-.13,-.15),.062,metal,10)
    m.box((-.33,-.31,-.04),(.33,-.22,.015),metal)
    for i,sign in enumerate((-.13,.13)):
        m=mesh(2) if i==0 else m
        m.cylinder((sign,0,0),(sign,.38,-.69),.032,metal,8)
    m=mesh(3)
    for x in (-.13,.13):m.cylinder((x,0,0),(x,-.57,-.33),.028,ink,8)
    for index in (4,5):
        m=mesh(index);m.cylinder((-.10,0,0),(.10,0,0),.335,rubber,16)
        m.cylinder((-.106,0,0),(.106,0,0),.212,metal,12)
        m.cylinder((-.11,0,0),(.11,0,0),.080,ink,8)
    m=mesh(6);m.box((-.13,-.19,.28),(.13,.19,.33),pink)
    m=mesh(7);m.cylinder((-.34,0,.15),(.34,0,.15),.026,metal,8)
    m.cylinder((-.41,0,.15),(-.27,0,.15),.04,rubber,8);m.cylinder((.27,0,.15),(.41,0,.15),.04,rubber,8)
    m.cylinder((0,.30,.04),(0,.39,.04),.13,ink,12)
    m.cylinder((0,.39,.04),(0,.40,.04),.108,(255,237,168),12)
    dff=chunk(0x10,chunk(1,struct.pack('<III',len(meshes),0,0))+frame_chunk(frames)+
        chunk(0x1a,chunk(1,struct.pack('<I',len(meshes)))+b''.join(m.geometry() for _,m in meshes))+
        b''.join(atomic(fi,i) for i,(fi,_) in enumerate(meshes))+chunk(3,b''))
    report={'model':191,'name':'pcj600','authored':True,'nativeType':'bike','handling':'BIKE','animationGroup':'bikes',
        'frameNames':[f[0] for f in frames],'triangles':sum(len(m.f) for _,m in meshes),'vertices':sum(len(m.p) for _,m in meshes),
        'frontWheelCenter':[0,.78,-.21],'rearWheelCenter':[0,-.82,-.21],'wheelRadius':.335,
        'frontForkLength':float(np.linalg.norm([0,.38,-.69])),'rearForkLength':float(np.linalg.norm([0,-.57,-.33])),
        'collision':'existing bundled vehicles.col pcj600; visible handlebar ends are cosmetic',
        'requiredNativeNodes':'chassis_dummy/forks_front/forks_rear/wheel_front/wheel_rear/mudguard/handlebars',
        'runtimeExecuted':False}
    return sector(dff),sector(write_txd(Image.new('RGB',(8,8),(219,216,194)),'ege_bike')),report

def build_patrol():
    original=(RUNTIME/'remote/models/gta3.img/maverick.dff').read_bytes()
    top=parts(first(original,0x10));frames=parts(next(v for k,v in top if k==0xe));st=frames[0][1]
    n=struct.unpack_from('<I',st)[0];extra=Mesh()
    # Real extra geometry: paired engine/camera housings, undernose searchlight,
    # and high-contrast patrol stripe. All retain the supplied collider extent.
    for x in (-.70,.70):
        extra.cylinder((x,-.70,1.48),(x,.75,1.48),.25,(37,47,69),12)
        extra.cylinder((x,.75,1.48),(x,.78,1.48),.21,(194,200,201),12)
        extra.box((x-.22,-.14,1.67),(x+.22,.08,1.78),(230,228,212))
    extra.cylinder((0,2.58,-.27),(0,2.83,-.27),.28,(29,36,51),12)
    extra.cylinder((0,2.83,-.27),(0,2.85,-.27),.23,(255,244,183),12)
    extra.box((-.29,-.15,1.50),(.29,.15,1.85),(35,74,166))
    extra.box((-.28,.03,1.85),(.28,.14,1.92),(179,43,80))
    # New attachment is a regular frame under chassis_dummy (index8), not a new
    # engine semantic node; native rotor/door/seat nodes stay byte-identical.
    newst=struct.pack('<I',n+1)+st[4:]+struct.pack('<12f2i',1,0,0,0,1,0,0,0,1,0,0,0,8,0)
    framebytes=chunk(0xe,chunk(1,newst)+b''.join(chunk(k,v) for k,v in frames[1:])+nodename('patrol_equipment'))
    gl=parts(next(v for k,v in top if k==0x1a));ng=struct.unpack_from('<I',gl[0][1])[0]
    geombytes=chunk(0x1a,chunk(1,struct.pack('<I',ng+1))+b''.join(chunk(k,v) for k,v in gl[1:])+extra.geometry())
    na=sum(k==0x14 for k,v in top)
    result=chunk(0x10,chunk(1,struct.pack('<III',na+1,0,0))+framebytes+geombytes+
        b''.join(chunk(k,v) for k,v in top if k==0x14)+atomic(n,ng)+chunk(3,b''))
    report={'model':227,'name':'polmav','label':'патрульный вертолёт','basedOn':'supplied Maverick geometry',
        'sourceSHA256':sha(original),'handling':'POLMAV','collision':'existing bundled vehicles.col polmav',
        'originalFrameCount':n,'frameCount':n+1,'originalGeometryCount':ng,'geometryCount':ng+1,
        'addedTriangles':len(extra.f),'addedVertices':len(extra.p),'changes':['paired roof equipment pods','undernose searchlight','patrol beacon'],
        'originalNodeTransformsPreserved':True,'originalGeometryPreserved':True,'runtimeExecuted':False}
    return sector(result),sector((RUNTIME/'remote/models/gta3.img/maverick.txd').read_bytes()),report

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--install',action='store_true');args=ap.parse_args()
    out=HERE/'scene-vehicles';out.mkdir(exist_ok=True)
    reports=[];files=[]
    for name,built in [('pcj600',build_bike()),('polmav',build_patrol())]:
        dff,txd,report=built;reports.append(report)
        for ext,b in [('dff',dff),('txd',txd)]:
            (out/(name+'.'+ext)).write_bytes(b);rel='remote/models/gta3.img/'+name+'.'+ext
            files.append({'path':rel,'originalPath':'/'+rel,'size':len(b),'sha256':sha(b),'mimeType':'application/octet-stream'})
            if args.install:(RUNTIME/rel).write_bytes(b)
    report={'version':'rc4.9','models':reports,'files':files,'additionalBytes':sum(f['size'] for f in files),
        'runtimeExecuted':False,'newExternalGameAssets':False,
        'sourceCodeReference':'https://github.com/mrxenginner/reVC/tree/miami/src','nativeDefinitionsUnmodified':True}
    (out/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if args.install:
        mp=RUNTIME/'manifest.json';m=json.loads(mp.read_text());paths={f['path'] for f in files}
        m['models']['files']=[f for f in m['models']['files'] if f['path'] not in paths]+files
        m['models']['count']=len(m['models']['files']);m['models']['size']=sum(f['size'] for f in m['models']['files'])
        mp.write_text(json.dumps(m,indent=2)+'\n');(RUNTIME/'scene-vehicles-provenance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
