#!/usr/bin/env python3
"""Execute the shipped SCM branch bytecode with explicit native-query fixtures.

This validates program branches/deadlines/records. It is not a WASM physics,
boarding animation, native renderer, or visual gameplay test.
"""
import contextlib,io,json,pathlib,runpy,sys
HERE=pathlib.Path(__file__).resolve().parent
sys.argv=['review-custom-scm.py',str(HERE/'native-exam-main.scm')]
with contextlib.redirect_stdout(io.StringIO()):R=runpy.run_path(str(HERE/'review-custom-scm.py'))
C=json.loads((HERE/'native-exam-main.contract.json').read_text())
rows=R['rows'];ins={r[0]:r for r in rows};nxt={r[0]:rows[i+1][0] if i+1<len(rows) else None for i,r in enumerate(rows)}
fields={k:C['globalByteOffset']+v['offset'] for k,v in C['fields'].items()};labels=C['validation']['labels']

class VM:
    def __init__(self):
        self.mem={};self.events=[];self.now=0;self.driver=-1;self.onbike=False;self.alive=True;self.bikeDead=False
        self.bikePos=[294.2,-1072,11.2];self.targetPos=[288.8,-1083,10.85]
        for key,value in {'phase':2,'scene':1,'arrivalStage':5,'escapeState':1,'escapeDeadline':6500,
            'escapeRetryAt':3300,'escapeAttempts':1,'escapeBike':500,'ambient2':102,'ped':99,
            'pickup':-1,'pickupBlip':-1,'target0_handle':201,'target1_handle':-1,'target2_handle':-1}.items():self.set(key,value)
    def set(self,k,v):self.mem[fields[k]]=v
    def get(self,k):return self.mem.get(fields[k],0)
    def run(self,start,stop,limit=3000):
        pc=labels[start];stop=labels[stop];cmp=False;steps=0
        def value(v):return self.mem.get(int(v[1:]),0) if isinstance(v,str) and v.startswith('G') else v
        def put(dst,v):assert isinstance(dst,str) and dst.startswith('G');self.mem[int(dst[1:])]=v
        while steps<limit:
            if pc==stop and steps:break
            at,op,name,a=ins[pc];pc=nxt[at];steps+=1;v=list(map(value,a))
            if op in [0x0001,0x00d6]:pass
            elif op in [0x0004,0x0005,0x0084,0x0086]:put(a[0],v[1])
            elif op==0x0008:put(a[0],v[0]+v[1])
            elif op==0x0002:pc=v[0]
            elif op==0x004d:
                if not cmp:pc=v[0]
            elif op in [0x0038,0x003a]:cmp=v[0]==v[1]
            elif op in [0x0018,0x001c]:cmp=v[0]>v[1]
            elif op==0x0028:cmp=v[0]>=v[1]
            elif op==0x056d:cmp=v[0]==102 and self.alive
            elif op==0x0118:cmp=not self.alive
            elif op==0x0119:cmp=self.bikeDead if v[0]==500 else v[0]<0
            elif op==0x00db:cmp=self.onbike
            elif op==0x00df:cmp=self.onbike
            elif op==0x046c:put(a[1],self.driver)
            elif op==0x00aa:
                for dst,p in zip(a[1:],self.bikePos if v[0]==500 else self.targetPos):put(dst,p)
            elif op==0x01af:
                cmp=all(abs(x-p)<=r for x,p,r in zip(self.bikePos,v[1:4],v[4:7]))
            elif op==0x04c4:
                for dst,p in zip(a[4:],[290,-1068,11.5]):put(dst,p)
                self.events.append((op,v))
            elif op==0x032b:put(a[-1],900);self.events.append((op,v))
            elif op==0x03dc:put(a[-1],901);self.events.append((op,v))
            elif op==0x01bd:put(a[0],self.now)
            elif op==0x0225:put(a[1],100)
            elif op==0x0054:
                for dst,p in zip(a[1:],[290,-1065,11.5]):put(dst,p)
            elif op==0x0172:put(a[1],180)
            elif op==0x01c0:put(a[1],0)
            elif op in [0x02ac,0x0519,0x00ad,0x00ae,0x02c2,0x01d5,0x011c,0x01d0,
                        0x009b,0x00a6,0x0397,0x01b4,0x0110,0x01f0,0x0291,0x01ed]:
                self.events.append((op,v))
            else:raise AssertionError(('unsupported fixture instruction',at,hex(op),name,a))
        else:raise AssertionError('Unbounded SCM branch')
        return steps
    def escape(self):return self.run('ambient_done','escape_done')

def audit():
    cases=[]
    # Native occupancy is not enough: the exact actor must be the actual driver.
    m=VM();m.now=1200;m.onbike=True;m.driver=102;m.set('nativeTimer',1200);m.escape()
    assert m.get('escapeState')==2 and m.get('escapeEntered')==1 and m.get('pickup')==-1
    assert sum(op==0x02c2 for op,_ in m.events)==1
    assert not any(op==0x036a for op,_ in m.events)
    cases.append('real driver confirmation starts AI without teleport or early pickup')
    # The camera/player may take a moment: use native time and real distance.
    m.set('nativeTimer',1800);m.bikePos[1]-=1;m.escape()
    assert m.get('escapeState')==2 and m.get('pickup')==-1
    m.set('nativeTimer',2300);m.bikePos[1]-=7;m.escape()
    assert m.get('escapeState')==3 and m.get('escapeDeparted')==1 and m.get('pickup')==900
    assert m.get('target0_credited')==0 and m.get('completed')==0
    before=sum(op==0x032b for op,_ in m.events);m.escape();assert sum(op==0x032b for op,_ in m.events)==before==1
    cases.append('departure requires actual movement and releases exactly one pickup without score')
    m=VM();m.onbike=True;m.driver=107;m.set('nativeTimer',1000);m.escape()
    assert m.get('escapeEntered')==0 and m.get('escapeState')==1
    cases.append('passenger or different driver does not count as Pudge boarding')
    m=VM();m.set('nativeTimer',3400);m.escape();assert m.get('escapeAttempts')==2
    m.set('nativeTimer',4000);m.escape();assert sum(op==0x01d5 for op,_ in m.events)==1
    m.set('nativeTimer',6501);m.escape();assert m.get('escapeState')==4 and m.get('pickup')==900
    assert not m.get('escapeEntered') and not m.get('escapeDeparted')
    cases.append('blocked boarding retries once, times out, releases pickup and never fabricates departure')
    m=VM();m.onbike=True;m.driver=102;m.set('nativeTimer',1000);m.escape()
    m.set('nativeTimer',4501);m.escape();assert m.get('escapeState')==4 and m.get('pickup')==900
    assert m.get('escapeEntered')==1 and m.get('escapeDeparted')==0
    assert not any(op==0x01d0 for op,_ in m.events),'Seated rider must not receive a foot-flee task'
    cases.append('stalled native AI yields after 3.5 seconds and preserves factual entry-only record')
    for failure in ['actor','bike','fall']:
        m=VM()
        if failure=='actor':m.alive=False
        elif failure=='bike':m.bikeDead=True
        else:m.set('escapeState',2);m.set('escapeEntered',1)
        m.escape();assert m.get('escapeState')==4 and m.get('pickup')==900
    cases.append('missing actor, destroyed bike and dismounted actor all release scored play')
    for phase in [1,4]:
        m=VM();m.set('phase',phase);m.now=100000;m.run('native_loop','native_loop')
        assert m.get('escapeState')==1 and m.get('pickup')==-1 and m.get('mapValid')==0
        assert not m.events
    cases.append('briefing/background prepare cannot play the vignette or expose stale map target')
    # Run the production finish and immutable-record replay branches.
    m=VM();m.set('escapeEntered',1);m.set('escapeDeparted',1)
    for name in ['copCar','chaseHeli','courier','streetTaxi','traffic0','traffic1']:m.set(name,-1)
    m.run('finish_scene','native_loop');assert m.get('record1_escapeEntered')==m.get('record1_escapeDeparted')==1
    assert m.get('escapeBike')==-1 and m.get('completed')==1
    assert sum(op==0x00a6 and args[0]==500 for op,args in m.events)==1
    m.events=[];m.set('escapeEntered',0);m.run('prepare1','native_loop')
    assert m.get('escapeEntered')==1 and m.get('phase')==3 and not m.events
    cases.append('finish removes optional bike; completed-scene replay restores facts without spawning')
    for scene,expected_kind in [(1,4),(2,2),(3,1)]:
        m=VM();m.set('scene',scene);m.run('gameplay','map_done')
        assert m.get('mapValid')==1 and m.get('mapTargetKind')==expected_kind
    for stage,scene in enumerate(C['scenes'][1]['route']):
        m=VM();m.set('scene',2);m.set('hijacked',1);m.set('routeStage',stage);m.run('gameplay','map_done')
        assert m.get('mapTargetKind')==3
        assert [m.get('mapTargetX'),m.get('mapTargetY'),m.get('mapTargetZ')]==scene
    cases.append('radar uses native target or current route stage and marks phase validity')
    return {'nativeRuntimeExecuted':False,'source':'actual compiled SCM bytecode; explicit native-query fixtures',
            'passed':len(cases),'cases':cases,'scmSHA256':C['sha256']}

if __name__=='__main__':print(json.dumps(audit(),ensure_ascii=False,indent=2))
