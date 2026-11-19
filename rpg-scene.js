/* GTA exam: one small, real WebGL RPG scene.
 * Geometry builder and WebGL matrix/buffer foundations adapted from the user's
 * GTA-2026-miniapp/src/world3d.js. New actors, flight simulation and UI.
 * No external engine, models, textures or network requests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTARPGScene = Object.freeze({ mount: api.mount });
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const PI = Math.PI, HERO = [0, 0, 3.2], SPEED = 31, GRAVITY = .6;
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const finite = (v,f=0) => Number.isFinite(Number(v)) ? Number(v) : f;
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const mul = (a,s) => [a[0]*s,a[1]*s,a[2]*s];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function normalize(a) {const length=Math.hypot(a[0],a[1],a[2])||1;return mul(a,1/length);}
  function direction(yaw,pitch) {return [Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];}
  function angles(origin,target) {const d=sub(target,origin);return {yaw:Math.atan2(d[0],-d[2]),pitch:Math.atan2(d[1],Math.hypot(d[0],d[2]))};}
  function mix(a,b,k) {return a+(b-a)*k;}
  function hex(value,alpha=1) {const n=parseInt(value.replace('#',''),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255,alpha];}
  function vector(v,f) {return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)?v.map(n=>clamp(n,-250,250)):f.slice();}
  function hits(s) {return s.shots.filter(v=>v.hit).length;}
  function validResult(raw) {
    if (!raw || raw.version!==1 || raw.completed!==true || !Array.isArray(raw.shots)) return null;
    if (raw.skipped===true) return raw.shots.length===0?{version:1,completed:true,skipped:true,shots:[]}:null;
    if (raw.shots.length<1||raw.shots.length>3||raw.shots.some(v=>!v||typeof v.hit!=='boolean'||typeof v.aimed!=='boolean')) return null;
    const shots=raw.shots.map(v=>({hit:v.hit,aimed:v.aimed}));
    const count=shots.filter(v=>v.hit).length,second=shots.findIndex((v,i)=>shots.slice(0,i+1).filter(x=>x.hit).length===2);
    if(count>2 || (count===2&&second!==shots.length-1) || (count<2&&shots.length!==3)) return null;
    return {version:1,completed:true,shots:shots};
  }
  function initialState(raw,result) {
    raw=raw&&raw.version===1?raw:{};
    const shots=Array.isArray(raw.shots)?raw.shots.slice(0,3).filter(v=>v&&typeof v.hit==='boolean'&&typeof v.aimed==='boolean').map(v=>({hit:v.hit,aimed:v.aimed})):[];
    while(shots.filter(v=>v.hit).length>2) shots.pop();
    const second=shots.findIndex((v,i)=>shots.slice(0,i+1).filter(x=>x.hit).length===2);
    if(second>=0) shots.splice(second+1);
    const completed=validResult(result)||validResult(raw.result);
    const s={version:1,phase:raw.phase==='brief'?'brief':raw.phase?'active':'brief',time:clamp(finite(raw.time),0,86400),aim:raw.aim===true,aimYaw:clamp(finite(raw.aimYaw),-.7,.7),aimPitch:clamp(finite(raw.aimPitch,.07),-.1,.7),aimBlend:clamp(finite(raw.aimBlend),0,1),lock:clamp(finite(raw.lock),0,1),shots:shots,projectile:null,effect:null,cooldown:clamp(finite(raw.cooldown),0,1.2),recoil:0,result:null};
    if(raw.projectile&&shots.length<3&&hits(s)<2) {
      const p=raw.projectile;
      s.projectile={position:vector(p.position,[0,2,0]),velocity:vector(p.velocity,[0,0,-SPEED]),age:clamp(finite(p.age),0,2.4),aimed:p.aimed===true};
    }
    if(raw.effect&&['hit','miss','destroyed'].includes(raw.effect.kind)) s.effect={kind:raw.effect.kind,position:vector(raw.effect.position,[0,8,-20]),age:clamp(finite(raw.effect.age),0,3),seed:clamp(finite(raw.effect.seed),0,1000)};
    if(completed) {s.phase='complete';s.result=completed;s.shots=completed.shots.slice();s.projectile=null;}
    else if(hits(s)===2||s.shots.length===3) {s.phase='resolving';s.projectile=null;if(!s.effect)s.effect={kind:hits(s)===2?'destroyed':'miss',position:heliAt(s.time).position,age:0,seed:2};}
    return s;
  }
  function snapshot(s) {return JSON.parse(JSON.stringify(s));}
  function heliAt(time) {
    const a=time*.29-.82;
    return {position:[9.2*Math.sin(a),9.1+Math.sin(time*.43)*.48,-23+Math.cos(time*.29)*1.35],velocity:[9.2*.29*Math.cos(a),.48*.43*Math.cos(time*.43),-1.35*.29*Math.sin(time*.29)],yaw:Math.cos(a)>=0?PI/2:-PI/2};
  }
  function shoulder(s) {return [HERO[0]+Math.cos(s.aimYaw)*.34,HERO[1]+1.58,HERO[2]+Math.sin(s.aimYaw)*.34];}
  function muzzle(s) {return add(shoulder(s),mul(direction(s.aimYaw,s.aimPitch),1.47));}
  function predicted(s) {
    const h=heliAt(s.time),origin=shoulder(s),t=Math.hypot(...sub(h.position,origin))/SPEED;
    return add(add(h.position,mul(h.velocity,t)),[0,GRAVITY*t*t*.5,0]);
  }
  function segmentSphere(a,b,r) {const d=sub(b,a),den=dot(d,d),t=den?clamp(-dot(a,d)/den,0,1):0;return Math.hypot(...add(a,mul(d,t)))<=r;}
  function segmentBox(a,b,min,max) {
    const d=sub(b,a);let near=0,far=1;
    for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-8){if(a[i]<min[i]||a[i]>max[i])return false;}else{let t=(min[i]-a[i])/d[i],u=(max[i]-a[i])/d[i];if(t>u){const z=t;t=u;u=z;}near=Math.max(near,t);far=Math.min(far,u);if(near>far)return false;}}
    return true;
  }
  const BLOCKS=[
    {min:[-19,0,-30],max:[-11,11,-16]},
    {min:[12,0,-42],max:[22,16,-27]},
    {min:[-9,0,-43],max:[9,7,-38]},
    {min:[-10,0,-17],max:[10,2.7,-14]}
  ];
  function fireState(s) {
    if(s.phase!=='active'||s.projectile||s.cooldown>0||s.shots.length>=3||hits(s)>=2)return false;
    const v=mul(direction(s.aimYaw,s.aimPitch),SPEED);
    s.projectile={position:muzzle(s),velocity:v,age:0,aimed:s.aim===true};
    s.recoil=1;s.lock=0;
    return true;
  }
  function resolveShot(s,hit,position,events) {
    const aimed=s.projectile.aimed;s.shots.push({hit:hit,aimed:aimed});s.projectile=null;
    const terminal=hits(s)>=2||s.shots.length===3;
    s.effect={kind:hit?(hits(s)>=2?'destroyed':'hit'):'miss',position:position.slice(),age:0,seed:s.shots.length*7};
    s.cooldown=.8;s.lock=0;
    if(terminal)s.phase='resolving';
    events.push({type:hit?'hit':'miss',terminal:terminal});
  }
  function stepState(s,delta) {
    const events=[],dt=clamp(delta,0,.04);
    if(!['active','resolving'].includes(s.phase))return events;
    const previousTime=s.time;s.time+=dt;s.cooldown=Math.max(0,s.cooldown-dt);s.recoil=Math.max(0,s.recoil-dt*4);
    if(s.effect)s.effect.age+=dt;
    s.aimBlend=mix(s.aimBlend,s.aim?1:0,1-Math.exp(-dt*6));
    if(s.phase==='resolving'){
      if(!s.effect||s.effect.age>=1.65){s.phase='complete';s.result={version:1,completed:true,shots:s.shots.map(v=>({hit:v.hit,aimed:v.aimed}))};events.push({type:'complete'});}
      return events;
    }
    const goal=s.aim?angles(shoulder(s),predicted(s)):{yaw:0,pitch:.07};
    const ease=1-Math.exp(-dt*5.6);
    s.aimYaw=mix(s.aimYaw,goal.yaw,ease);s.aimPitch=mix(s.aimPitch,goal.pitch,ease);
    const error=Math.hypot(s.aimYaw-goal.yaw,s.aimPitch-goal.pitch);
    if(s.aim&&!s.projectile&&s.cooldown<=0&&error<.026)s.lock=Math.min(1,s.lock+dt*1.65);
    else s.lock=Math.max(0,s.lock-dt*2.5);
    if(s.projectile){
      const p=s.projectile,old=p.position.slice(),h0=heliAt(previousTime).position,h1=heliAt(s.time).position;
      p.velocity[1]-=GRAVITY*dt;p.position=add(p.position,mul(p.velocity,dt));p.age+=dt;
      if(segmentSphere(sub(old,h0),sub(p.position,h1),1.22))resolveShot(s,true,h1,events);
      else if(p.position[1]<=.08||p.age>2.2||BLOCKS.some(b=>segmentBox(old,p.position,b.min,b.max)))resolveShot(s,false,p.position,events);
    }
    return events;
  }
  function cameraFor(s) {
    const yaw=s.aimYaw*s.aimBlend*.72,back=mix(4.4,3.6,s.aimBlend);
    const eye=[HERO[0]-Math.sin(yaw)*back+Math.cos(yaw)*.83,2.65,HERO[2]+Math.cos(yaw)*back+Math.sin(yaw)*.83];
    return {position:eye,target:[Math.sin(yaw)*22,6.7,-19*Math.cos(yaw)],fov:mix(59,48,s.aimBlend)};
  }
  function cameraBasis(camera) {const p=camera.position,f=normalize(sub(camera.target,p)),r=normalize(cross(f,[0,1,0]));return {position:p,forward:f,right:r,up:normalize(cross(r,f))};}
  function project(point,camera,aspect) {const b=cameraBasis(camera),d=sub(point,b.position),z=dot(d,b.forward),scale=Math.tan(camera.fov*PI/360);return {x:.5+dot(d,b.right)/(2*z*scale*aspect),y:.5-dot(d,b.up)/(2*z*scale),visible:z>.1};}
  function Builder() {this.values=[];}
  Builder.prototype.vertex=function(p,n,c,glow=0) {this.values.push(p[0],p[1],p[2],n[0],n[1],n[2],c[0],c[1],c[2],c[3]??1,glow);};
  Builder.prototype.triangle=function(a,b,c,n,color,glow=0) {this.vertex(a,n,color,glow);this.vertex(b,n,color,glow);this.vertex(c,n,color,glow);};
  Builder.prototype.quad=function(a,b,c,d,n,color,glow=0) {this.triangle(a,b,c,n,color,glow);this.triangle(a,c,d,n,color,glow);};
  Builder.prototype.box=function(x,y,z,w,h,d,c,glow=0) {
    const l=x-w/2,r=x+w/2,b=y-h/2,t=y+h/2,f=z+d/2,k=z-d/2;
    this.quad([l,b,f],[r,b,f],[r,t,f],[l,t,f],[0,0,1],c,glow);
    this.quad([r,b,k],[l,b,k],[l,t,k],[r,t,k],[0,0,-1],c,glow);
    this.quad([l,t,f],[r,t,f],[r,t,k],[l,t,k],[0,1,0],c,glow);
    this.quad([l,b,k],[r,b,k],[r,b,f],[l,b,f],[0,-1,0],c,glow);
    this.quad([r,b,f],[r,b,k],[r,t,k],[r,t,f],[1,0,0],c,glow);
    this.quad([l,b,k],[l,b,f],[l,t,f],[l,t,k],[-1,0,0],c,glow);
  };
  Builder.prototype.cylinder=function(x,y,z,radius,height,c,axis='y',segments=12,glow=0) {
    const point=(u,v,w)=>axis==='x'?[x+v,y+u,z+w]:axis==='z'?[x+u,y+w,z+v]:[x+u,y+v,z+w];
    const normal=(u,v,w)=>axis==='x'?[v,u,w]:axis==='z'?[u,w,v]:[u,v,w];
    const half=height/2;
    for(let i=0;i<segments;i++) {
      const a=i*2*PI/segments,b=(i+1)*2*PI/segments,m=(a+b)/2;
      const u=Math.cos(a)*radius,w=Math.sin(a)*radius,v=Math.cos(b)*radius,q=Math.sin(b)*radius;
      // Swapping axes changes handedness. Reverse winding for x/z cylinders.
      const p0=point(u,-half,w),p1=point(u,half,w),p2=point(v,half,q),p3=point(v,-half,q);
      if(axis==='y') this.quad(p0,p1,p2,p3,normal(Math.cos(m),0,Math.sin(m)),c,glow);
      else this.quad(p3,p2,p1,p0,normal(Math.cos(m),0,Math.sin(m)),c,glow);
      if(axis==='y') {
        this.triangle(point(0,half,0),point(v,half,q),point(u,half,w),normal(0,1,0),c,glow);
        this.triangle(point(0,-half,0),point(u,-half,w),point(v,-half,q),normal(0,-1,0),c,glow);
      } else {
        this.triangle(point(0,half,0),point(u,half,w),point(v,half,q),normal(0,1,0),c,glow);
        this.triangle(point(0,-half,0),point(v,-half,q),point(u,-half,w),normal(0,-1,0),c,glow);
      }
    }
  };
  Builder.prototype.ring=function(x,y,z,radius,width,c,plane='xy',glow=.65) {
    const point=(r,a)=>plane==='xy'?[x+Math.cos(a)*r,y+Math.sin(a)*r,z]:[x+Math.cos(a)*r,y,z+Math.sin(a)*r];
    for(let i=0;i<40;i++) {
      const a=i*PI/20,b=(i+1)*PI/20;
      const a0=point(radius,a),a1=point(radius,b),b1=point(radius-width,b),b0=point(radius-width,a);
      if(plane==='xy') {
        this.quad(a0,a1,b1,b0,[0,0,1],c,glow);
        this.quad(b0,b1,a1,a0,[0,0,-1],c,glow);
      } else this.quad(a0,b0,b1,a1,[0,1,0],c,glow);
    }
  };
  Builder.prototype.disc=function(x,y,z,rx,rz,color) {
    for(let i=0;i<24;i++) {
      const a=-i*PI/12,b=-(i+1)*PI/12;
      this.triangle([x,y,z],[x+Math.cos(a)*rx,y,z+Math.sin(a)*rz],[x+Math.cos(b)*rx,y,z+Math.sin(b)*rz],[0,1,0],color);
    }
  };
  Builder.prototype.data=function() {return new Float32Array(this.values);};


  Builder.prototype.ellipsoid=function(x,y,z,rx,ry,rz,color,glow=0,segments=12,rings=8) {
    const point=(lat,lon)=>[x+Math.cos(lat)*Math.cos(lon)*rx,y+Math.sin(lat)*ry,z+Math.cos(lat)*Math.sin(lon)*rz];
    for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
      const a=-PI/2+j*PI/rings,b=-PI/2+(j+1)*PI/rings,u=i*2*PI/segments,v=(i+1)*2*PI/segments;
      const n=normalize([Math.cos((a+b)/2)*Math.cos((u+v)/2)/rx,Math.sin((a+b)/2)/ry,Math.cos((a+b)/2)*Math.sin((u+v)/2)/rz]);
      this.quad(point(a,u),point(b,u),point(b,v),point(a,v),n,color,glow);
    }
  };
  Builder.prototype.bone=function(a,b,r,color,segments=8) {
    const axis=normalize(sub(b,a)),u=normalize(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),v=cross(axis,u);
    for(let i=0;i<segments;i++){
      const p=i*2*PI/segments,q=(i+1)*2*PI/segments,off=t=>add(mul(u,Math.cos(t)*r),mul(v,Math.sin(t)*r));
      this.quad(add(a,off(p)),add(b,off(p)),add(b,off(q)),add(a,off(q)),normalize(off((p+q)/2)),color);
      this.triangle(a,add(a,off(q)),add(a,off(p)),mul(axis,-1),color);
      this.triangle(b,add(b,off(p)),add(b,off(q)),axis,color);
    }
  };
  function makeModels() {
    const C={floor:hex('77786f'),roof:hex('8f8d80'),panel:hex('a69e88'),trim:hex('ccc4ad'),window:hex('354c52'),rust:hex('745a46'),dark:hex('272d2d'),green:hex('394d3d'),skin:hex('c99878'),pants:hex('303d49'),black:hex('171e22'),gold:hex('cfa764'),glass:hex('4c7685'),red:hex('b23832')};
    let b=new Builder(),models={};
    b.box(0,-.18,-20,90,.34,110,C.floor);
    b.box(0,.015,-2,22,.035,28,C.roof);
    for(let x=-10;x<=10;x+=2)b.box(x,.04,-2,.025,.01,28,hex('696c65'));
    for(let z=-14;z<=12;z+=2)b.box(0,.042,z,22,.01,.025,hex('696c65'));
    b.box(0,1.35,-16,21,2.7,4,hex('8a897c'));
    b.box(0,2.78,-16,21.5,.22,4.4,hex('a8a292'));
    for(let i=-3;i<=3;i++){b.box(i*2.8,1.15,-13.96,2.48,2.12,.05,hex(i%2?'485f57':'5b675f'));b.box(i*2.8,1.12,-13.92,.025,2,.03,C.dark);b.box(i*2.8+.16,1.08,-13.88,.065,.08,.04,C.gold);}
    b.box(-4.3,2.35,-13.87,4.15,.62,.09,hex('3a5261'));
    const glyphs={'П':['11111','10001','10001','10001','10001','10001','10001'],'О':['01110','10001','10001','10001','10001','10001','01110'],'Л':['00111','01001','01001','01001','01001','10001','10001'],'И':['10001','10001','10011','10101','11001','10001','10001'],'Г':['11111','10000','10000','10000','10000','10000','10000'],'Н':['10001','10001','10001','11111','10001','10001','10001'],'0':['01110','10001','10011','10101','11001','10001','01110'],'3':['11110','00001','00001','01110','00001','00001','11110']};
    const label='ПОЛИГОН 03',px=.047;
    Array.from(label).forEach((letter,n)=>{const rows=glyphs[letter];if(rows)rows.forEach((row,j)=>Array.from(row).forEach((v,i)=>{if(v==='1')b.box(-5.66+n*6*px+i*px,2.49-j*px,-13.805,px*.78,px*.78,.012,hex('d2ccb9'),.15);}));});
    function building(x,z,w,h,d,color) {
      b.box(x,h/2,z,w,h,d,color);b.box(x,h+.1,z,w+.25,.2,d+.25,C.trim);
      for(let y=1.45;y<h-.5;y+=2.3)for(let dx=-w/2+1;dx<w/2-.5;dx+=2.05){
        b.box(x+dx,y,z+d/2+.025,1.12,1.35,.07,C.trim);
        b.box(x+dx,y,z+d/2+.07,.94,1.15,.06,C.window);
        b.box(x+dx,y,z+d/2+.11,.065,1.2,.02,hex('b0b09d'));
      }
      for(let y=2.7;y<h;y+=2.3)b.box(x,y,z+d/2+.1,w,.045,.035,hex('777c73'));
    }
    building(-15,-24,8,11,16,hex('9b9b89'));building(17,-35,10,16,16,hex('afa18b'));
    building(-3,-48,16,9,12,hex('a7a18f'));building(12,-64,15,15,13,hex('8e9b95'));building(-19,-62,17,18,14,hex('899792'));
    for(const side of [-1,1]){b.box(side*10.8,.48,-.2,.34,.95,24,hex('929286'));b.box(side*10.8,1.0,-.2,.5,.12,24,hex('b6ad98'));}
    b.box(-7,.48,-3,1.8,.96,1.2,hex('7a7361'));b.box(-7,1.02,-3,2,.12,1.4,hex('99917d'));
    b.box(6,.52,-8,1.7,1.04,1.4,hex('6d7266'));
    for(const x of [-10.5,11.8]){
      b.cylinder(x,3.7,-20,.12,7.4,hex('6a6152'),'y',8);
      b.box(x,7.1,-20,2.2,.14,.14,C.dark);
      for(const side of [-.8,.8])b.cylinder(x+side,7.28,-20,.09,.22,hex('c3b999'),'y',8);
    }
    for(const line of [-.8,.8]){let previous=[-10.5+line,7.4,-20];for(let i=1;i<=8;i++){const t=i/8,next=[mix(-10.5,11.8,t)+line,7.4-Math.sin(t*PI)*.65,-20];b.bone(previous,next,.018,C.dark,5);previous=next;}}
    models.world=b.data();
    b=new Builder();b.disc(0,.055,0,.54,.43,hex('171f24',.28));models.heroShadow=b.data();
    b=new Builder();
    b.box(0,1.23,0,.61,.75,.37,C.green);b.box(0,1.55,0,.76,.2,.39,C.green);b.box(0,.86,0,.6,.15,.38,hex('2d3e33'));
    b.box(0,1.53,.204,.38,.16,.03,hex('4d5a45'));
    b.cylinder(0,1.72,0,.11,.15,C.skin,'y',10);
    b.ellipsoid(0,1.94,-.015,.19,.245,.19,C.skin,0,12,8);
    b.ellipsoid(0,2.06,.01,.197,.15,.193,hex('342d28'),0,12,6);
    b.box(0,1.94,-.185,.075,.1,.055,C.skin);
    for(const side of [-1,1]){
      b.bone([side*.17,.88,0],[side*.2,.44,.03],.145,C.pants);
      b.bone([side*.2,.44,.03],[side*.23,.13,-.025],.125,C.pants);
      b.box(side*.23,.1,-.09,.29,.19,.43,C.black);
    }
    b.bone([-.34,1.52,0],[-.42,1.24,-.28],.12,C.green);
    b.bone([-.42,1.24,-.28],[.11,1.5,-.65],.10,C.green);
    b.bone([.35,1.52,0],[.52,1.23,.07],.12,C.green);
    b.bone([.52,1.23,.07],[.45,1.48,-.32],.10,C.green);
    models.hero=b.data();
    b=new Builder();
    b.cylinder(0,0,-.24,.095,1.55,hex('465242'),'z',12);
    b.cylinder(0,0,.56,.13,.12,C.dark,'z',12);
    b.cylinder(0,0,.627,.085,.014,C.black,'z',12);
    b.cylinder(0,0,-.45,.113,.46,hex('75613e'),'z',12);
    b.box(0,-.15,-.28,.09,.26,.12,hex('6f4d33'));
    b.box(0,.13,-.65,.045,.24,.04,C.black);b.box(0,.1,.12,.055,.16,.055,C.black);
    b.ellipsoid(.035,-.13,-.28,.11,.13,.13,C.skin,0,8,6);
    b.ellipsoid(-.07,-.055,-.64,.12,.085,.15,C.skin,0,8,6);
    models.launcher=b.data();
    b=new Builder();b.ellipsoid(0,0,-1.13,.15,.15,.36,hex('687247'),0,10,8);b.cylinder(0,0,-.84,.065,.22,C.dark,'z',10);models.loadedRocket=b.data();
    function helicopter(damaged){
      const q=new Builder(),body=hex(damaged?'4b5147':'697464');
      q.ellipsoid(0,0,0,.72,.64,1.53,body,0,14,9);
      q.ellipsoid(0,.10,-.99,.64,.49,.77,C.glass,.08,12,8);
      q.box(0,.15,-1.56,.065,.75,.065,body);q.box(0,-.12,-1.62,1.03,.065,.055,body);
      for(const side of [-1,1]){
        q.box(side*.694,.11,-.12,.055,.57,.87,C.glass,.05);
        q.box(side*.73,.10,.15,.035,.65,.045,body);
        q.bone([side*.46,-.45,.76],[side*.85,-.94,.95],.06,C.dark);
        q.bone([side*.43,-.45,-.65],[side*.85,-.94,-.87],.06,C.dark);
        q.bone([side*.85,-.96,-1.45],[side*.85,-.96,1.6],.075,C.dark);
      }
      q.bone([0,.08,1.2],[0,.42,3.6],.15,body,10);
      q.box(0,.81,3.55,.13,1.02,.54,body);q.box(0,.39,3.05,1.55,.1,.42,body);
      q.cylinder(0,.86,.05,.095,.55,C.dark,'y',10);
      q.cylinder(0,-.61,-1.04,.12,.055,C.red,'y',10,.8);
      return q.data();
    }
    models.heli=helicopter(false);models.heliDamaged=helicopter(true);
    b=new Builder();b.box(0,0,0,6.2,.045,.14,C.black);b.box(0,0,0,.14,.045,6.2,C.black);b.cylinder(0,.035,0,.16,.12,C.dark,'y',10);models.rotor=b.data();
    b=new Builder();b.box(0,0,0,.065,1.22,.11,C.black);b.box(0,0,0,.065,.11,1.22,C.black);models.tailRotor=b.data();
    b=new Builder();b.disc(0,0,0,3.05,3.05,hex('263232',.075));models.rotorBlur=b.data();
    b=new Builder();b.ellipsoid(0,0,0,.09,.09,.25,hex('78804b'),0,8,6);b.cylinder(0,0,.25,.045,.25,C.dark,'z',8);models.rocket=b.data();
    b=new Builder();b.ellipsoid(0,0,0,1,1,1,hex('ffb65b'),.85,10,7);models.fire=b.data();
    b=new Builder();b.ellipsoid(0,0,0,1,1,1,hex('ffe3a1'),1,8,6);models.flash=b.data();
    b=new Builder();b.ellipsoid(0,0,0,1,1,1,hex('68706b'),0,9,6);models.smoke=b.data();
    b=new Builder();b.box(0,0,0,.24,.18,.32,C.dark);models.debris=b.data();
    return models;
  }
  function multiply(a,b,out) {for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return out;}
  function setModel(out,p,yaw=0,pitch=0,scale=1) {
    const c=Math.cos(yaw),s=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    out.set([c*scale,0,s*scale,0,-s*sp*scale,cp*scale,c*sp*scale,0,-s*cp*scale,-sp*scale,c*cp*scale,0,p[0],p[1],p[2],1]);
  }
  function viewProjection(camera,aspect,view,projection,out) {
    const b=cameraBasis(camera),p=b.position,r=b.right,u=b.up,f=b.forward;
    view.set([r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,-dot(r,p),-dot(u,p),dot(f,p),1]);
    projection.fill(0);const zoom=1/Math.tan(camera.fov*PI/360),near=.08,far=180;
    projection[0]=zoom/aspect;projection[5]=zoom;projection[10]=(far+near)/(near-far);projection[11]=-1;projection[14]=2*far*near/(near-far);multiply(projection,view,out);
  }
  const VERTEX='attribute vec3 aPosition;attribute vec3 aNormal;attribute vec4 aColor;attribute float aGlow;uniform mat4 uViewProjection;uniform mat4 uModel;uniform vec3 uCamera;uniform float uOpacity;varying vec4 vColor;varying float vDistance;void main(){vec4 w=uModel*vec4(aPosition,1.0);vec3 n=normalize(mat3(uModel)*aNormal);float lit=.57+.43*max(dot(n,normalize(vec3(-.45,.85,.3))),0.0);vColor=vec4(aColor.rgb*(lit+aGlow*.7),aColor.a*uOpacity);vDistance=distance(w.xyz,uCamera);gl_Position=uViewProjection*w;}';
  const FRAGMENT='precision mediump float;varying vec4 vColor;varying float vDistance;void main(){float fog=smoothstep(35.0,135.0,vDistance)*.68;gl_FragColor=vec4(mix(vColor.rgb,vec3(.58,.61,.58),fog),vColor.a);}';
  const SKY_VERTEX='attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,.999,1.0);}';
  const SKY_FRAGMENT='precision mediump float;varying vec2 vUv;void main(){float y=clamp(vUv.y,0.0,1.0);vec3 color=mix(vec3(.77,.72,.58),vec3(.29,.40,.48),smoothstep(.02,1.0,y));color+=vec3(.045,.03,.005)*sin(vUv.x*8.0+y*12.0)*exp(-pow((y-.5)*5.0,2.0));gl_FragColor=vec4(color,1.0);}';
  function renderActors(s,draw,transparent,calm) {
    const h=heliAt(s.time),damage=hits(s);
      draw('world');draw('hero',HERO,s.aimYaw*.88,0,1);
      const gun=shoulder(s),kick=calm?0:s.recoil*.055;
      draw('launcher',gun,s.aimYaw,s.aimPitch+kick);
      if(!s.projectile&&s.cooldown<=0&&s.shots.length<3&&damage<2)draw('loadedRocket',gun,s.aimYaw,s.aimPitch+kick);
      if(damage<2){
        draw(damage?'heliDamaged':'heli',h.position,h.yaw,Math.sin(s.time*.9)*.025);
        draw('rotor',add(h.position,[0,1.12,0]),s.time*39);
        const tail=add(h.position,[Math.sin(h.yaw)*-3.52,.42,Math.cos(h.yaw)*3.52]);draw('tailRotor',tail,h.yaw,s.time*55);
      }
      if(s.projectile){const p=s.projectile,a=angles([0,0,0],p.velocity);draw('rocket',p.position,a.yaw,a.pitch);draw('fire',add(p.position,mul(normalize(p.velocity),-.34)),0,0,.13);}
      if(s.effect){const e=s.effect,t=e.age;
        if(e.kind==='destroyed')for(let i=0;i<12;i++){const a=i*2.399+e.seed,spread=t*(1.6+(i%4)*.7);draw('debris',add(e.position,[Math.cos(a)*spread,t*(2.8+(i%3)) -t*t*4.8,Math.sin(a)*spread]),t*(i+1),t*3,.8+(i%3)*.3);}
        if(t<.55){const radius=(e.kind==='destroyed'?2.4:e.kind==='hit'?1.15:.65)*Math.sin(Math.min(1,t/.55)*PI*.85);draw('fire',e.position,0,0,Math.max(.1,radius));if(t<.18)draw('flash',e.position,0,0,Math.max(.15,radius*.7));}
      }
      transparent(true);draw('heroShadow',HERO);
      if(damage<2)draw('rotorBlur',add(h.position,[0,1.13,0]),0,0,1,.65);
      if(damage===1)for(let i=0;i<6;i++){const t=(s.time*.75+i*.24)%1.6;draw('smoke',add(h.position,[-Math.cos(h.yaw)*.5+Math.sin(h.yaw)*t*.5,t*.9,Math.cos(h.yaw)*.8]),0,0,.25+t*.35,.3*(1-t/1.6));}
      if(s.projectile){const p=s.projectile,v=normalize(p.velocity);for(let i=1;i<=9;i++){const t=i*.12;draw('smoke',add(p.position,mul(v,-t*5.2)),0,0,.07+i*.017,.34*(1-i/11));}}
      if(s.effect){const e=s.effect,t=e.age;if(t<2.5)for(let i=0;i<7;i++){const a=i*2.399,spread=t*(.3+i*.07);draw('smoke',add(e.position,[Math.cos(a)*spread,t*(.6+i*.07),Math.sin(a)*spread]),0,0,.18+t*.48,.37*Math.max(0,1-t/2.7));}}
      transparent(false);
  }

  function createSoftwareRenderer(canvas,onLost,onRestored) {
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Браузер не открыл игровую сцену. Попробуйте открыть эпизод ещё раз.');
    canvas.dataset.renderer='canvas';
    const meshes=makeModels(),model=new Float32Array(16),light=normalize([-.45,.85,.3]);
    const calm=!!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const littleEndian=new Uint8Array(new Uint32Array([0x01020304]).buffer)[0]===4;
    const pack=(r,g,b)=>littleEndian?((255<<24)|(b<<16)|(g<<8)|r):((r<<24)|(g<<16)|(b<<8)|255);
    let width=320,height=480,aspect=2/3,disposed=false,lastRender=-100,cached=null,frame=null,pixels=null,depths=null,sky=null;
    function clipped(points) {
      const output=[],near=.09;
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],insideA=a[2]>=near,insideB=b[2]>=near;
        if(insideA)output.push(a);
        if(insideA!==insideB){const t=(near-a[2])/(b[2]-a[2]);output.push([mix(a[0],b[0],t),mix(a[1],b[1],t),near]);}
      }
      return output;
    }
    // Perspective-correct inverse depth avoids painter-sort diagonal holes on
    // large facades, thin windows, hair and the RPG. A shared pixel edge leaves
    // no antialias cracks between triangles; the bounded resolution stays lean.
    function raster(a,b,c,color,alpha,writeDepth) {
      let area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      if(Math.abs(area)<.2)return;
      if(area<0){const swap=b;b=c;c=swap;area=-area;}
      const minX=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0])-.5)),maxX=Math.min(width-1,Math.floor(Math.max(a[0],b[0],c[0])-.5));
      const minY=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1])-.5)),maxY=Math.min(height-1,Math.floor(Math.max(a[1],b[1],c[1])-.5));
      if(minX>maxX||minY>maxY)return;
      const dx0=b[1]-c[1],dy0=c[0]-b[0],dx1=c[1]-a[1],dy1=a[0]-c[0],dx2=a[1]-b[1],dy2=b[0]-a[0];
      const x=minX+.5,y=minY+.5,invArea=1/area;
      let row0=dy0*(y-b[1])+dx0*(x-b[0]),row1=dy1*(y-c[1])+dx1*(x-c[0]),row2=dy2*(y-a[1])+dx2*(x-a[0]);
      let rowZ=(row0*a[2]+row1*b[2]+row2*c[2])*invArea;
      const dzX=(dx0*a[2]+dx1*b[2]+dx2*c[2])*invArea,dzY=(dy0*a[2]+dy1*b[2]+dy2*c[2])*invArea;
      const solid=pack(color[0],color[1],color[2]),inverse=1-alpha,bytes=frame.data;
      for(let py=minY;py<=maxY;py++){
        let e0=row0,e1=row1,e2=row2,z=rowZ,index=py*width+minX;
        for(let px=minX;px<=maxX;px++,index++,e0+=dx0,e1+=dx1,e2+=dx2,z+=dzX){
          if(e0<-.00001||e1<-.00001||e2<-.00001||z<depths[index])continue;
          if(writeDepth){depths[index]=z;pixels[index]=solid;}
          else{const i=index*4;pixels[index]=pack(Math.round(color[0]*alpha+bytes[i]*inverse),Math.round(color[1]*alpha+bytes[i+1]*inverse),Math.round(color[2]*alpha+bytes[i+2]*inverse));}
        }
        row0+=dy0;row1+=dy1;row2+=dy2;rowZ+=dzY;
      }
    }
    function render(s) {
      if(disposed)return cached;
      const now=typeof performance!=='undefined'?performance.now():Date.now();
      if(cached&&now-lastRender<38)return cached;
      lastRender=now;
      const camera=cameraFor(s),basis=cameraBasis(camera),focal=height/(2*Math.tan(camera.fov*PI/360)),faces=[];
      let blended=false;
      function draw(name,position=[0,0,0],yaw=0,pitch=0,scale=1,opacity=1){
        if(opacity<=.012||scale<.015)return;
        const data=meshes[name];setModel(model,position,yaw,pitch,scale);
        for(let i=0;i<data.length;i+=33){
          const alpha=clamp(data[i+9]*opacity,0,1);if(alpha<=.012)continue;
          const nx=(model[0]*data[i+3]+model[4]*data[i+4]+model[8]*data[i+5])/scale;
          const ny=(model[1]*data[i+3]+model[5]*data[i+4]+model[9]*data[i+5])/scale;
          const nz=(model[2]*data[i+3]+model[6]*data[i+4]+model[10]*data[i+5])/scale;
          let points=[],center=[0,0,0];
          for(let k=0;k<3;k++){
            const j=i+k*11,x=data[j],y=data[j+1],z=data[j+2];
            const p=[model[0]*x+model[4]*y+model[8]*z+position[0],model[1]*x+model[5]*y+model[9]*z+position[1],model[2]*x+model[6]*y+model[10]*z+position[2]];
            center[0]+=p[0]/3;center[1]+=p[1]/3;center[2]+=p[2]/3;
            const d=sub(p,basis.position);points.push([dot(d,basis.right),dot(d,basis.up),dot(d,basis.forward)]);
          }
          if(nx*(basis.position[0]-center[0])+ny*(basis.position[1]-center[1])+nz*(basis.position[2]-center[2])<-.001)continue;
          if(points.every(p=>p[2]<.09)||points.every(p=>p[2]>175))continue;
          if(points.some(p=>p[2]<.09))points=clipped(points);
          if(points.length<3)continue;
          const depth=points.reduce((v,p)=>v+p[2],0)/points.length;
          const screen=points.map(p=>[width*.5+p[0]/p[2]*focal,height*.5-p[1]/p[2]*focal,1/p[2]]);
          const xs=screen.map(p=>p[0]),ys=screen.map(p=>p[1]);
          if(Math.max(...xs)<0||Math.min(...xs)>width||Math.max(...ys)<0||Math.min(...ys)>height)continue;
          let area=0;screen.forEach((p,j)=>{const q=screen[(j+1)%screen.length];area+=p[0]*q[1]-p[1]*q[0];});if(Math.abs(area)<.25)continue;
          const lit=.57+.43*Math.max(0,nx*light[0]+ny*light[1]+nz*light[2])+data[i+10]*.7;
          let fog=clamp((Math.hypot(...sub(center,basis.position))-35)/100,0,1);fog=fog*fog*(3-2*fog)*.68;
          const color=[0,1,2].map(channel=>Math.round(clamp(mix(data[i+6+channel]*lit,[.58,.61,.58][channel],fog),0,1)*255));
          faces.push({points:screen,depth:depth,color:color,alpha:alpha,opaque:!blended&&alpha>=.999});
        }
      }
      renderActors(s,draw,value=>{blended=value;},calm);
      pixels.set(sky);depths.fill(0);
      // Opaque geometry writes the depth buffer, transparent smoke only reads
      // it, so effects cannot draw through the foreground character or walls.
      for(const face of faces)if(face.opaque)for(let i=1;i<face.points.length-1;i++)raster(face.points[0],face.points[i],face.points[i+1],face.color,1,true);
      const translucent=faces.filter(face=>!face.opaque).sort((a,b)=>b.depth-a.depth);
      for(const face of translucent)for(let i=1;i<face.points.length-1;i++)raster(face.points[0],face.points[i],face.points[i+1],face.color,face.alpha,false);
      ctx.putImageData(frame,0,0);
      canvas.dataset.triangles=String(faces.length);
      const h=heliAt(s.time);
      cached={camera:camera,heli:project(h.position,camera,aspect),reticle:project(add(muzzle(s),mul(direction(s.aimYaw,s.aimPitch),31)),camera,aspect)};
      return cached;
    }
    function resize(w,h){
      const ratio=Math.min(1,480/Math.max(1,w),850/Math.max(1,h));width=Math.max(1,Math.round(w*ratio));height=Math.max(1,Math.round(h*ratio));
      canvas.width=width;canvas.height=height;aspect=width/height;lastRender=-100;cached=null;
      frame=ctx.createImageData(width,height);pixels=new Uint32Array(frame.data.buffer);depths=new Float32Array(width*height);sky=new Uint32Array(width*height);
      for(let y=0;y<height;y++){
        const p=y/Math.max(1,height-1),t=p<.6?p/.6:(p-.6)/.4,a=p<.6?[74,102,122]:[165,175,166],b=p<.6?[165,175,166]:[197,181,143];
        sky.fill(pack(Math.round(mix(a[0],b[0],t)),Math.round(mix(a[1],b[1],t)),Math.round(mix(a[2],b[2],t))),y*width,(y+1)*width);
      }
    }
    function lost(event){event.preventDefault();onLost(new Error('Графика приостановлена. Восстанавливаем сцену.'));}
    function restored(){lastRender=-100;cached=null;onRestored();}
    canvas.addEventListener('contextlost',lost);canvas.addEventListener('contextrestored',restored);
    return {kind:'canvas',render:render,resize:resize,destroy:function(){disposed=true;frame=null;pixels=null;depths=null;sky=null;canvas.removeEventListener('contextlost',lost);canvas.removeEventListener('contextrestored',restored);}};
  }

  function createRenderer(canvas,onLost,onRestored) {
    const gl=canvas.getContext('webgl',{alpha:false,antialias:true,depth:true,premultipliedAlpha:false,powerPreference:'low-power'});
    if(!gl)return createSoftwareRenderer(canvas,onLost,onRestored);
    canvas.dataset.renderer='webgl';
    const cpu=makeModels(),view=new Float32Array(16),projection=new Float32Array(16),vp=new Float32Array(16),model=new Float32Array(16);
    const calm=!!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let gpu=null,lost=false,disposed=false,aspect=.6;
    function shader(kind,source){const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error('3D-шейдер: '+e);}return s;}
    function program(v,f){const a=shader(gl.VERTEX_SHADER,v),b=shader(gl.FRAGMENT_SHADER,f),p=gl.createProgram();gl.attachShader(p,a);gl.attachShader(p,b);gl.linkProgram(p);gl.deleteShader(a);gl.deleteShader(b);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('Не удалось собрать 3D-сцену.');return p;}
    function init(){
      const p=program(VERTEX,FRAGMENT),sky=program(SKY_VERTEX,SKY_FRAGMENT),meshes={};
      Object.entries(cpu).forEach(([name,data])=>{const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);meshes[name]={buffer:buffer,count:data.length/11};});
      const skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      gpu={p:p,sky:sky,skyBuffer:skyBuffer,meshes:meshes,position:gl.getAttribLocation(p,'aPosition'),normal:gl.getAttribLocation(p,'aNormal'),color:gl.getAttribLocation(p,'aColor'),glow:gl.getAttribLocation(p,'aGlow'),vp:gl.getUniformLocation(p,'uViewProjection'),model:gl.getUniformLocation(p,'uModel'),camera:gl.getUniformLocation(p,'uCamera'),opacity:gl.getUniformLocation(p,'uOpacity'),skyPosition:gl.getAttribLocation(sky,'aPosition')};
      gl.clearDepth(1);gl.depthFunc(gl.LEQUAL);
    }
    function draw(name,p=[0,0,0],yaw=0,pitch=0,scale=1,opacity=1){
      const m=gpu.meshes[name];setModel(model,p,yaw,pitch,scale);gl.uniformMatrix4fv(gpu.model,false,model);gl.uniform1f(gpu.opacity,opacity);gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);
      [[gpu.position,3,0],[gpu.normal,3,12],[gpu.color,4,24],[gpu.glow,1,40]].forEach(a=>{gl.enableVertexAttribArray(a[0]);gl.vertexAttribPointer(a[0],a[1],gl.FLOAT,false,44,a[2]);});
      gl.drawArrays(gl.TRIANGLES,0,m.count);
    }
    function transparent(yes){if(yes){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);}else{gl.disable(gl.BLEND);gl.depthMask(true);}}
    function render(s){
      if(lost||disposed)return;
      const camera=cameraFor(s),h=heliAt(s.time),damage=hits(s);
      gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(false);
      gl.useProgram(gpu.sky);gl.bindBuffer(gl.ARRAY_BUFFER,gpu.skyBuffer);
      [gpu.position,gpu.normal,gpu.color,gpu.glow].forEach(i=>gl.disableVertexAttribArray(i));
      gl.enableVertexAttribArray(gpu.skyPosition);gl.vertexAttribPointer(gpu.skyPosition,2,gl.FLOAT,false,8,0);gl.drawArrays(gl.TRIANGLES,0,3);
      gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.useProgram(gpu.p);viewProjection(camera,aspect,view,projection,vp);gl.uniformMatrix4fv(gpu.vp,false,vp);gl.uniform3fv(gpu.camera,camera.position);
      renderActors(s,draw,transparent,calm);
      return {camera:camera,heli:project(h.position,camera,aspect),reticle:project(add(muzzle(s),mul(direction(s.aimYaw,s.aimPitch),31)),camera,aspect)};
    }
    function resize(w,h){w=Math.max(1,w);h=Math.max(1,h);const dpr=Math.min(root.devicePixelRatio||1,1.5);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);aspect=w/h;}
    function release(){if(!gpu||lost)return;Object.values(gpu.meshes).forEach(m=>gl.deleteBuffer(m.buffer));gl.deleteBuffer(gpu.skyBuffer);gl.deleteProgram(gpu.p);gl.deleteProgram(gpu.sky);gpu=null;}
    function lostEvent(event){event.preventDefault();lost=true;onLost(new Error('3D-сцена приостановлена. Восстанавливаем графику.'));}
    function restored(){if(disposed)return;try{lost=false;init();onRestored();}catch(e){lost=true;onLost(e);}}
    canvas.addEventListener('webglcontextlost',lostEvent);canvas.addEventListener('webglcontextrestored',restored);
    init();
    return {kind:'webgl',render:render,resize:resize,destroy:function(){if(disposed)return;release();disposed=true;canvas.removeEventListener('webglcontextlost',lostEvent);canvas.removeEventListener('webglcontextrestored',restored);}};
  }

  function createSound(initialMute) {
    let context=null,master=null,motor=null,muted=initialMute,running=false,closed=false;
    function sync(){if(!context||closed)return;master.gain.setTargetAtTime(!muted && running ? .16 : 0,context.currentTime,.025);if(muted||!running)context.suspend().catch(()=>{});else context.resume().catch(()=>{});}
    function unlock(){
      if(closed||muted)return;
      if(!context){const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return;try{
        context=new AC();master=context.createGain();master.gain.value=0;master.connect(context.destination);
        const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=145;filter.connect(master);
        motor=context.createGain();motor.gain.value=.09;motor.connect(filter);
        [46,53].forEach(f=>{const o=context.createOscillator();o.type='sawtooth';o.frequency.value=f;o.connect(motor);o.start();});
      }catch(_){context=null;return;}}
      sync();
    }
    function noise(duration,gain,cutoff){
      if(!context||muted||!running)return;
      const samples=Math.ceil(context.sampleRate*duration),buffer=context.createBuffer(1,samples,context.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<samples;i++)data[i]=(Math.random()*2-1)*(1-i/samples);
      const source=context.createBufferSource(),filter=context.createBiquadFilter(),envelope=context.createGain();
      source.buffer=buffer;filter.type='lowpass';filter.frequency.value=cutoff;envelope.gain.setValueAtTime(gain,context.currentTime);envelope.gain.exponentialRampToValueAtTime(.001,context.currentTime+duration);
      source.connect(filter);filter.connect(envelope);envelope.connect(master);source.start();source.onended=()=>{source.disconnect();filter.disconnect();envelope.disconnect();};
    }
    return {unlock:unlock,setMuted:v=>{if(muted===!!v)return;muted=!!v;sync();},setRunning:v=>{if(running===!!v)return;running=!!v;sync();},shot:()=>noise(.55,1.15,950),impact:()=>{noise(1.0,1.8,420);if(context&&!muted&&running){const o=context.createOscillator(),g=context.createGain();o.frequency.setValueAtTime(88,context.currentTime);o.frequency.exponentialRampToValueAtTime(24,context.currentTime+.6);g.gain.setValueAtTime(.8,context.currentTime);g.gain.exponentialRampToValueAtTime(.001,context.currentTime+.7);o.connect(g);g.connect(master);o.start();o.stop(context.currentTime+.75);o.onended=()=>{o.disconnect();g.disconnect();};}},destroy:()=>{closed=true;if(context)context.close().catch(()=>{});}};
  }
  function mount(container,options) {
    if(!container||typeof container.querySelector!=='function')throw new Error('Нужен контейнер игровой сцены.');
    options=options||{};
    const revealResult=options.examMode!==true&&options.revealResult!==false;
    const s=initialState(options.state,options.result),abort=new AbortController(),sound=createSound(options.muted===true);
    let renderer=null,raf=0,last=0,lastSaved=s.time,disposed=false,externalPaused=false,blurred=false,failed=false,completeNotified=false,lastHint='',lastOverlay=null,lastHudAt=0;
    container.classList.add('rpg-mount');
    container.innerHTML='<div class="rpg-scene"><canvas class="rpg-canvas" role="img" aria-label="Герой с РПГ во дворе. Вертолёт проходит над гаражами."></canvas><div class="rpg-grain" aria-hidden="true"></div><div class="rpg-hud"><div class="rpg-location"><span>ПОЛИГОН 03</span><strong>Воздушная цель</strong></div><div class="rpg-flight-health" aria-label="Вертолёт: два попадания до уничтожения"><span>ЦЕЛЬ</span><i></i><i></i></div></div><div class="rpg-target" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="rpg-reticle" aria-hidden="true"><span></span></div><div class="rpg-ammo" aria-label="Боезапас"><strong>3</strong><span>/ 3</span><small>РАКЕТЫ</small></div><p class="rpg-hint" role="status" aria-live="polite"></p><div class="rpg-controls"><button class="rpg-control rpg-aim" type="button" data-rpg="aim" aria-label="Прицел — включить сопровождение" aria-pressed="false"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="8"/><path d="M16 2v8m0 12v8M2 16h8m12 0h8"/></svg><span>Прицел</span></button><button class="rpg-control rpg-fire" type="button" data-rpg="fire" aria-label="Выстрел из РПГ"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m8 22 13-13 5-3-3 5L10 24Z"/><path d="m12 18-6 1 1 5 5 1 1-6M4 28l5-5"/></svg><span>Выстрел</span></button></div><div class="rpg-overlay"><section class="rpg-overlay-card"><span class="rpg-overlay-kicker">ПРАКТИЧЕСКОЕ ЗАДАНИЕ</span><h2></h2><p></p><button type="button" data-rpg="begin">Начать эпизод <span aria-hidden="true">→</span></button></section></div></div>';
    const scene=container.querySelector('.rpg-scene'),canvas=container.querySelector('.rpg-canvas'),aimButton=container.querySelector('[data-rpg="aim"]'),fireButton=container.querySelector('[data-rpg="fire"]'),hint=container.querySelector('.rpg-hint'),overlay=container.querySelector('.rpg-overlay'),overlayTitle=overlay.querySelector('h2'),overlayCopy=overlay.querySelector('p'),beginButton=overlay.querySelector('button'),reticle=container.querySelector('.rpg-reticle'),target=container.querySelector('.rpg-target'),ammo=container.querySelector('.rpg-ammo strong'),health=Array.from(container.querySelectorAll('.rpg-flight-health i'));
    function paused(){return externalPaused||blurred||document.hidden||failed;}
    function call(name,value){if(typeof options[name]==='function')try{options[name](value);}catch(error){console.warn('RPG callback '+name+' failed',error);}}
    function emit(){lastSaved=s.time;call('onState',snapshot(s));}
    function completed(){
      if(completeNotified||s.phase!=='complete'||!s.result)return;
      completeNotified=true;const result=JSON.parse(JSON.stringify(s.result));
      Promise.resolve().then(()=>{if(!disposed)call('onComplete',result);});
    }
    function report(error){
      console.error('RPG scene',error);
      failed=true;stop();sound.setRunning(false);paintHud(true);emit();
      Promise.resolve().then(()=>{if(!disposed)call('onError',error instanceof Error?error:new Error(String(error)));});
    }
    function resize(){
      if(disposed||!renderer)return;
      const rect=scene.getBoundingClientRect();renderer.resize(rect.width||320,rect.height||480);draw();
    }
    function draw(){
      if(!renderer||disposed||failed)return;
      try{
        const drawStarted=performance.now(),positions=renderer.render(s);scene.dataset.renderMs=String(Math.round(performance.now()-drawStarted));if(!positions)return;
        const hp=positions.heli,rp=positions.reticle;
        target.hidden=hits(s)>=2||!hp.visible||hp.x<-.1||hp.x>1.1;
        target.style.left=(hp.x*100)+'%';target.style.top=(hp.y*100)+'%';
        reticle.hidden=s.phase==='complete';reticle.style.left=(clamp(rp.x,.1,.9)*100)+'%';reticle.style.top=(clamp(rp.y,.12,.75)*100)+'%';
      }catch(error){report(error);}
    }
    function showOverlay(kind,title,copy,button){
      if(lastOverlay===kind)return;
      lastOverlay=kind;overlay.hidden=!kind;
      if(kind){overlayTitle.textContent=title;overlayCopy.textContent=copy;beginButton.hidden=!button;scene.classList.toggle('is-finished',kind==='complete');}
    }
    function paintHud(force){
      const remaining=Math.max(0,3-s.shots.length-(s.projectile?1:0)),damage=hits(s);
      ammo.textContent=String(remaining);
      health.forEach((n,i)=>n.classList.toggle('is-lost',i<damage));
      const healthBox=container.querySelector('.rpg-flight-health');healthBox.hidden=!revealResult&&s.phase==='complete';healthBox.setAttribute('aria-label',healthBox.hidden?'Цель':'Попаданий: '+damage+' из 2');
      const interactive=s.phase==='active'&&!paused();
      aimButton.disabled=!interactive;fireButton.disabled=!interactive||!!s.projectile||s.cooldown>0||remaining===0;
      aimButton.setAttribute('aria-pressed',String(s.aim));aimButton.classList.toggle('is-active',s.aim);
      scene.classList.toggle('is-aiming',s.aim);scene.classList.toggle('is-locked',s.lock>=.99&&interactive&&!s.projectile);
      scene.style.setProperty('--rpg-lock',String(Math.round(s.lock*100)));
      let line=s.projectile?'Ракета в полёте':s.cooldown>0?(s.effect&&s.effect.kind==='hit'?'Попадание. Цель повреждена.':'Промах. Выберите момент ещё раз.'):!s.aim?'Включите прицел':s.lock>=.99?'Захват есть. Можно стрелять.':'Сопровождение цели…';
      if(s.phase==='resolving')line=damage>=2?'Цель поражена':'Боезапас исчерпан';
      if(line!==lastHint){hint.textContent=line;lastHint=line;}
      hint.hidden=s.phase==='complete';
      if(failed)showOverlay('error','3D-сцена недоступна','Попробуйте открыть эпизод ещё раз.',false);
      else if(s.phase==='complete')showOverlay('complete',!revealResult?'Практика завершена':s.result&&s.result.skipped?'Практика пропущена':damage>=2?'Цель сбита':'Боезапас исчерпан',!revealResult?'Оценку объявит комиссия.':'Попадания: '+damage+' из 2. Раунд завершён.',false);
      else if(paused())showOverlay('paused','Пауза','Эпизод продолжится, когда вы вернётесь.',false);
      else if(s.phase==='brief')showOverlay('brief','Воздушная цель','Три ракеты. Два попадания.\nВключите «Прицел», дождитесь захвата\nи нажмите «Выстрел».',true);
      else showOverlay('', '', '', false);
      sound.setRunning(!paused()&&['active','resolving'].includes(s.phase));
    }
    function stop(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;}
    function frame(now){
      raf=0;if(disposed||paused())return;
      const elapsed=last?Math.max(0,(now-last)/1000):0;last=now;
      scene.dataset.frameMs=String(Math.round(elapsed*1000));
      let remaining=Math.min(.5,elapsed),events=[];
      while(remaining>0&&s.phase!=='complete'){const dt=Math.min(.04,remaining);events.push(...stepState(s,dt));remaining-=dt;}
      scene.dataset.simTime=s.time.toFixed(2);
      events.forEach(event=>{if(event.type==='hit'){sound.impact();scene.classList.add('has-impact');setTimeout(()=>{if(!disposed)scene.classList.remove('has-impact');},180);}else if(event.type==='miss')sound.impact();});
      if(events.length)emit();else if(s.time-lastSaved>=1)emit();
      draw();if(now-lastHudAt>80||events.length){paintHud();lastHudAt=now;}
      if(s.phase==='complete'){paintHud(true);completed();stop();return;}
      if(!disposed&&!paused()&&s.phase!=='brief')raf=requestAnimationFrame(frame);
    }
    function run(){stop();paintHud(true);draw();if(!disposed&&!paused()&&['active','resolving'].includes(s.phase))raf=requestAnimationFrame(frame);else if(s.phase==='complete')completed();}
    function begin(){if(disposed||paused()||s.phase!=='brief')return;s.phase='active';sound.unlock();emit();run();}
    function aim(){if(disposed||paused()||s.phase!=='active')return;s.aim=!s.aim;if(!s.aim)s.lock=0;sound.unlock();emit();paintHud(true);draw();}
    function fire(){if(disposed||paused())return;if(fireState(s)){sound.unlock();sound.shot();emit();paintHud(true);draw();}}
    container.addEventListener('click',event=>{const button=event.target.closest('[data-rpg]');if(!button||!container.contains(button))return;if(button.dataset.rpg==='begin')begin();else if(button.dataset.rpg==='aim')aim();else if(button.dataset.rpg==='fire')fire();},{signal:abort.signal});
    document.addEventListener('keydown',event=>{
      const input=event.target&&event.target.closest&&event.target.closest('input,textarea,select,[contenteditable="true"]');
      if(input||event.repeat||event.altKey||event.ctrlKey||event.metaKey||disposed||paused())return;
      if(event.code==='Space'&&event.target&&event.target.closest&&event.target.closest('button,a,[role="button"]'))return;
      if(event.code==='KeyA'){event.preventDefault();aim();}else if(event.code==='Space'){event.preventDefault();if(s.phase==='brief')begin();else fire();}
    },{signal:abort.signal});
    function pauseChanged(){emit();if(paused()){stop();paintHud(true);}else run();}
    root.addEventListener('blur',()=>{blurred=true;pauseChanged();},{signal:abort.signal});
    root.addEventListener('focus',()=>{blurred=false;pauseChanged();},{signal:abort.signal});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)blurred=false;pauseChanged();},{signal:abort.signal});
    root.addEventListener('pagehide',()=>{blurred=true;pauseChanged();},{signal:abort.signal});
    root.addEventListener('pageshow',()=>{blurred=false;pauseChanged();},{signal:abort.signal});
    let observer=null;
    try{renderer=createRenderer(canvas,error=>report(error),()=>{failed=false;resize();run();if(!failed)call('onReady',{renderer:renderer.kind});});scene.dataset.renderer=renderer.kind;if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(resize);observer.observe(scene);}else root.addEventListener('resize',resize,{signal:abort.signal});resize();run();if(!failed)call('onReady',{renderer:renderer.kind});}
    catch(error){report(error);}
    if(s.phase==='complete')completed();
    emit();
    return Object.freeze({
      getState:()=>snapshot(s),
      setMuted:value=>{sound.setMuted(!!value);},
      setPaused:value=>{externalPaused=!!value;pauseChanged();},
      destroy:()=>{if(disposed)return;emit();disposed=true;stop();abort.abort();if(observer)observer.disconnect();if(renderer)renderer.destroy();sound.destroy();container.classList.remove('rpg-mount');container.innerHTML='';}
    });
  }
  return {mount:mount,_test:{initialState:initialState,stepState:stepState,fireState:fireState,heliAt:heliAt,validResult:validResult,cameraFor:cameraFor}};
});
