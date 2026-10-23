(function(root){
'use strict';
function sourceView(data,esc){
 const payload=data.source?.payload,identity=payload?.cadastro?.identificacao;
 const raw=value=>'<pre>'+esc(JSON.stringify(value,null,2))+'</pre>';
 const fields=identity?Object.entries(identity).map(([key,value])=>'<dt>'+esc(key.replaceAll('_',' '))+'</dt><dd>'+(value===null?'Não informado':typeof value==='object'?raw(value):esc(value))+'</dd>').join(''):'';
 return '<h2>Ver CNES</h2><p>Dados da fonte separados dos lançamentos do RH. A consulta não modifica cadastros.</p>'+
 (payload?'<h3>Estabelecimento</h3><dl>'+fields+'</dl><p>Consulta: '+esc(data.source.collected_at)+' · Competência: '+esc(payload.metadados.competencia||'Não informada pela fonte')+'</p><details><summary>Ficha e módulos publicados</summary>'+raw({estabelecimento:payload.estabelecimento,modulos:payload.modulos,equipes:payload.equipes,metadados:payload.metadados})+'</details>':'<p role="status">A importação anterior contém profissionais, mas não contém a ficha do estabelecimento. Use Atualizar CNES para consultá-la.</p>')+
 '<h3>Informações registradas pelo RH</h3><details><summary>Day-offs de aniversário cadastrados pelo RH (dia/mês)</summary>'+raw(data.dayoffs||[])+'</details><details><summary>Day-offs e folgas lançados no calendário</summary>'+raw(data.occurrences||[])+'</details>';
}
async function open({app,esc,request,isCurrent,cnes,onBack}){
 let page=0,data=null,list=null,busy=false,error='';
 async function load(){if(busy||!isCurrent())return;busy=true;draw();try{const values=await Promise.all([request({action:'view-source',cnes}),request({action:'list',cnes,page,search:'',filters:{}})]);if(isCurrent())[data,list]=values;}catch(e){error=e.message;}finally{busy=false;draw();}}
 function draw(){if(!isCurrent())return;app.innerHTML='<section class="card">'+(data?sourceView(data,esc):'<h2>Ver CNES</h2>')+(error?'<p role="alert">'+esc(error)+'</p>':'')+(busy?'<p role="status">Carregando…</p>':'')+(list?'<h3>Profissionais incorporados · '+list.total+'</h3>'+list.entries.map(e=>'<details><summary>'+esc(e.source_data.fullName)+' · '+esc(e.source_data.occupation)+' · '+esc(e.source_data.weeklyHours)+'h</summary>'+rawEntry(e)+'</details>').join('')+'<div class="actions"><button id="source-prev" class="button button-secondary" '+(busy||!page?'disabled':'')+'>Anterior</button><span>Página '+(page+1)+'</span><button id="source-next" class="button button-secondary" '+(busy||(page+1)*50>=list.total?'disabled':'')+'>Próxima</button></div>':'')+'<button id="source-back" class="button button-secondary" '+(busy?'disabled':'')+'>Voltar às unidades</button></section>';
 app.querySelector('#source-back').onclick=()=>{if(!busy)onBack();};const prev=app.querySelector('#source-prev'),next=app.querySelector('#source-next');if(prev)prev.onclick=()=>{page--;load();};if(next)next.onclick=()=>{page++;load();};
 }
 const rawEntry=e=>'<pre>'+esc(JSON.stringify(e.source_data,null,2))+'</pre>';
 await load();
}
root.SGFCnesSource={open,sourceView};
})(globalThis);
