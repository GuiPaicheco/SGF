(function(root){
 'use strict';
 function message(app){
  const element=app.querySelector('[role="alert"]')||app.querySelector('h2')||app.querySelector('h1');
  if(!element)return;
  element.setAttribute('tabindex','-1');element.focus({preventScroll:false});
 }
 function control(app,selector){app.querySelector(selector)?.focus({preventScroll:true});}
 root.SGFRhFocus={message,control};
})(globalThis);
