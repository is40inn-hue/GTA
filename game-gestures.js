/* Telegram 7.7+ host swipe protection, scoped to a mounted game only.
   Header close/back remains Telegram-controlled. Never intercept document touchmove. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports={create:factory};
  else root.GTAGameGestures=factory(root);
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  let active=false, owned=null, previous=null, timer=null, disposed=false, suspended=false, tries=0;
  const doc=root.document;
  // WebKit can select a held button's nested label even when the button
  // itself is non-selectable. Guard the event as well as the CSS, in both the
  // host and the native iframe. Never capture touchmove/pointermove here.
  const editable='input,textarea,select,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],[data-native-selection],#result-story-image,#error-diagnostic,.review-body';
  const chrome='#app,button,[role="button"],.topbar,.rpg-exam-shell,.rpg-scene-host,#canvas,.range-hud,.range-controls,#car-controls,.range-instruction,.native-screen,#native-toast';
  function guard(event){
    if(disposed||suspended)return;
    const target=event.target?.nodeType===3?event.target.parentElement:event.target;
    if(!target?.closest||target.closest(editable))return;
    if((active||target.closest(chrome))&&event.cancelable!==false)event.preventDefault();
  }
  const guardEvents=['contextmenu','selectstart','dragstart'];
  for(const event of guardEvents)doc?.addEventListener?.(event,guard,{capture:true,passive:false});
  function css(value){doc?.documentElement?.classList.toggle('gta-game-gestures',value);}
  function restore(){
    if(timer!==null){root.clearTimeout(timer);timer=null;}
    if(owned&&previous===true){try{owned.enableVerticalSwipes();}catch(_){}}
    owned=null;previous=null;
  }
  function apply(){
    timer=null;if(!active||disposed||suspended)return;
    const tg=root.Telegram?.WebApp;
    if(owned)return;
    try{
      if(tg&&typeof tg.disableVerticalSwipes==='function'&&typeof tg.enableVerticalSwipes==='function'&&
        typeof tg.isVersionAtLeast==='function'&&tg.isVersionAtLeast('7.7')&&typeof tg.isVerticalSwipesEnabled==='boolean'){
        previous=tg.isVerticalSwipesEnabled;
        if(previous)tg.disableVerticalSwipes();
        owned=tg;return;
      }
    }catch(_){previous=null;}
    // SDK is async on the host; retry only while the game is mounted.
    if(!tg && ++tries < 40)timer=root.setTimeout(apply,500);
  }
  function setActive(value){if(!active&&value)tries=0;active=!!value;css(active);if(!active)restore();else if(!owned&&timer===null)apply();}
  function hide(){suspended=true;restore();css(false);}
  function show(){suspended=false;if(active){css(true);apply();}}
  root.addEventListener?.('pagehide',hide);root.addEventListener?.('pageshow',show);
  function destroy(){active=false;disposed=true;restore();css(false);root.removeEventListener?.('pagehide',hide);root.removeEventListener?.('pageshow',show);for(const event of guardEvents)doc?.removeEventListener?.(event,guard,true);}
  return {setActive,destroy};
});
