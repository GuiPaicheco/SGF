(function(root){
 'use strict';
 async function open({app,esc,request,isCurrent,cnes,onDone,onBack}) {
  let busy=false,closed=false,error='',requestId=root.crypto.randomUUID(),lastPayload='',draft={};
  const fields=[['fullName','Nome completo'],['registration','Matrícula municipal'],['cbo','CBO (6 dígitos)'],['municipalPosition','Cargo municipal'],['weeklyHours','Carga semanal (horas)'],['teamLabel','Equipe'],['admissionDate','Data de admissão'],['employmentType','Vínculo municipal']];
  function draw(){
   if(closed||!isCurrent())return;
   app.innerHTML=`<section class="card" aria-busy="${busy}"><p class="eyebrow">Administração · CNES ${esc(cnes)}</p><h2>Incluir funcionário manualmente</h2><p>Use quando a coleta CNES estiver indisponível ou incompleta. A origem será identificada como manual, sem criar login, saldo ou direito a férias. O cadastro ficará pendente de conferência.</p>${error?`<p role="alert">${esc(error)}</p>`:''}<form id="rh-manual-form"><div class="form-grid">${fields.map(([key,label])=>`<div class="field"><label for="manual-${key}">${label}</label><input class="control" id="manual-${key}" name="${key}" value="${esc(draft[key]??'')}" type="${key==='weeklyHours'?'number':key==='admissionDate'?'date':'text'}" ${['fullName','registration','cbo'].includes(key)?'required':''} ${key==='cbo'?'pattern="[0-9]{6}" inputmode="numeric" maxlength="6"':key==='weeklyHours'?'min="0" max="168" step="0.01"':`maxlength="${key==='registration'?60:180}"`} ${busy?'disabled':''}></div>`).join('')}</div><div class="field"><label for="manual-reason">Motivo da inclusão manual</label><textarea class="control" id="manual-reason" name="reason" required minlength="3" maxlength="500" ${busy?'disabled':''}>${esc(draft.reason||'')}</textarea></div><p>Informe os dados disponíveis. Os campos municipais ainda ausentes deverão ser conferidos antes da integração ao vínculo. Se a matrícula já existir, utilize o cadastro anterior.</p><div class="actions"><button class="button button-primary" ${busy?'disabled':''}>Salvar cadastro pendente</button><button id="manual-back" type="button" class="button button-secondary" ${busy?'disabled':''}>Voltar aos funcionários</button></div></form></section>`;
   root.SGFRhFocus?.message(app);
   app.querySelector('#manual-back').onclick=()=>{closed=true;onBack();};
   app.querySelector('#rh-manual-form').onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    draft=Object.fromEntries(new FormData(event.target));
    const {cbo,reason,...localData}=draft;if(localData.weeklyHours!=='')localData.weeklyHours=Number(localData.weeklyHours);
    const signature=JSON.stringify({cbo,reason,localData});
    if(lastPayload&&signature!==lastPayload)requestId=root.crypto.randomUUID();lastPayload=signature;
    busy=true;error='';draw();
    try{const result=await request({action:'create-manual',cnes,requestId,cbo,reason,localData});if(!isCurrent()||closed)return;closed=true;onDone(result);}
    catch(e){if(isCurrent()&&!closed){error=e.message;busy=false;draw();}}
   };
  }
  draw();
 }
 root.SGFRhManual={open};
})(globalThis);
