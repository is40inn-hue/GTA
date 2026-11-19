'use strict';
// Framed gameplay never creates its own Telegram SDK; the host owns its lifecycle.
if(window.self===window.top){
  function layout(){const tg=window.Telegram?.WebApp;if(tg?.initData)window.GTATelegramLayout?.connect(tg);}
  if(!window.Telegram?.WebApp){const sdk=document.createElement('script');sdk.src='https://telegram.org/js/telegram-web-app.js?65';sdk.async=true;sdk.onload=layout;document.head.appendChild(sdk);}
  layout();
  window.GTAGameGestures?.setActive(true);
}
