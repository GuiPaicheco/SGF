(function(root){
 'use strict';
 async function open({app,esc,request,isCurrent,cnes,entryId,onDone,backLabel='Voltar às contas RH'}){
  let data,busy=false,closed=false,error='',draft={bond:'',reason:'',confirm:false};
  const run=async task=>{if(busy||!isCurrent())return;busy=true;draw();try{await task();}catch(e){error=e.message;}finally{busy=false;if(isCurrent())draw();}};
  function draw(){
   if(closed||!isCurrent())return;
   if(!data){app.innerHTML='<section class="card"><p role="status">Carregando vínculo funcional…</p></section>';if(error)app.textContent=error;return;}
   const complete=data.review_status==='reviewed'&&data.registration&&data.position&&data.admission_date&&data.employment_type;
   app.innerHTML=`<section class="card"><h2>Integrar cadastro ao vínculo funcional</h2><p>${esc(data.full_name)} · Matrícula ${esc(data.registration||'Pendente')}</p><dl><dt>Cargo municipal</dt><dd>${esc(data.position||'Pendente')}</dd><dt>Admissão</dt><dd>${esc(data.admission_date||'Pendente')}</dd><dt>Vínculo municipal</dt><dd>${esc(data.employment_type||'Pendente')}</dd></dl><p>Associe a matrícula conferida ao vínculo existente ou crie o cadastro funcional quando ele ainda não existir. Esta operação não cria login, CPF, direito a férias ou saldo de horas para o funcionário.</p>${data.binding?'<p>Há uma associação anterior. A reconfirmação preserva o vínculo e seus dados.</p>':''}${!complete?'<p role="alert">Confira matrícula, cargo, admissão e vínculo municipal na Conferência CNES antes de integrar.</p>':''}${error?`<p role="alert">${esc(error)}</p>`:''}<form id="rh-bond-form"><div class="field"><label for="rh-bond-choice">Vínculo funcional</label><select id="rh-bond-choice" class="control" required ${busy?'disabled':''}><option value="">Selecione</option>${data.bonds.map(row=>`<option value="${esc(row.id)}" ${draft.bond===row.id?'selected':''}>${esc(row.registration)} · ${esc(row.full_name)}</option>`).join('')}${!data.binding&&!data.bonds.length?`<option value="new" ${draft.bond==='new'?'selected':''}>Criar cadastro funcional sem conta de acesso</option>`:''}</select></div><div class="field"><label for="rh-bond-reason">Justificativa da conferência</label><textarea id="rh-bond-reason" class="control" minlength="3" maxlength="500" required ${busy?'disabled':''}>${esc(draft.reason)}</textarea></div><label><input id="rh-bond-pole" type="checkbox" required ${draft.confirm?'checked':''} ${busy?'disabled':''}> Confirmei que este CNES é a unidade polo responsável por controlar este vínculo.</label><p>Outra unidade polo já definida exige revisão administrativa; a integração não a substitui automaticamente.</p><div class="actions"><button class="button button-primary" ${busy||!complete?'disabled':''}>Confirmar integração</button><button id="rh-bond-back" type="button" class="button button-secondary" ${busy?'disabled':''}>${esc(backLabel)}</button><button type="button" data-go="cnes-import" class="button button-secondary">Conferência CNES</button></div></form></section>`;
   app.querySelector('#rh-bond-back').onclick=()=>{closed=true;onDone();};
   app.querySelector('#rh-bond-form').onsubmit=async e=>{e.preventDefault();draft={bond:app.querySelector('#rh-bond-choice').value,reason:app.querySelector('#rh-bond-reason').value,confirm:app.querySelector('#rh-bond-pole').checked};error='';await run(async()=>{
    await request({action:'bind-registry',cnes,entryId,entryVersion:data.entry_version,bindingVersion:data.binding?.version||0,
     bondId:draft.bond==='new'?null:draft.bond,reason:draft.reason,confirmPole:draft.confirm});
    if(isCurrent()){closed=true;onDone();}
   });};
  }
  draw();try{data=await request({action:'binding-options',cnes,entryId});if(data.binding)draft.bond=data.binding.bond_id;draw();}catch(e){error=e.message;draw();}
 }
 root.SGFRhBond={open};
})(globalThis);
