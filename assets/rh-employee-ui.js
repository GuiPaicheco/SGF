(function(root){
'use strict';
async function open({app,esc,request,isCurrent,entryId,onBack}){
 let data=null,busy=true,closed=false,error='',notice='',birthday='';const current=()=>!closed&&isCurrent();
 const back=()=>{if(busy)return;closed=true;onBack();};
 function draw(){if(!current())return;app.setAttribute?.('aria-busy',String(busy));app.innerHTML=`<section class="card"><h2>Cadastro do funcionário</h2>${data?`<p><strong>${esc(data.full_name)}</strong></p><p>${esc(data.position||'—')}</p>`:''}${error?`<p role="alert">${esc(error)}</p>`:''}${notice?`<p role="status">${esc(notice)}</p>`:''}${busy?'<p role="status">Salvando / carregando cadastro…</p>':''}${data?`<form id="rh-birthday-form"><div class="field"><label for="rh-birthday">Aniversário (dia/mês)</label><input id="rh-birthday" class="control" inputmode="numeric" placeholder="DD/MM" maxlength="5" pattern="(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2])" value="${esc(birthday)}" ${busy?'disabled':''}><small>Somente dia e mês. Deixe em branco para remover.</small></div><button class="button button-primary" ${busy?'disabled':''}>Salvar cadastro</button></form>`:''}<button id="rh-birthday-back" class="button button-secondary" ${busy?'disabled':''}>Voltar aos funcionários</button></section>`;
 app.querySelector('#rh-birthday-back').onclick=back;
 const form=app.querySelector('#rh-birthday-form');if(form)form.onsubmit=async e=>{e.preventDefault();if(busy)return;birthday=app.querySelector('#rh-birthday').value.trim();error='';notice='';const match=birthday.match(/^(\d{2})\/(\d{2})$/);if(birthday&&!match){error='Informe o aniversário no formato DD/MM.';draw();return;}busy=true;draw();try{const result=await request({action:'save-birthday',entryId,version:data.version,month:match?Number(match[2]):null,day:match?Number(match[1]):null});if(current()){data=result;notice='Cadastro salvo.';}}catch(e){error=e.code==='RH_VERSION_CONFLICT'?'O cadastro mudou em outra sessão. Volte à lista e abra o cadastro atualizado antes de salvar.':e.message;}finally{busy=false;draw();if(current())root.SGFRhFocus?.message(app);}};
 }
 draw();try{const result=await request({action:'employee-profile',entryId});if(current()){data=result;birthday=result.birthday?result.birthday.slice(3)+'/'+result.birthday.slice(0,2):'';}}catch(e){error=e.message;}finally{busy=false;draw();}
}
root.SGFRhEmployee={open};
})(globalThis);
