/* SGF — aplicação estática sem build. Dependências externas são fixadas no index.html. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ijhvbzomakbbxverqfqh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_9upWl4mCzsfuaPE1_gOFkw_9Im-Y4sJ';
  const RULE_START = '2025-12-02';
  const HOLIDAYS = new Set([
    '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-04-03','2026-04-21','2026-05-01',
    '2026-06-04','2026-07-16','2026-09-07','2026-10-12','2026-10-28','2026-11-02','2026-11-15',
    '2026-11-20','2026-12-24','2026-12-25','2026-12-31'
  ]);
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  const app = document.querySelector('#app');
  const progress = document.querySelector('#progress');
  const toast = document.querySelector('#toast');
  const sessionAction = document.querySelector('#session-action');
  const state = {
    route: 'home', resumeRoute: null, session: null, profile: null, requests: [], selected: null,
    request: {
      type: '', name: '', cpf: '', birthDate: '', registration: '', admissionDate: '', employmentType: '',
      position: '', functionName: '', unit: '', acquisitionEnd: '', unjustifiedAbsences: 'no',
      mode: 'start', chosenDate: '', startDate: '', returnDate: '', secondStartDate: '', split: 'none',
      availableHours: '', dailyHours: '8', addBankHours: '', notes: '', periods: []
    }
  };

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const digits = value => String(value || '').replace(/\D/g, '');
  const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const dateFrom = value => { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d,12); };
  const addDays = (date, amount) => { const d = new Date(date); d.setDate(d.getDate()+amount); return d; };
  const formatDate = value => value ? new Intl.DateTimeFormat('pt-BR').format(typeof value === 'string' ? dateFrom(value) : value) : '—';
  const formatDayMonth = value => value ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(dateFrom(value)) : '—';
  const labelType = type => ({regulamentar:'Férias regulamentares',premio:'Férias-prêmio',banco_horas:'Folga — banco de horas'})[type] || type;
  const labelStatus = status => ({rascunho:'Rascunho',enviada:'Enviada',em_analise:'Em análise',aprovada:'Aprovada',rejeitada:'Rejeitada',programada:'Programada',reprogramada:'Reprogramada',cancelada:'Cancelada',concluida:'Concluída'})[status] || status;
  const isBirthdayDayOff = date => {
    if (!state.request.birthDate) return false;
    const birth = dateFrom(state.request.birthDate);
    return date.getMonth() === birth.getMonth() && date.getDate() === birth.getDate();
  };
  const isBusiness = date => ![0,6].includes(date.getDay()) && !HOLIDAYS.has(iso(date)) && !isBirthdayDayOff(date);
  const nextBusiness = date => { let d = new Date(date); while (!isBusiness(d)) d=addDays(d,1); return d; };
  const addBusinessInclusive = (start, count) => { let d=new Date(start), used=0; while(used<count){if(isBusiness(d)) used++; if(used<count)d=addDays(d,1);} return d; };
  const subtractBusinessForStart = (returnDate, count) => { let d=addDays(returnDate,-1), used=0; while(used<count){if(isBusiness(d)) used++; if(used<count)d=addDays(d,-1);} return d; };
  const showToast = message => { toast.textContent=message; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),3200); };
  const setProgress = value => progress.style.setProperty('--progress', `${value}%`);
  const go = route => {
    if(route==='home' && ['types','identity','rules','dates','confirm'].includes(state.route)) state.resumeRoute=state.route;
    state.route=route;window.scrollTo({top:0,behavior:'smooth'});render();
  };

  function validCPF(value) {
    const cpf=digits(value); if(cpf.length!==11 || /^(\d)\1+$/.test(cpf)) return false;
    const digit = length => { let sum=0; for(let i=0;i<length;i++) sum+=Number(cpf[i])*(length+1-i); const mod=(sum*10)%11; return mod===10?0:mod; };
    return digit(9)===Number(cpf[9]) && digit(10)===Number(cpf[10]);
  }
  function formatCPF(value) { const v=digits(value).slice(0,11); return v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'); }
  function field(label,id,type='text',required=true,hint='',attrs='') {
    const value=state.request[id] ?? '';
    return `<div class="field"><label for="${id}">${label}${required?' *':''}</label><input class="control" id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${required?'required':''} ${attrs}>${hint?`<small>${hint}</small>`:''}</div>`;
  }
  function selectField(label,id,options,hint='') {
    return `<div class="field"><label for="${id}">${label} *</label><select class="control" id="${id}" name="${id}" required><option value="">Selecione</option>${options.map(([v,t])=>`<option value="${v}" ${state.request[id]===v?'selected':''}>${t}</option>`).join('')}</select>${hint?`<small>${hint}</small>`:''}</div>`;
  }
  function shell(title,lead,content,step=0) {
    setProgress(step); return `<section class="card"><p class="eyebrow">Prefeitura Municipal de Betim</p><h2>${title}</h2>${lead?`<p class="lead">${lead}</p>`:''}${content}</section>`;
  }

  function renderHome() {
    setProgress(0);
    app.innerHTML=`<section class="card hero"><div><p class="eyebrow">Sistema auxiliar de RH</p><h1>Solicitações claras, seguras e rastreáveis.</h1><p class="lead">Simule férias e folgas, envie seu pedido e gere o comprovante. Chefias e RH acompanham cada etapa em ambiente restrito.</p><div class="notice"><strong>Atenção:</strong> a simulação e o comprovante não representam autorização. O afastamento só ocorre após decisão administrativa.</div></div><div class="choice-grid">${state.resumeRoute?`<button class="choice" data-resume><strong>Continuar solicitação</strong><span>Retome do ponto em que parou, sem perder os dados preenchidos.</span></button>`:''}<button class="choice" data-go="types"><strong>Fazer solicitação</strong><span>Acesso sem senha, com verificação dos dados funcionais.</span></button><button class="choice" data-go="login"><strong>Área de gerenciamento</strong><span>Acesso autenticado para chefias, RH e administradores.</span></button></div></section>`;
  }
  function renderTypes() {
    app.innerHTML=shell('O que você deseja solicitar?','Escolha a modalidade. As regras e os cálculos serão ajustados automaticamente.',`<div class="choice-grid">
      <button class="choice" data-type="regulamentar"><strong>Férias regulamentares</strong><span>25 dias úteis no novo regime, 16 dias úteis quando aplicável ou 30 dias corridos no regime anterior.</span></button>
      <button class="choice" data-type="premio"><strong>Férias-prêmio</strong><span>Solicitação de 30, 60 ou 90 dias, sujeita à confirmação do direito.</span></button>
      <button class="choice" data-type="banco_horas"><strong>Folga — banco de horas</strong><span>Converta o saldo declarado em dias conforme sua jornada diária.</span></button>
    </div><div class="actions"><button class="button button-secondary" data-go="home">Voltar</button></div>`,12);
  }
  function renderIdentity() {
    app.innerHTML=shell('Identificação do servidor','Os dados são usados exclusivamente para verificar o cadastro funcional e registrar a solicitação.',`<form id="identity-form" class="form-grid" novalidate>
      ${field('Nome completo','name')}${field('CPF','cpf','text',true,'Somente o CPF vinculado ao cadastro funcional.','inputmode="numeric" maxlength="14" autocomplete="off"')}
      ${field('Data de nascimento','birthDate','date')}${field('Matrícula','registration')}
      ${field('Data de admissão','admissionDate','date')}${selectField('Vínculo','employmentType',[['efetivo','Servidor efetivo'],['comissionado','Comissionado sem vínculo efetivo'],['contratado','Contratado'],['funcao_publica','Função pública']])}
      ${field('Cargo','position')}${field('Função/atividade','functionName')}${field('Lotação','unit','text',true,'Informe a unidade/setor onde está lotado.')}
      <div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="types">Voltar</button><button class="button button-primary" type="submit">Continuar</button></div></div>
    </form>`,25);
  }
  function renderRules() {
    const r=state.request, regular=r.type==='regulamentar', bank=r.type==='banco_horas';
    const regularFields=regular?`${field('Término do período aquisitivo','acquisitionEnd','date')}<div class="field"><label for="unjustifiedAbsences">Mais de 9 faltas injustificadas?</label><select class="control" id="unjustifiedAbsences"><option value="no" ${r.unjustifiedAbsences==='no'?'selected':''}>Não</option><option value="yes" ${r.unjustifiedAbsences==='yes'?'selected':''}>Sim</option></select></div><div class="field"><label for="split">Fracionamento</label><select class="control" id="split"><option value="none">Sem fracionamento</option><option value="15-10" ${r.split==='15-10'?'selected':''}>15 + 10 dias úteis</option><option value="10-15" ${r.split==='10-15'?'selected':''}>10 + 15 dias úteis</option></select><small>Disponível apenas quando a regra e o vínculo permitirem.</small></div>${field('Horas do banco para acrescentar','addBankHours','number',false,'Saldo declaratório, sujeito à validação do RH.','min="0" step="0.5"')}`:'';
    const bankFields=bank?`${field('Saldo disponível em horas','availableHours','number',true,'O RH validará o saldo informado.','min="0.5" step="0.5"')}${field('Jornada diária em horas','dailyHours','number',true,'Ex.: 8 horas por dia.','min="1" max="24" step="0.5"')}`:'';
    const prize=r.type==='premio'?`<div class="field"><label for="prizeDays">Quantidade de dias</label><select class="control" id="prizeDays"><option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option></select></div>`:'';
    app.innerHTML=shell('Regras da solicitação',labelType(r.type),`<form id="rules-form" class="form-grid">${regularFields}${bankFields}${prize}<div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="identity">Voltar</button><button class="button button-primary" type="submit">Definir datas</button></div></div></form>`,42);
  }
  function ruleSummary() {
    const r=state.request;
    if(r.type==='banco_horas'){const hours=Number(r.availableHours),daily=Number(r.dailyHours);return {days:Math.floor(hours/daily),unit:'uteis',text:`${Math.floor(hours/daily)} dia(s) útil(eis), usando ${Math.floor(hours/daily)*daily}h`};}
    if(r.type==='premio'){const days=Number(r.prizeDays||30);return {days,unit:'corridos',text:`${days} dias corridos`};}
    const isNew=(r.admissionDate&&r.admissionDate>=RULE_START)||(r.acquisitionEnd&&r.acquisitionEnd>=RULE_START);
    if(!isNew)return {days:30,unit:'corridos',text:'30 dias corridos — regime anterior'};
    if(r.unjustifiedAbsences==='yes')return {days:16,unit:'uteis',text:'16 dias úteis — redução por faltas'};
    const extra=Math.floor(Number(r.addBankHours||0)/Number(r.dailyHours||8));
    return {days:25+extra,baseDays:25,extra,unit:'uteis',text:`25 dias úteis${extra?` + ${extra} dia(s) de banco de horas`:''}`};
  }
  function renderDates() {
    const r=state.request, rule=ruleSummary();
    const splitAllowed=r.type==='regulamentar'&&r.employmentType==='efetivo'&&r.unjustifiedAbsences==='no'&&rule.unit==='uteis'&&r.split!=='none'&&!rule.extra;
    app.innerHTML=shell('Escolha como deseja simular',`Regra calculada: ${rule.text}.`,`<form id="dates-form" class="form-grid">
      <div class="field"><label for="mode">Calcular a partir de</label><select id="mode" class="control"><option value="start" ${r.mode==='start'?'selected':''}>Data de início</option><option value="return" ${r.mode==='return'?'selected':''}>Data de retorno</option></select></div>
      ${field('Data escolhida','chosenDate','date',true,'Respeite a antecedência administrativa mínima.')}
      ${splitAllowed?field('Início do segundo período','secondStartDate','date',true,'O segundo período deve iniciar após o primeiro.'):''}
      <div class="field field-full"><div class="notice"><strong>Day-off de aniversário:</strong> ${formatDayMonth(r.birthDate)} de cada ano. Essa data é marcada no calendário e não consome férias nem banco de horas quando estiver dentro do período calculado em dias úteis.</div><div class="notice notice-warning">Feriados e pontos facultativos cadastrados também são desconsiderados nos cálculos em dias úteis. O calendário oficial deve ser revisado anualmente pelo RH.</div><div class="actions"><button type="button" class="button button-secondary" data-go="rules">Voltar</button><button class="button button-primary" type="submit">Simular período</button></div></div>
    </form>`,58);
  }
  function makePeriod(start,days,unit,sequence=1) {
    const end=unit==='uteis'?addBusinessInclusive(start,days):addDays(start,days-1);
    return {sequence,start_date:iso(start),end_date:iso(end),return_date:iso(nextBusiness(addDays(end,1))),days};
  }
  function calculatePeriods(chosen) {
    const r=state.request,rule=ruleSummary(),unit=rule.unit;
    const splitAllowed=r.type==='regulamentar'&&r.employmentType==='efetivo'&&r.unjustifiedAbsences==='no'&&r.split!=='none'&&!rule.extra;
    let start;
    if(r.mode==='start') start=dateFrom(chosen); else {const ret=dateFrom(chosen); start=unit==='uteis'?subtractBusinessForStart(ret,splitAllowed?Number(r.split.split('-')[0]):rule.days):addDays(ret,-(rule.days));}
    const firstDays=splitAllowed?Number(r.split.split('-')[0]):rule.days;
    const periods=[makePeriod(start,firstDays,unit,1)];
    if(splitAllowed){const secondStart=dateFrom(r.secondStartDate); if(secondStart<=dateFrom(periods[0].end_date)) throw new Error('O segundo período deve começar após o término do primeiro.'); periods.push(makePeriod(secondStart,Number(r.split.split('-')[1]),unit,2));}
    return periods;
  }
  function dayOffsInside(periods) {
    if (!state.request.birthDate) return [];
    const birth=dateFrom(state.request.birthDate), found=[];
    for (const period of periods) {
      const start=dateFrom(period.start_date), end=dateFrom(period.end_date);
      for (let year=start.getFullYear(); year<=end.getFullYear(); year++) {
        const day=new Date(year,birth.getMonth(),birth.getDate(),12);
        if(day>=start&&day<=end&&!found.includes(iso(day))) found.push(iso(day));
      }
    }
    return found;
  }
  function renderCalendar(periods) {
    if (!periods.length) return '';
    const first=dateFrom(periods[0].start_date), last=dateFrom(periods[periods.length-1].return_date), months=[];
    for(let cursor=new Date(first.getFullYear(),first.getMonth(),1,12);cursor<=last;cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1,12)) months.push(new Date(cursor));
    const dayOffs=new Set(dayOffsInside(periods)),periodDates=new Set(),starts=new Set(),ends=new Set(),returns=new Set();
    periods.forEach(period=>{
      starts.add(period.start_date);ends.add(period.end_date);returns.add(period.return_date);
      for(let day=dateFrom(period.start_date),end=dateFrom(period.end_date);day<=end;day=addDays(day,1)) periodDates.add(iso(day));
    });
    const week=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    const calendars=months.map(month=>{
      const offset=(month.getDay()+6)%7,total=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
      const cells=Array.from({length:offset},()=>'<span class="calendar-day is-empty" aria-hidden="true"></span>');
      for(let number=1;number<=total;number++){
        const date=new Date(month.getFullYear(),month.getMonth(),number,12),key=iso(date),classes=['calendar-day'],labels=[];
        if(periodDates.has(key)){classes.push('is-period');labels.push('período de afastamento');}
        if(starts.has(key)){classes.push('is-start');labels.push('início');}
        if(ends.has(key)){classes.push('is-end');labels.push('término');}
        if(returns.has(key)){classes.push('is-return');labels.push('retorno');}
        if(HOLIDAYS.has(key)){classes.push('is-holiday');labels.push('feriado ou ponto facultativo');}
        if(dayOffs.has(key)){classes.push('is-dayoff');labels.push('day-off de aniversário');}
        if([0,6].includes(date.getDay())) classes.push('is-weekend');
        cells.push(`<span class="${classes.join(' ')}" title="${esc(labels.join(', '))}" aria-label="${number} de ${new Intl.DateTimeFormat('pt-BR',{month:'long'}).format(month)}${labels.length?`, ${labels.join(', ')}`:''}"><b>${number}</b></span>`);
      }
      return `<section class="calendar-month"><h4>${new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(month)}</h4><div class="calendar-week">${week.map(day=>`<span>${day}</span>`).join('')}</div><div class="calendar-days">${cells.join('')}</div></section>`;
    }).join('');
    return `<section class="calendar-preview" aria-labelledby="calendar-title"><div class="calendar-heading"><div><p class="eyebrow">Visualização do período</p><h3 id="calendar-title">Calendário da solicitação</h3></div><div class="calendar-legend"><span class="legend-start">Início</span><span class="legend-period">Período</span><span class="legend-end">Término</span><span class="legend-return">Retorno</span><span class="legend-holiday">Feriado</span><span class="legend-dayoff">Day-off</span></div></div><div class="calendar-months">${calendars}</div></section>`;
  }
  function renderConfirm() {
    const r=state.request,rule=ruleSummary();
    app.innerHTML=shell('Revise antes de enviar','Confira principalmente os dados funcionais e as datas.',`<div class="summary">
      ${[['Servidor',r.name],['Matrícula',r.registration],['Modalidade',labelType(r.type)],['Regra',rule.text],['Lotação',r.unit]].map(([a,b])=>`<div class="summary-row"><span>${a}</span><strong>${esc(b)}</strong></div>`).join('')}
      ${r.periods.map((p,i)=>`<div class="summary-row"><span>${r.periods.length>1?`${i+1}º período`:'Período'}</span><strong>${formatDate(p.start_date)} a ${formatDate(p.end_date)} — retorno ${formatDate(p.return_date)}</strong></div>`).join('')}
      ${dayOffsInside(r.periods).map(day=>`<div class="summary-row"><span>Day-off de aniversário</span><strong>${formatDate(day)} — não consome saldo</strong></div>`).join('')}
    </div>${renderCalendar(r.periods)}<div class="field"><label for="notes">Observações</label><textarea class="control" id="notes" rows="3">${esc(r.notes)}</textarea></div><div class="notice">Ao enviar, você declara que os dados informados são verdadeiros. Se seu cadastro ainda não existir, esta solicitação abrirá automaticamente uma pendência de inclusão funcional para o RH, sem impedir o protocolo.</div><div class="actions"><button class="button button-secondary" data-go="dates">Voltar</button><button class="button button-primary" data-action="submit-request">Enviar solicitação</button></div>`,76);
  }
  async function submitRequest(){
    const btn=document.querySelector('[data-action="submit-request"]');btn.disabled=true;btn.textContent='Enviando…';state.request.notes=document.querySelector('#notes')?.value.trim()||'';
    try{
      const response=await fetch(`${SUPABASE_URL}/functions/v1/submit-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify(state.request)});
      const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Não foi possível enviar a solicitação.');
      state.request.protocol=body.protocol;state.request.requestId=body.id;state.request.inclusionPending=Boolean(body.inclusion_pending);go('receipt');
    }catch(error){showToast(error.message);btn.disabled=false;btn.textContent='Enviar solicitação';}
  }
  function renderReceipt(){
    const r=state.request;setProgress(100);app.innerHTML=`<section class="card"><div class="receipt"><div class="receipt-head"><img src="logo.png" alt="Prefeitura de Betim"><div><strong>COMPROVANTE DE SOLICITAÇÃO</strong><br><small>Protocolo ${esc(r.protocol||'simulação não enviada')}</small></div></div><h2>${labelType(r.type)}</h2><p>Registramos a solicitação de <strong>${esc(r.name)}</strong>, matrícula <strong>${esc(r.registration)}</strong>, lotado(a) em <strong>${esc(r.unit)}</strong>.</p><div class="summary">${r.periods.map((p,i)=>`<div class="summary-row"><span>${r.periods.length>1?`${i+1}º período`:'Período solicitado'}</span><strong>${formatDate(p.start_date)} a ${formatDate(p.end_date)}<br>Retorno: ${formatDate(p.return_date)}</strong></div>`).join('')}${dayOffsInside(r.periods).map(day=>`<div class="summary-row"><span>Day-off de aniversário</span><strong>${formatDate(day)} — não consome saldo</strong></div>`).join('')}</div><p><strong>Situação:</strong> Enviada para análise administrativa.</p>${r.inclusionPending?'<p class="notice"><strong>Inclusão funcional pendente:</strong> o RH recebeu seus dados para conferência junto com esta solicitação. O protocolo de férias já está registrado.</p>':''}<p class="lead">Este documento comprova o protocolo do pedido e não autoriza o afastamento. A decisão será registrada pela chefia imediata e pelo RH.</p><div class="signature-grid"><div class="signature">Servidor(a) solicitante</div><div class="signature">Recebido por / carimbo</div></div><small>Emitido em ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeStyle:'short'}).format(new Date())}</small></div><div class="actions no-print"><button class="button button-primary" onclick="window.print()">Imprimir / salvar em PDF</button><button class="button button-secondary" data-action="restart">Nova solicitação</button></div></section>`;
  }
  function renderLogin(){
    setProgress(0);app.innerHTML=shell('Área de gerenciamento','Acesso provisório para configuração inicial do SGF.',`<form id="login-form" class="form-grid"><div class="field field-full"><label for="password">Senha provisória</label><input class="control" id="password" type="password" required autocomplete="current-password" autofocus></div><div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="home">Voltar</button><button class="button button-primary">Entrar</button></div></div></form><div class="notice notice-warning">Use a senha provisória fornecida para o piloto. Ela é validada pelo Supabase Auth e não está gravada no código do navegador.</div>`);
  }
  async function login(event){
    event.preventDefault();
    const button=event.submitter, password=document.querySelector('#password').value;
    if(button){button.disabled=true;button.textContent='Entrando…';}
    try{
      const response=await fetch(`${SUPABASE_URL}/functions/v1/provisional-login`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify({password})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(body.error||'Senha provisória inválida.');
      const {error}=await client.auth.setSession({access_token:body.access_token,refresh_token:body.refresh_token});
      if(error) throw error;
      await loadSession();go('dashboard');
    }catch(error){showToast(error.message);if(button){button.disabled=false;button.textContent='Entrar';}}
  }
  async function loadSession(){if(!client)return;const {data}=await client.auth.getSession();state.session=data.session;if(!state.session)return;const {data:profile}=await client.from('profiles').select('id,full_name,role').eq('id',state.session.user.id).single();state.profile=profile;sessionAction.classList.remove('hidden');}
  async function loadRequests(){const {data,error}=await client.from('vacation_requests').select('id,protocol,type,status,start_date,end_date,return_date,created_at,notes,servidor:servidores(id,full_name,matricula,lotacao:lotacoes(name)),periods:request_periods(*)').order('created_at',{ascending:false});if(error)throw error;state.requests=data||[];}
  async function renderDashboard(){
    setProgress(0);if(!state.session){await loadSession();if(!state.session)return go('login');}app.innerHTML='<section class="card loading-card"><div class="spinner"></div><p>Carregando solicitações…</p></section>';
    try{await loadRequests();}catch(error){app.innerHTML=shell('Acesso não autorizado','Seu usuário não possui perfil ou escopo administrativo configurado.',`<div class="notice notice-danger">${esc(error.message)}</div>`);return;}
    const counts=status=>state.requests.filter(r=>r.status===status).length;
    app.innerHTML=`<section class="card"><div class="toolbar"><div><p class="eyebrow">Painel administrativo</p><h2>Solicitações</h2><p class="lead">${esc(state.profile?.full_name||state.session.user.email)} · ${esc(state.profile?.role||'perfil não configurado')}</p></div><button class="button button-secondary" data-action="refresh">Atualizar</button></div><div class="stats"><div class="stat"><strong>${state.requests.length}</strong><span>Total no seu escopo</span></div><div class="stat"><strong>${counts('enviada')+counts('em_analise')}</strong><span>Pendentes</span></div><div class="stat"><strong>${counts('aprovada')+counts('programada')}</strong><span>Aprovadas/programadas</span></div></div><div class="table-wrap" style="margin-top:1.5rem"><table><thead><tr><th>Protocolo</th><th>Servidor</th><th>Tipo</th><th>Período</th><th>Status</th><th></th></tr></thead><tbody>${state.requests.map(r=>`<tr><td>${esc(r.protocol||r.id.slice(0,8))}</td><td><strong>${esc(r.servidor?.full_name||'Sem nome')}</strong><br>${esc(r.servidor?.matricula||'')}</td><td>${labelType(r.type)}</td><td>${formatDate(r.start_date)} a ${formatDate(r.end_date)}</td><td><span class="badge badge-${r.status}">${labelStatus(r.status)}</span></td><td><button class="button button-secondary" data-request="${r.id}">Analisar</button></td></tr>`).join('')||'<tr><td colspan="6">Nenhuma solicitação no seu escopo.</td></tr>'}</tbody></table></div></section>`;
  }
  function renderDetail(){
    const r=state.selected;if(!r)return go('dashboard');const staff=state.profile?.role;
    app.innerHTML=shell(`Solicitação ${esc(r.protocol||r.id.slice(0,8))}`,`${esc(r.servidor?.full_name||'Servidor')} · ${labelType(r.type)}`,`<div class="summary"><div class="summary-row"><span>Status</span><strong>${labelStatus(r.status)}</strong></div><div class="summary-row"><span>Lotação</span><strong>${esc(r.servidor?.lotacao?.name||'—')}</strong></div>${(r.periods||[]).map((p,i)=>`<div class="summary-row"><span>${i+1}º período</span><strong>${formatDate(p.start_date)} a ${formatDate(p.end_date)} — retorno ${formatDate(p.return_date)}</strong></div>`).join('')}</div><div class="field"><label for="decision-notes">Parecer/justificativa</label><textarea class="control" id="decision-notes" rows="4"></textarea></div><div class="actions"><button class="button button-secondary" data-go="dashboard">Voltar</button><button class="button button-secondary" data-status="em_analise">Colocar em análise</button><button class="button button-primary" data-status="aprovada">Aprovar</button><button class="button button-danger" data-status="rejeitada">Rejeitar</button>${staff==='rh'||staff==='administrador'?'<button class="button button-primary" data-status="programada">Programar</button>':''}</div>`);
  }
  async function updateStatus(status){const notes=document.querySelector('#decision-notes').value.trim();if(status==='rejeitada'&&!notes)return showToast('Informe a justificativa da rejeição.');const {error}=await client.from('vacation_requests').update({status,notes:notes||state.selected.notes}).eq('id',state.selected.id);if(error)return showToast(error.message);showToast('Situação atualizada.');await renderDashboard();state.route='dashboard';}
  function render(){sessionAction.classList.toggle('hidden',!state.session);({home:renderHome,types:renderTypes,identity:renderIdentity,rules:renderRules,dates:renderDates,confirm:renderConfirm,receipt:renderReceipt,login:renderLogin,dashboard:renderDashboard,detail:renderDetail}[state.route]||renderHome)();app.focus({preventScroll:true});}

  document.addEventListener('click',async event=>{
    if(event.target.closest('[data-resume]')){go(state.resumeRoute||'types');return;}
    const goButton=event.target.closest('[data-go]');if(goButton){go(goButton.dataset.go);return;}
    const typeButton=event.target.closest('[data-type]');if(typeButton){state.request.type=typeButton.dataset.type;go('identity');return;}
    const requestButton=event.target.closest('[data-request]');if(requestButton){state.selected=state.requests.find(r=>r.id===requestButton.dataset.request);go('detail');return;}
    const statusButton=event.target.closest('[data-status]');if(statusButton){await updateStatus(statusButton.dataset.status);return;}
    const action=event.target.closest('[data-action]')?.dataset.action;if(action==='submit-request')await submitRequest();if(action==='restart'){location.reload();}if(action==='refresh')await renderDashboard();
  });
  document.addEventListener('submit',async event=>{
    if(event.target.id==='login-form')return login(event);event.preventDefault();
    if(event.target.id==='identity-form'){
      const ids=['name','cpf','birthDate','registration','admissionDate','employmentType','position','functionName','unit'];ids.forEach(id=>state.request[id]=document.querySelector(`#${id}`).value.trim());state.request.cpf=formatCPF(state.request.cpf);
      if(!validCPF(state.request.cpf))return showToast('Informe um CPF válido.');if(state.request.admissionDate<state.request.birthDate)return showToast('A admissão não pode ser anterior ao nascimento.');go('rules');
    } else if(event.target.id==='rules-form'){
      ['acquisitionEnd','unjustifiedAbsences','split','availableHours','dailyHours','addBankHours','prizeDays'].forEach(id=>{const el=document.querySelector(`#${id}`);if(el)state.request[id]=el.value;});
      if(state.request.type==='banco_horas'&&ruleSummary().days<1)return showToast('O saldo não corresponde a um dia completo da jornada informada.');if(state.request.split!=='none'&&state.request.employmentType!=='efetivo')state.request.split='none';go('dates');
    } else if(event.target.id==='dates-form'){
      state.request.mode=document.querySelector('#mode').value;const chosen=document.querySelector('#chosenDate').value;state.request.chosenDate=chosen;state.request.secondStartDate=document.querySelector('#secondStartDate')?.value||'';try{state.request.periods=calculatePeriods(chosen);state.request.startDate=state.request.periods[0].start_date;state.request.returnDate=state.request.periods.at(-1).return_date;go('confirm');}catch(error){showToast(error.message);}
    }
  });
  document.addEventListener('input',event=>{
    const el=event.target;
    if(el.id==='cpf')el.value=formatCPF(el.value);
    if(el.id && !['password','email','decision-notes'].includes(el.id)) state.request[el.id]=el.value;
    if(el.matches('.control')){el.classList.toggle('valid',el.checkValidity()&&!!el.value);el.classList.toggle('invalid',!el.checkValidity());}
  });
  sessionAction.addEventListener('click',async()=>{await client?.auth.signOut();state.session=null;state.profile=null;go('home');});
  loadSession().finally(()=>render());
})();
