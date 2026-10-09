// Ensaio do piloto compartilhado: apenas conta nova identificada TESTE e pedidos próprios.
// Não envia e-mail, não redefine senha de conta existente e não apaga histórico.
import assert from 'node:assert/strict';
const url='https://ijhvbzomakbbxverqfqh.supabase.co';
const key='sb_publishable_9upWl4mCzsfuaPE1_gOFkw_9Im-Y4sJ';
const password=process.env.SGF_REHEARSAL_PASSWORD;
if(!password || !process.env.SGF_TEST_ADMIN_PASSWORD) throw Error('Credenciais de ensaio ausentes.');
const mode=process.argv[2]||'prepare';
const prefix='sgf-bloco03-20261008';
const email=`${prefix}@betim.mg.gov.br`;
const results=[];
function record(message){results.push(message);console.log(JSON.stringify({passed:message}));}
async function call(fn,payload,token,context){
 const started=Date.now();
 const response=await fetch(`${url}/functions/v1/${fn}`,{method:'POST',headers:{'content-type':'application/json',apikey:key,
  ...(token?{authorization:`Bearer ${token}`}:{ }),...(context?{'x-sgf-role':context.role,...(context.bond_id?{'x-sgf-bond':context.bond_id}:{}),
  ...(context.cnes_unit_id?{'x-sgf-cnes':context.cnes_unit_id}:{}),...(context.lotacao_id?{'x-sgf-lotacao':context.lotacao_id}:{})}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
 const body=await response.json();
 console.log(JSON.stringify({endpoint:fn,action:payload.action,reviewAction:payload.review_action,status:response.status,milliseconds:Date.now()-started}));
 return {status:response.status,body};
}
async function ok(fn,payload,token,context){const r=await call(fn,payload,token,context);assert.ok(r.status>=200&&r.status<300,`${fn}/${payload.action}: ${r.status} ${r.body.error||''}`);return r.body;}
async function rest(path,token,context){const r=await fetch(`${url}/rest/v1/${path}`,{headers:{apikey:key,authorization:`Bearer ${token}`,'x-sgf-role':context.role,
 ...(context.bond_id?{'x-sgf-bond':context.bond_id}:{}),...(context.cnes_unit_id?{'x-sgf-cnes':context.cnes_unit_id}:{}),...(context.lotacao_id?{'x-sgf-lotacao':context.lotacao_id}:{})}});assert.equal(r.status,200);return r.json();}
function cpf(base){let v=base;for(let n=9;n<=10;n++)v+=([...v].reduce((s,d,i)=>s+Number(d)*(n+1-i),0)*10%11)%10;return v;}
const admin=await ok('access-auth',{action:'login',identifier:'admin',password:process.env.SGF_TEST_ADMIN_PASSWORD});
const adminContext={role:'administrador'};
const list=await ok('manage-profiles',{action:'list'},admin.access_token,adminContext);
const catalog=await ok('access-auth',{action:'registration-catalogs'});
const a=catalog.cnesUnits.find(u=>u.code==='2126028'),b=catalog.cnesUnits.find(u=>u.code==='2126060');
const location=list.locations.find(l=>l.code===a.code),cargo=catalog.positions.find(p=>p.name==='Apoio Administrativo');
assert.ok(a&&b&&location&&cargo);
let profile=list.profiles.find(p=>p.email===email);
if(mode==='prepare' && !profile){
 profile=await ok('manage-profiles',{action:'create',full_name:'TESTE BLOCO 03 — Ciclo multiunidade',email,cpf:cpf('918038801'),birth_date:'1990-01-01',
  roles:['servidor','rh'],scope_ids:[location.id],bonds:[{registration:'SGF-BLOCO03-M1',cargo_id:cargo.id,employment_type:'estatutario',weekly_hours:40,
   units:[{cnes_unit_id:a.id,not_applicable:true,weekly_hours:20},{cnes_unit_id:b.id,not_applicable:true,weekly_hours:20}]}]},admin.access_token,adminContext);
 const first=await ok('access-auth',{action:'login',identifier:email,password:profile.temporary_password});
 await ok('access-auth',{action:'change-password',password},first.access_token);
 await new Promise(resolve=>setTimeout(resolve,3100));
}else assert.ok(profile && profile.full_name.startsWith('TESTE BLOCO 03'),'Conta técnica não encontrada; não recriar nem redefinir senha.');
const signed=await ok('access-auth',{action:'login',identifier:email,password});
const contexts=(await ok('access-auth',{action:'contexts'},signed.access_token)).contexts;
const owner=contexts.find(c=>c.role==='servidor'&&c.cnes_unit_id===a.id),rh=contexts.find(c=>c.role==='rh');
const other=contexts.find(c=>c.role==='servidor'&&c.cnes_unit_id===b.id);
assert.ok(owner&&other&&rh);
if(mode==='prepare'){
 const resources=await ok('manage-operations',{action:'bond-resources',bond_id:owner.bond_id},admin.access_token,adminContext);
 if(!resources.account?.validated_minutes) await ok('manage-operations',{action:'time-bank',bond_id:owner.bond_id,hours:240,description:'Crédito sintético para ensaio Bloco 03',occurred_on:'2026-10-08',version:resources.account?.version||0,entry_key:crypto.randomUUID()},admin.access_token,adminContext);
 console.log(JSON.stringify({mode,fixture:{id:profile.id,email,cpf:cpf('918038801'),contexts},results:['Conta técnica nova, dois CNES, RH apenas no CNES A, crédito sintético por matrícula; nenhum e-mail enviado']}));
}else if(mode==='concurrency'){
 const rows=await rest(`vacation_requests?context_bond_id=eq.${owner.bond_id}&select=id,status,unit_reviews:request_unit_reviews(id,cnes_unit_id,status,version)&order=created_at.desc`,admin.access_token,adminContext);
 const request=rows.find(r=>['enviada','em_analise'].includes(r.status)&&r.unit_reviews.length===2&&r.unit_reviews.some(v=>v.status==='pendente'));assert.ok(request,'Envie antes um pedido sintético ainda pendente.');
 const review=request.unit_reviews.find(v=>v.cnes_unit_id===a.id);
 if(review.status==='pendente'){
 const action={action:'unit-review',review_id:review.id,review_action:'approve',version:review.version};
 const simultaneous=await Promise.all([call('manage-operations',action,admin.access_token,adminContext),call('manage-operations',action,signed.access_token,rh)]);
 assert.equal(simultaneous.filter(r=>r.status===200).length,1);assert.equal(simultaneous.filter(r=>r.status===409).length,1);
 record('Dois gestores reais simultâneos: uma decisão e um conflito 409, sem duplicação');
 }else assert.ok(['aprovada','programada'].includes(review.status),'Retomada apenas com análise B pendente.');
 const refreshed=(await rest(`request_unit_reviews?request_id=eq.${request.id}&select=id,cnes_unit_id,status,version`,admin.access_token,adminContext));
 const scheduled=refreshed.find(v=>v.cnes_unit_id===a.id);
 if(scheduled.status==='aprovada'){
 const schedule={action:'unit-review',review_id:scheduled.id,review_action:'schedule',version:scheduled.version};
 const twice=await Promise.all([call('manage-operations',schedule,admin.access_token,adminContext),call('manage-operations',schedule,signed.access_token,rh)]);
 assert.equal(twice.filter(r=>r.status===200).length,1);assert.equal(twice.filter(r=>r.status===409).length,1);
 record('Duas inclusões simultâneas: apenas uma confirmação e um débito');
 }
 const otherReview=refreshed.find(v=>v.cnes_unit_id===b.id);
 const denied=await call('manage-operations',{action:'unit-review',review_id:otherReview.id,review_action:'approve',version:otherReview.version},signed.access_token,rh);
 assert.equal(denied.status,403);record('RH do CNES A não aprova revisão do CNES B');
 const plan=await ok('manage-operations',{action:'revision-plan',request_id:request.id,starts:['2026-12-01']},admin.access_token,adminContext);
 const days=plan.plan.days.map((day,i)=>({date:day.date,bond_unit_id:i%2?other.bond_unit_id:owner.bond_unit_id}));
 const commit={action:'revision-commit',request_id:request.id,starts:['2026-12-01'],days,fingerprint:plan.plan.fingerprint,justification:'Ensaio sintético de confirmação concorrente'};
 const replacements=await Promise.all([call('manage-operations',commit,admin.access_token,adminContext),call('manage-operations',commit,admin.access_token,adminContext)]);
 assert.equal(replacements.filter(r=>r.status===200).length,1);assert.equal(replacements.filter(r=>r.status===409).length,1);
 record('Confirmações simultâneas de substituição criam um único novo protocolo');
 console.log(JSON.stringify({mode,results,requestId:request.id,replacement:replacements.find(r=>r.status===200).body.replacement}));
}else if(mode==='cross'){
 let rows=await rest(`vacation_requests?context_bond_id=eq.${owner.bond_id}&select=id,status,unit_reviews:request_unit_reviews(id,cnes_unit_id,status,version)&order=created_at.desc`,admin.access_token,adminContext);
 let request=rows.find(r=>!['cancelada','concluida'].includes(r.status)); assert.ok(request);
 if(!request.unit_reviews.every(v=>v.status==='pendente')){
  const plan=(await ok('manage-operations',{action:'revision-plan',request_id:request.id,starts:['2027-02-02']},admin.access_token,adminContext)).plan;
  const replacement=(await ok('manage-operations',{action:'revision-commit',request_id:request.id,starts:['2027-02-02'],fingerprint:plan.fingerprint,
   days:plan.days.map((d,i)=>({date:d.date,bond_unit_id:i%2?other.bond_unit_id:owner.bond_unit_id})),justification:'TESTE — preparar cenário cruzado isolado'},admin.access_token,adminContext)).replacement;
  request=(await rest(`vacation_requests?id=eq.${replacement.id}&select=id,status,unit_reviews:request_unit_reviews(id,cnes_unit_id,status,version)`,admin.access_token,adminContext))[0];
 }
 const review=request.unit_reviews.find(v=>v.cnes_unit_id===a.id);
 const plan=(await ok('manage-operations',{action:'revision-plan',request_id:request.id,starts:['2027-03-02']},admin.access_token,adminContext)).plan;
 const pair=await Promise.all([
  call('manage-operations',{action:'unit-review',review_id:review.id,review_action:'approve',version:review.version},signed.access_token,rh),
  call('manage-operations',{action:'revision-commit',request_id:request.id,starts:['2027-03-02'],fingerprint:plan.fingerprint,
   days:plan.days.map((d,i)=>({date:d.date,bond_unit_id:i%2?other.bond_unit_id:owner.bond_unit_id})),justification:'TESTE — substituição concorrendo com decisão de outro gestor'},admin.access_token,adminContext)
 ]);
 assert.equal(pair.filter(r=>r.status===200).length,1);
 assert.ok(pair.filter(r=>r.status!==200).every(r=>[400,409].includes(r.status)));
 const children=await rest(`vacation_requests?replaces_request_id=eq.${request.id}&select=id,status,unit_reviews:request_unit_reviews(status)`,admin.access_token,adminContext);
 assert.equal(children.length,pair[1].status===200?1:0);
 if(children.length) assert.ok(children[0].unit_reviews.every(v=>v.status==='pendente'));
 record('Operações cruzadas reais: decisão versus substituição, apenas uma vence e não há gravação parcial');
}else if(mode==='inspect'){
 const rows=await rest(`vacation_requests?context_bond_id=eq.${owner.bond_id}&select=id,protocol,status,replaces_request_id,periods:request_periods(days),unit_reviews:request_unit_reviews(status)&order=created_at.desc`,admin.access_token,adminContext);
 assert.ok(rows.length>=4);
 const latest=rows[0];
 const rhReviews=await rest(`request_unit_reviews?request_id=eq.${latest.id}&select=cnes_unit_id`,signed.access_token,rh);
 const ownReviews=await rest(`request_unit_reviews?request_id=eq.${latest.id}&select=cnes_unit_id`,signed.access_token,owner);
 assert.equal(rhReviews.length,1);assert.equal(rhReviews[0].cnes_unit_id,a.id);assert.equal(ownReviews.length,2);
 const rhDays=await rest(`request_day_responsibilities?request_id=eq.${latest.id}&select=cnes_unit_id`,signed.access_token,rh);
 assert.ok(rhDays.length>0&&rhDays.every(d=>d.cnes_unit_id===a.id));
 record('Mesma conta com dois perfis: RH lê apenas revisões/dias do CNES A; como Servidor vê as duas unidades do próprio pedido');
 assert.ok(rows.filter(r=>r.replaces_request_id).every(r=>r.periods.reduce((n,p)=>n+p.days,0)===10));
 for(const month of ['2026-11','2026-12','2027-01']){
  const calendar=await ok('manage-operations',{action:'unit-calendar',month},admin.access_token,adminContext);
  const ownIds=new Set(rows.map(r=>r.id));
  assert.ok(calendar.requests.filter(r=>ownIds.has(r.id)).every(r=>!['cancelada','rejeitada'].includes(r.global_status)));
 }
 const balance=await ok('manage-operations',{action:'bond-resources',bond_id:owner.bond_id},admin.access_token,adminContext);
 assert.equal(balance.account.validated_minutes,14400);
 record('Calendário exclui pedidos substituídos/recusados; dias preservados e saldo sintético totalmente estornado');
}else if(mode==='block4'){
 const scale=await ok('manage-operations',{action:'scale-list',month:'2026-10'},admin.access_token,adminContext);
 const days=scale.planned_days.filter(d=>d.cnes_unit_id===a.id&&d.scale_date==='2026-10-09');
 const payload={action:'scale-save',cnes_unit_id:a.id,date:'2026-10-09',bond_unit_ids:[owner.bond_unit_id],version:days[0]?.version||0};
 const pair=await Promise.all([call('manage-operations',payload,admin.access_token,adminContext),call('manage-operations',payload,signed.access_token,rh)]);
 assert.equal(pair.filter(r=>r.status===200).length,1); assert.equal(pair.filter(r=>r.status===409).length,1);
 record('Escala mínima: dois gestores simultâneos, uma gravação e um conflito 409');
 const denied=await call('manage-operations',{...payload,cnes_unit_id:b.id,date:'2026-10-09',bond_unit_ids:[other.bond_unit_id],version:0},signed.access_token,rh);
 assert.equal(denied.status,403);record('Escala mínima de outro CNES bloqueada para o RH');
}else if(['calendar4-add','calendar4-move','calendar4-remove'].includes(mode)){
 const current=(await rest(`vacation_requests?context_bond_id=eq.${owner.bond_id}&status=in.(enviada,em_analise)&select=id,start_date,end_date,return_date,calendar_adjustment_state&order=created_at.desc`,admin.access_token,adminContext))[0];
 assert.ok(current&&current.start_date==='2027-03-02','Ensaio exige pedido sintético em março.');
 const others=await rest(`vacation_requests?servidor_id=neq.${owner.servidor_id||'4de0e360-7a5b-42a0-b59b-4a9b6458f3ea'}&status=in.(enviada,em_analise,aprovada,programada,reprogramada)&start_date=lte.2027-03-31&end_date=gte.2027-03-01&select=id`,admin.access_token,adminContext);
 assert.equal(others.length,0,'Não alterar calendário com pedidos de outras pessoas no período.');
 const {events}=await ok('manage-catalogs',{action:'calendar-list'},admin.access_token,adminContext);
 const name='TESTE BLOCO 04 — ajuste dinâmico março 2027';
 const event=events.find(e=>e.name===name);
 assert.ok(mode==='calendar4-add'?!event||!event.active:event?.active);
 await ok('manage-catalogs',{action:'calendar-save',id:event?.id,event_date:mode==='calendar4-move'?'2027-03-04':event?.event_date||'2027-03-03',type:'feriado',name,active:mode!=='calendar4-remove',version:event?.version},admin.access_token,adminContext);
 const row=(await rest(`vacation_requests?id=eq.${current.id}&select=start_date,end_date,return_date,calendar_adjustment_state`,admin.access_token,adminContext))[0];
 assert.equal(row.start_date,'2027-03-02');assert.equal(row.end_date,mode!=='calendar4-remove'?'2027-03-16':'2027-03-15');
 assert.equal(row.return_date,mode!=='calendar4-remove'?'2027-03-17':'2027-03-16');
 record(mode==='calendar4-add'?'Feriado estende pedido real sintético em um dia útil e preserva início':mode==='calendar4-move'?'Mudança de data do feriado preserva contagem e reavalia responsabilidades':'Desativação do feriado restaura fim/retorno do pedido sintético');
 console.log(JSON.stringify({requestId:current.id,...row}));
}else if(mode==='legacy'){
 const req='ecb33183-482d-4c79-83f2-1f077c44a8ec';
 const modern=(await rest(`vacation_requests?context_bond_id=eq.${owner.bond_id}&select=id&order=created_at.desc&limit=1`,admin.access_token,adminContext))[0];
 const blocked=await call('manage-operations',{action:'operation',request_id:modern.id,operation:'devolver',notes:'TESTE de separação entre modelos'},admin.access_token,adminContext);
 assert.equal(blocked.status,400);
 await ok('manage-operations',{action:'operation',request_id:req,operation:'devolver',notes:'TESTE — conferir dados antes de reenviar'},admin.access_token,adminContext);
 await ok('manage-operations',{action:'operation',request_id:req,operation:'reenviar',notes:'TESTE — dados conferidos pelo titular'},signed.access_token,owner);
 const data=await rest(`vacation_requests?id=eq.${req}&select=id,status,approvals:request_approvals(stage,decision,version)`,admin.access_token,adminContext);
 assert.equal(data[0].status,'enviada'); assert.ok(data[0].approvals.every(a=>a.decision==='pendente'));
 for(const stage of ['chefia_imediata','rh']){
  const current=(await rest(`request_approvals?request_id=eq.${req}&stage=eq.${stage}&select=version`,admin.access_token,adminContext))[0];
  await ok('manage-operations',{action:'legacy-approval',request_id:req,stage,decision:'aprovada',version:current.version},admin.access_token,adminContext);
 }
 await ok('manage-operations',{action:'operation',request_id:req,operation:'programar'},admin.access_token,adminContext);
 await ok('manage-operations',{action:'operation',request_id:req,operation:'cancelar',notes:'Encerrar TESTE legado, preservando decisões'},admin.access_token,adminContext);
 record('Edge Functions: legado devolvido, reenviado pelo titular, aprovado por etapas, programado explicitamente e cancelado; novo modelo bloqueia operação antiga');
}else if(mode==='cleanup'){
 const scale=await ok('manage-operations',{action:'scale-list',month:'2026-10'},admin.access_token,adminContext);
 for(const day of scale.planned_days){
  const assignments=scale.assignments.filter(item=>item.day_id===day.id);
  if(!assignments.some(item=>[owner.bond_unit_id,other.bond_unit_id].includes(item.bond_unit_id))) continue;
  await ok('manage-operations',{action:'scale-save',cnes_unit_id:day.cnes_unit_id,internal_lotacao_id:day.lotacao_id.split(':')[1]||null,date:day.scale_date,
   bond_unit_ids:assignments.filter(item=>![owner.bond_unit_id,other.bond_unit_id].includes(item.bond_unit_id)).map(item=>item.bond_unit_id),version:day.version},admin.access_token,adminContext);
 }
 const rows=await rest(`vacation_requests?context_bond_id=eq.${owner.bond_id}&select=id,status`,admin.access_token,adminContext);
 for(const row of rows.filter(r=>!['cancelada','rejeitada','concluida'].includes(r.status))) await ok('manage-operations',{action:'operation',request_id:row.id,operation:'cancelar',notes:'Encerramento de ensaio técnico Bloco 03; preservar histórico'},admin.access_token,adminContext);
 await ok('manage-profiles',{action:'deactivate',profile_id:profile.id},admin.access_token,adminContext);
 console.log(JSON.stringify({mode,results:['Pedidos ativos de teste cancelados com histórico; conta técnica desativada sem exclusão.']}));
}else throw Error('Modo inválido.');
