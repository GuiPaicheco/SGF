(function(root){
'use strict';
const names={fullName:'Nome',full_name:'Nome',occupation:'Cargo',cbo:'Classificação da ocupação (CBO)',cns:'Cartão Nacional de Saúde',cns_principal:'CNS principal',weeklyHours:'Carga horária semanal',weekly_hours:'Carga horária semanal',hoursOther:'Carga em outras atividades',hoursAmbulatory:'Carga ambulatorial',hoursHospital:'Carga hospitalar',relationship:'Vinculação',relationshipType:'Tipo de vínculo',relationshipSubtype:'Subtipo de vínculo',sourceEntryDate:'Entrada no estabelecimento',deactivationCompetence:'Competência de desativação',sourceExitDate:'Saída do estabelecimento',status:'Situação',teams:'Equipes',name:'Nome',type:'Tipo',code:'Código',periods:'Períodos',start_date:'Início',end_date:'Último dia',return_date:'Retorno',birthday_month:'Mês do aniversário',birthday_day:'Dia do aniversário',coletado_em:'Data da consulta',ch_total:'Carga horária total',ch_outros:'Outras atividades',ch_ambulatorial:'Carga ambulatorial',ch_hospitalar:'Carga hospitalar',tipo_vinculo:'Tipo de vínculo',subtipo_vinculo:'Subtipo de vínculo',data_entrada:'Data de entrada'};
const label=key=>names[key]||String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,x=>x.toUpperCase());
const ignored=new Set(['entry_id','bond_id','sourceId','sourceHash','source_id','source_hash','digest','raw_html','html']);
const friendly=value=>({ativo:'Ativo',inativo:'Inativo',programada:'Programado',cancelada:'Cancelado',concluida:'Concluído',folga:'Folga',afastamento:'Afastamento',dayoff:'Day-off',regulamentar:'Férias regulamentares',premio:'Férias-prêmio'})[value]||value;
function renderData(value,esc,depth=0){
 if(value===null||value===undefined||value==='')return '<span class="muted">Não informado</span>';
 if(typeof value==='boolean')return value?'Sim':'Não';
 if(typeof value!=='object')return esc(friendly(value));
 if(depth>8)return '<span>Consulte a seção correspondente na fonte CNES.</span>';
 if(Array.isArray(value)){if(!value.length)return '<p class="muted">Nenhuma informação registrada.</p>';return '<div class="cnes-data-list">'+value.map((x,i)=>typeof x==='object'&&x!==null?'<section class="cnes-data-item"><h4>'+esc(x.fullName||x.full_name||x.nome||x.name||'Registro '+(i+1))+'</h4>'+renderData(x,esc,depth+1)+'</section>':'<span class="cnes-chip">'+renderData(x,esc,depth+1)+'</span>').join('')+'</div>';}
 return '<dl class="cnes-data-grid">'+Object.entries(value).filter(([k])=>!ignored.has(k)).map(([k,v])=>'<div class="cnes-data-field"><dt>'+esc(label(k))+'</dt><dd>'+renderData(v,esc,depth+1)+'</dd></div>').join('')+'</dl>';
}
function differences(before,after,esc){
 const keys=[...new Set([...Object.keys(before||{}),...Object.keys(after||{})])].filter(k=>!ignored.has(k)&&JSON.stringify(before?.[k])!==JSON.stringify(after?.[k]));
 return '<div class="table-wrap"><table class="cnes-diff"><thead><tr><th>Informação</th><th>Cadastro atual</th><th>Dados consultados</th></tr></thead><tbody>'+keys.map(k=>'<tr><th>'+esc(label(k))+'</th><td>'+renderData(before?.[k],esc)+'</td><td>'+renderData(after?.[k],esc)+'</td></tr>').join('')+'</tbody></table></div>';
}
function sourceView(data,esc){
 const payload=data.source?.payload,identity=payload?.cadastro?.identificacao||payload?.estabelecimento;
 return '<section class="cnes-establishment"><h3>Cadastro do estabelecimento</h3><p>Consulte identificação, endereço, contatos e informações publicadas pelo CNES. Os registros do RH são apresentados separadamente.</p>'+
 (payload?renderData(identity,esc)+'<p class="muted">Última consulta: '+esc(data.source.collected_at?new Date(data.source.collected_at).toLocaleString('pt-BR'):'Não informada')+' · Competência: '+esc(payload.metadados?.competencia||'Não informada na fonte')+'</p>'+
 [['Cadastro completo',payload.cadastro],['Equipes do estabelecimento',payload.equipes],['Serviços e módulos',payload.modulos]].filter(([,v])=>v).map(([t,v])=>'<details class="cnes-section"><summary>'+t+'</summary>'+renderData(v,esc)+'</details>').join(''):
 '<div class="notice">A ficha do estabelecimento ainda não foi consultada. Clique em Atualizar CNES para carregar os dados publicados.</div>')+
 '<details class="cnes-section"><summary>Informações registradas pelo RH</summary><h4>Day-off de aniversário</h4>'+((data.dayoffs||[]).length?'<div class="table-wrap"><table><thead><tr><th>Profissional</th><th>Dia / mês</th></tr></thead><tbody>'+data.dayoffs.map(d=>'<tr><td>'+esc(d.name)+'</td><td>'+esc(d.birthday_month?String(d.birthday_day).padStart(2,'0')+'/'+String(d.birthday_month).padStart(2,'0'):'Não cadastrado')+'</td></tr>').join('')+'</tbody></table></div>':'<p>Nenhum day-off cadastrado.</p>')+'<h4>Folgas e afastamentos registrados</h4>'+renderData(data.occurrences||[],esc)+'</details></section>';
}
async function open({app,esc,request,isCurrent,cnes,onBack}){
 let page=0,busy=false,data=null,list=null,error='';
 async function load(){if(busy||!isCurrent())return;busy=true;draw();try{const values=await Promise.all([request({action:'view-source',cnes}),request({action:'list',cnes,page,search:'',filters:{}})]);if(isCurrent())[data,list]=values;}catch(e){error=e.message;}finally{busy=false;draw();}}
 function draw(){if(!isCurrent())return;app.innerHTML='<section class="card">'+(data?sourceView(data,esc):'<h2>Cadastro CNES</h2>')+(error?'<p role="alert">'+esc(error)+'</p>':'')+(busy?'<p role="status">Carregando cadastro…</p>':'')+(list?'<h3>Profissionais · '+list.total+'</h3>'+list.entries.map(e=>'<details class="cnes-section"><summary>'+esc(e.source_data.fullName)+' · '+esc(e.source_data.occupation||'Cargo não informado')+'</summary>'+renderData(e.source_data,esc)+'</details>').join('')+'<div class="actions"><button id="source-prev" class="button button-secondary" '+(busy||!page?'disabled':'')+'>Anterior</button><button id="source-next" class="button button-secondary" '+(busy||(page+1)*50>=list.total?'disabled':'')+'>Próxima</button></div>':'')+'<button id="source-back" class="button button-secondary">Voltar</button></section>';
 app.querySelector('#source-back').onclick=()=>{if(!busy)onBack();};const prev=app.querySelector('#source-prev'),next=app.querySelector('#source-next');if(prev)prev.onclick=()=>{page--;load();};if(next)next.onclick=()=>{page++;load();};
 }await load();
}
root.SGFCnesSource={open,sourceView,renderData,differences,label};
})(globalThis);
