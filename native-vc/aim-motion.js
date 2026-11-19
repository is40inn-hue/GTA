/* Keep touch fractions until a native frame can consume an integer mouse delta. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GTAAimMotion=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
function create(){
 let x=0,y=0;
 const clamp=(n,max)=>Math.max(-max,Math.min(max,n));
 // Two native frames of backlog maximum: a long browser stall must not leave
 // the camera moving for seconds after a gesture. Fractions are otherwise kept.
 function clear(){x=0;y=0;}
 function push(dx,dy,enabled=true){
  if(!enabled){clear();return;}
  if(Number.isFinite(dx))x=clamp(x+dx,140);
  if(Number.isFinite(dy))y=clamp(y+dy,100);
 }
 function integer(n){return Math.trunc(n+Math.sign(n)*1e-9)||0;}
 function flush(enabled=true){
  if(!enabled){clear();return {x:0,y:0};}
  const dx=clamp(integer(x),70),dy=clamp(integer(y),50);
  x-=dx;y-=dy;
  if(Math.abs(x)<1e-9)x=0;if(Math.abs(y)<1e-9)y=0;
  return {x:dx,y:dy};
 }
 return {push,flush,clear};
}
return {create};
});
