/* SGF — aplicação estática sem build. Dependências externas são fixadas no index.html. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ijhvbzomakbbxverqfqh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_9upWl4mCzsfuaPE1_gOFkw_9Im-Y4sJ';
  const RULE_START = '2025-12-02';
  const HOLIDAYS = new Set([
    '2026-09-07',
    '2026-10-12','2026-10-30',
    '2026-11-02','2026-11-15', '2026-11-20',
    '2026-12-24','2026-12-25','2026-12-31'
  ]);
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  const app = document.querySelector('#app');
  const progress = document.querySelector('#progress');
  const toast = document.querySelector('#toast');
  const sessionAction = document.querySelector('#session-action');
  const state = {
    route: 'home', session: null, profile: null, requests: [], inclusions: [], locations: [], profiles: [], profileLocations: [], selected: null,
    dashboard: { query: '', status: '', type: '', sort: 'newest', page: 1, pageSize: 10 },
    request: {
      type: '', name: '', cpf: '', birthDate: '', registration: '', admissionDate: '', employmentType: '',
      position: '', functionName: '', unit: '', acquisitionEnd: '', unjustifiedAbsences: 'no',
      mode: 'start', startDate: '', returnDate: '', secondStartDate: '', split: 'none',
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
  const go = route => { state.route=route; window.scrollTo({top:0,behavior:'smooth'}); render(); };

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
    const employee=state.profile?.role==='servidor',staff=state.profile&&state.profile.role!=='servidor';
    const choices=employee
      ? `<button class="choice" data-action="employee-new-request"><strong>Nova solicitação</strong><span>Inicie o pedido com seus dados funcionais preenchidos.</span></button><button class="choice" data-go="employee-dashboard"><strong>Meus pedidos</strong><span>Acompanhe protocolos, períodos e situação.</span></button>`
      : staff
        ? `<button class="choice" data-go="dashboard"><strong>Abrir gerenciamento</strong><span>Acompanhe as solicitações do seu escopo.</span></button>`
        : `<button class="choice" data-go="types"><strong>Fazer solicitação sem login</strong><span>Envie agora com a verificação dos dados funcionais.</span></button><button class="choice" data-go="employee-login"><strong>Área do servidor</strong><span>Entre com matrícula e senha para solicitar e acompanhar.</span></button><button class="choice" data-go="login"><strong>Área de gerenciamento</strong><span>Acesso para chefias, RH e administradores.</span></button>`;
    app.innerHTML=`<section class="card hero"><div><p class="eyebrow">Sistema auxiliar de RH</p><h1>Solicitações claras, seguras e rastreáveis.</h1><p class="lead">Simule férias e folgas, envie seu pedido e acompanhe cada etapa.</p><div class="notice"><strong>Atenção:</strong> a simulação e o comprovante não representam autorização. O afastamento só ocorre após decisão administrativa.</div></div><div class="choice-grid">${choices}</div></section>`;
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
    const bankFields=bank?`${field('Saldo disponível em horas:','availableHours','number',true,'O RH validará o saldo informado.','min="0.5" step="0.5"')}${field('Jornada diária em horas:','dailyHours','number',true,'Ex.: 8 horas por dia.','min="1" max="24" step="0.5"')}`:'';
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
  function renderConfirm() {
    const r=state.request,rule=ruleSummary();
    app.innerHTML=shell('Revise antes de enviar','Confira principalmente os dados funcionais e as datas.',`<div class="summary">
      ${[['Servidor',r.name],['Matrícula',r.registration],['Modalidade',labelType(r.type)],['Regra',rule.text],['Lotação',r.unit]].map(([a,b])=>`<div class="summary-row"><span>${a}</span><strong>${esc(b)}</strong></div>`).join('')}
      ${r.periods.map((p,i)=>`<div class="summary-row"><span>${r.periods.length>1?`${i+1}º período`:'Período'}</span><strong>${formatDate(p.start_date)} a ${formatDate(p.end_date)} — retorno ${formatDate(p.return_date)}</strong></div>`).join('')}
      ${dayOffsInside(r.periods).map(day=>`<div class="summary-row"><span>Day-off de aniversário</span><strong>${formatDate(day)} — não consome saldo</strong></div>`).join('')}
    </div><div class="field"><label for="notes">Observações</label><textarea class="control" id="notes" rows="3">${esc(r.notes)}</textarea></div><div class="notice">Ao enviar, você declara que os dados informados são verdadeiros e reconhece que o pedido depende da análise da chefia e do RH.</div><div class="actions"><button class="button button-secondary" data-go="dates">Voltar</button><button class="button button-primary" data-action="submit-request">Enviar solicitação</button></div>`,76);
  }
  async function submitRequest(){
    const btn=document.querySelector('[data-action="submit-request"]');btn.disabled=true;btn.textContent='Enviando…';state.request.notes=document.querySelector('#notes')?.value.trim()||'';
    try{
      const payload={...state.request,cpf:digits(state.request.cpf)};if(!(Number(payload.addBankHours)>0))payload.addBankHours=null;
      const response=await fetch(`${SUPABASE_URL}/functions/v1/submit-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify(payload)});
      const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Não foi possível enviar a solicitação.');
      state.request.protocol=body.protocol;state.request.requestId=body.id;state.request.inclusionPending=Boolean(body.inclusion_pending);go('receipt');
    }catch(error){showToast(error.message);btn.disabled=false;btn.textContent='Enviar solicitação';}
  }
  function renderReceipt(){
    const r=state.request;setProgress(100);app.innerHTML=`<section class="card"><div class="receipt"><div class="receipt-head"><img src="logo.png" alt="Prefeitura de Betim"><div><strong>COMPROVANTE DE SOLICITAÇÃO</strong><br><small>Protocolo ${esc(r.protocol||'simulação não enviada')}</small></div></div><h2>${labelType(r.type)}</h2><p>Registramos a solicitação de <strong>${esc(r.name)}</strong>, matrícula <strong>${esc(r.registration)}</strong>, lotado(a) em <strong>${esc(r.unit)}</strong>.</p><div class="summary">${r.periods.map((p,i)=>`<div class="summary-row"><span>${r.periods.length>1?`${i+1}º período`:'Período solicitado'}</span><strong>${formatDate(p.start_date)} a ${formatDate(p.end_date)}<br>Retorno: ${formatDate(p.return_date)}</strong></div>`).join('')}${dayOffsInside(r.periods).map(day=>`<div class="summary-row"><span>Day-off de aniversário</span><strong>${formatDate(day)} — não consome saldo</strong></div>`).join('')}</div><p><strong>Situação:</strong> Enviada para análise administrativa.</p>${r.inclusionPending?'<p class="notice"><strong>Inclusão funcional pendente:</strong> seus dados foram encaminhados ao RH junto com a solicitação.</p>':''}<p class="lead">Este documento comprova o protocolo do pedido e não autoriza o afastamento. A decisão será registrada pela chefia imediata e pelo RH.</p><div class="signature-grid"><div class="signature">Servidor(a) solicitante</div><div class="signature">Recebido por / carimbo</div></div><small>Emitido em ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeStyle:'short'}).format(new Date())}</small></div><div class="actions no-print"><button class="button button-primary" onclick="window.print()">Imprimir / salvar em PDF</button>${state.profile?.role==='servidor'?'<button class="button button-secondary" data-go="employee-dashboard">Meus pedidos</button>':''}<button class="button button-secondary" data-action="restart">Nova solicitação</button></div></section>`;
  }
  function renderEmployeeLogin(){
    setProgress(0);app.innerHTML=shell('Login do servidor','Entre com sua matrícula e senha.',`<form id="employee-login-form" class="form-grid"><div class="field"><label for="employee-registration">Matrícula</label><input class="control" id="employee-registration" required autocomplete="username" autofocus></div><div class="field"><label for="employee-password">Senha</label><input class="control" id="employee-password" type="password" required minlength="8" maxlength="72" autocomplete="current-password"></div><div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="home">Voltar</button><button class="button button-primary">Entrar</button><button type="button" class="button button-secondary" data-go="employee-register">Solicitar acesso</button><button type="button" class="button button-secondary" data-action="forgot-password">Esqueci a senha</button></div></div></form><div class="notice">Depois de entrar, você poderá solicitar férias e acompanhar somente os seus protocolos.</div>`);
  }
  function renderEmployeeRegister(){
    setProgress(0);app.innerHTML=shell('Solicitar acesso','Confirme seus dados, informe cargo e lotação e crie uma senha pessoal.',`<form id="employee-register-form" class="form-grid"><div class="field"><label for="employee-name">Nome completo</label><input class="control" id="employee-name" required autocomplete="name"></div><div class="field"><label for="employee-cpf">CPF</label><input class="control" id="employee-cpf" required inputmode="numeric" maxlength="14" autocomplete="off"></div><div class="field"><label for="employee-birth-date">Data de nascimento</label><input class="control" id="employee-birth-date" type="date" required></div><div class="field"><label for="employee-registration">Matrícula</label><input class="control" id="employee-registration" required autocomplete="username"></div><div class="field"><label for="employee-position">Cargo</label><input class="control" id="employee-position" required></div><div class="field"><label for="employee-unit">Lotação</label><input class="control" id="employee-unit" required></div><div class="field field-full"><label for="employee-password">Crie uma senha</label><input class="control" id="employee-password" type="password" required minlength="8" maxlength="72" autocomplete="new-password"><small>Use pelo menos 8 caracteres e não compartilhe sua senha.</small></div><div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="employee-login">Voltar</button><button class="button button-primary">Criar acesso de servidor</button></div></div></form>`);
  }
  async function employeeAuth(event,action){
    event.preventDefault();const button=event.submitter,payload={action,registration:document.querySelector('#employee-registration').value.trim(),password:document.querySelector('#employee-password').value};
    if(action==='register')Object.assign(payload,{name:document.querySelector('#employee-name').value.trim(),cpf:digits(document.querySelector('#employee-cpf').value),birthDate:document.querySelector('#employee-birth-date').value,position:document.querySelector('#employee-position').value.trim(),unit:document.querySelector('#employee-unit').value.trim()});
    if(action==='register'&&!validCPF(payload.cpf))return showToast('Informe um CPF válido.');if(button){button.disabled=true;button.textContent=action==='register'?'Criando acesso…':'Entrando…';}
    try{const response=await fetch(`${SUPABASE_URL}/functions/v1/employee-auth`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify(payload)});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Não foi possível concluir o acesso.');const {error}=await client.auth.setSession({access_token:body.access_token,refresh_token:body.refresh_token});if(error)throw error;await loadSession();go('employee-dashboard');}
    catch(error){showToast(error.message);if(button){button.disabled=false;button.textContent=action==='register'?'Criar acesso de servidor':'Entrar';}}
  }
  function renderLogin(){
    setProgress(0);app.innerHTML=shell('Área de gerenciamento','Acesso exclusivo de chefias, RH e administradores.',`<form id="login-form" class="form-grid"><div class="field field-full"><label for="management-identifier">Identificador</label><input class="control" id="management-identifier" required minlength="3" maxlength="40" autocomplete="username" autofocus></div><div class="field field-full"><label for="management-password">Senha</label><input class="control" id="management-password" type="password" required minlength="8" maxlength="72" autocomplete="current-password"></div><div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="home">Voltar</button><button class="button button-primary">Entrar</button></div></div></form><div class="notice">Use o identificador administrativo fornecido pelo responsável do sistema. No primeiro acesso será necessário criar uma nova senha.</div>`);
  }
  async function login(event){
    event.preventDefault();const button=event.submitter,identifier=document.querySelector('#management-identifier').value.trim(),password=document.querySelector('#management-password').value;button.disabled=true;button.textContent='Entrando…';
    try{const response=await fetch(`${SUPABASE_URL}/functions/v1/management-auth`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify({action:'login',identifier,password})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Credenciais inválidas ou acesso indisponível.');const {error}=await client.auth.setSession({access_token:body.access_token,refresh_token:body.refresh_token});if(error)throw error;await loadSession();go(body.must_change_password?'change-password':'dashboard');}
    catch(error){showToast(error.message);button.disabled=false;button.textContent='Entrar';}
  }
  function renderChangePassword(){
    if(!state.session||!state.profile||state.profile.role==='servidor')return go('login');
    setProgress(0);app.innerHTML=shell('Troque sua senha inicial','Antes de abrir o painel, defina uma senha pessoal para esta conta.',`<form id="change-password-form" class="form-grid"><div class="field"><label for="new-password">Nova senha</label><input class="control" id="new-password" type="password" required minlength="10" maxlength="72" autocomplete="new-password"><small>Use pelo menos 10 caracteres.</small></div><div class="field"><label for="confirm-password">Confirme a nova senha</label><input class="control" id="confirm-password" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></div><div class="field field-full"><div class="actions"><button class="button button-primary">Salvar nova senha</button></div></div></form><div class="notice notice-warning">O acesso ao gerenciamento será liberado somente depois desta alteração.</div>`);
  }
  async function changePassword(event){
    event.preventDefault();const button=event.submitter,password=document.querySelector('#new-password').value,confirmation=document.querySelector('#confirm-password').value;if(password!==confirmation)return showToast('As senhas informadas não coincidem.');button.disabled=true;button.textContent='Salvando…';
    try{const response=await fetch(`${SUPABASE_URL}/functions/v1/management-auth`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${state.session.access_token}`},body:JSON.stringify({action:'change-password',password})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Não foi possível alterar a senha.');await loadSession();showToast('Senha alterada com sucesso.');go('dashboard');}
    catch(error){showToast(error.message);button.disabled=false;button.textContent='Salvar nova senha';}
  }
  async function loadSession(){if(!client)return;const {data}=await client.auth.getSession();state.session=data.session;if(!state.session){state.profile=null;return;}const {data:profile}=await client.from('profiles').select('id,full_name,role,must_change_password').eq('id',state.session.user.id).single();state.profile=profile;sessionAction.classList.remove('hidden');}
  async function loadRequests(){const {data,error}=await client.from('vacation_requests').select('id,protocol,type,status,start_date,end_date,return_date,created_at,notes,servidor:servidores(id,full_name,matricula,lotacao:lotacoes(name)),periods:request_periods(*)').order('created_at',{ascending:false});if(error)throw error;state.requests=data||[];}
  async function prepareEmployeeRequest(){
    if(!state.session||state.profile?.role!=='servidor')return go('employee-login');
    const {data,error}=await client.from('servidores').select('full_name,cpf,birth_date,matricula,admission_date,employment_type,declared_position,declared_unit,lotacao:lotacoes(name),cargo:cargos(name),funcao:funcoes(name)').eq('profile_id',state.session.user.id).single();
    if(error)return showToast('Não foi possível carregar seus dados funcionais.');
    Object.assign(state.request,{name:data.full_name||'',cpf:formatCPF(data.cpf||''),birthDate:data.birth_date||'',registration:data.matricula||'',admissionDate:data.admission_date||'',employmentType:data.employment_type==='pendente'?'':data.employment_type||'',position:data.cargo?.name||data.declared_position||'',functionName:data.funcao?.name||'',unit:data.lotacao?.name||data.declared_unit||''});go('types');
  }
  async function renderEmployeeDashboard(){
    setProgress(0);if(!state.session){await loadSession();if(!state.session)return go('employee-login');}if(state.profile?.role!=='servidor')return go('dashboard');app.innerHTML='<section class="card loading-card"><div class="spinner"></div><p>Carregando seus pedidos…</p></section>';
    try{await loadRequests();}catch(error){app.innerHTML=shell('Não foi possível carregar seus pedidos','Tente novamente em alguns instantes.',`<div class="notice notice-danger">${esc(error.message)}</div>`);return;}
    const pending=state.requests.filter(r=>['enviada','em_analise'].includes(r.status)).length;
    app.innerHTML=`<section class="card"><div class="toolbar"><div><p class="eyebrow">Área do servidor</p><h2>Meus pedidos</h2><p class="lead">${esc(state.profile.full_name)}</p></div><div class="actions"><button class="button button-primary" data-action="employee-new-request">Nova solicitação</button><button class="button button-secondary" data-action="employee-refresh">Atualizar</button></div></div><div class="stats"><div class="stat"><strong>${state.requests.length}</strong><span>Total de protocolos</span></div><div class="stat"><strong>${pending}</strong><span>Em andamento</span></div><div class="stat"><strong>${state.requests.filter(r=>['aprovada','programada','concluida'].includes(r.status)).length}</strong><span>Aprovados/programados</span></div></div><div class="table-wrap" style="margin-top:1.5rem"><table><thead><tr><th>Protocolo</th><th>Modalidade</th><th>Período</th><th>Retorno</th><th>Situação</th><th></th></tr></thead><tbody>${state.requests.map(r=>`<tr><td>${esc(r.protocol||r.id.slice(0,8))}</td><td>${labelType(r.type)}</td><td>${formatDate(r.start_date)} a ${formatDate(r.end_date)}</td><td>${formatDate(r.return_date)}</td><td><span class="badge badge-${r.status}">${labelStatus(r.status)}</span></td><td><button class="button button-secondary" data-request="${r.id}">Ver detalhes</button></td></tr>`).join('')||'<tr><td colspan="6">Você ainda não possui solicitações.</td></tr>'}</tbody></table></div></section>`;
  }
  function renderEmployeeDetail(){
    const r=state.selected;if(!r)return go('employee-dashboard');app.innerHTML=shell(`Protocolo ${esc(r.protocol||r.id.slice(0,8))}`,labelType(r.type),`<div class="summary"><div class="summary-row"><span>Situação</span><strong><span class="badge badge-${r.status}">${labelStatus(r.status)}</span></strong></div><div class="summary-row"><span>Solicitado em</span><strong>${formatDate(r.created_at)}</strong></div>${(r.periods||[]).map((p,i)=>`<div class="summary-row"><span>${r.periods.length>1?`${i+1}º período`:'Período'}</span><strong>${formatDate(p.start_date)} a ${formatDate(p.end_date)} — retorno ${formatDate(p.return_date)}</strong></div>`).join('')}${r.notes?`<div class="summary-row"><span>Observações</span><strong>${esc(r.notes)}</strong></div>`:''}</div><div class="notice">Este acompanhamento é informativo. O afastamento depende da decisão administrativa competente.</div><div class="actions"><button class="button button-secondary" data-go="employee-dashboard">Voltar aos pedidos</button><button class="button button-primary" data-action="employee-new-request">Nova solicitação</button></div>`);
  }
  async function renderDashboard(){
    setProgress(0);if(!state.session){await loadSession();if(!state.session)return go('login');}if(state.profile?.role==='servidor')return go('employee-dashboard');if(state.profile?.must_change_password)return go('change-password');app.innerHTML='<section class="card loading-card"><div class="spinner"></div><p>Carregando solicitações…</p></section>';
    try{await loadRequests();}catch(error){app.innerHTML=shell('Acesso não autorizado','Seu usuário não possui perfil ou escopo administrativo configurado.',`<div class="notice notice-danger">${esc(error.message)}</div>`);return;}
    const counts=status=>state.requests.filter(r=>r.status===status).length,d=state.dashboard,term=d.query.trim().toLocaleLowerCase('pt-BR');
    const filtered=state.requests.filter(r=>{
      const searchable=[r.protocol,r.servidor?.full_name,r.servidor?.matricula,r.servidor?.lotacao?.name].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return (!term||searchable.includes(term))&&(!d.status||r.status===d.status)&&(!d.type||r.type===d.type);
    }).sort((a,b)=>d.sort==='oldest'?new Date(a.created_at)-new Date(b.created_at):d.sort==='name'?String(a.servidor?.full_name||'').localeCompare(String(b.servidor?.full_name||''),'pt-BR'):new Date(b.created_at)-new Date(a.created_at));
    const pages=Math.max(1,Math.ceil(filtered.length/d.pageSize));d.page=Math.min(Math.max(1,d.page),pages);const start=(d.page-1)*d.pageSize,rows=filtered.slice(start,start+d.pageSize);
    const statusOptions=['enviada','em_analise','aprovada','rejeitada','programada','reprogramada','cancelada','concluida'];
    app.innerHTML=`<section class="card"><div class="toolbar"><div><p class="eyebrow">Painel administrativo</p><h2>Solicitações</h2><p class="lead">${esc(state.profile?.full_name||state.session.user.email)} · ${esc(state.profile?.role||'perfil não configurado')}</p></div><div class="actions">${state.profile?.role==='administrador'?'<button class="button button-primary" data-go="profiles">Perfis e acessos</button>':''}${['administrador','rh'].includes(state.profile?.role)?'<button class="button button-primary" data-go="inclusions">Inclusões funcionais</button>':''}<button class="button button-secondary" data-action="refresh">Atualizar</button></div></div><div class="stats"><div class="stat"><strong>${state.requests.length}</strong><span>Total no seu escopo</span></div><div class="stat"><strong>${counts('enviada')+counts('em_analise')}</strong><span>Pendentes</span></div><div class="stat"><strong>${counts('aprovada')+counts('programada')}</strong><span>Aprovadas/programadas</span></div></div><form id="dashboard-filter-form" class="form-grid" style="margin-top:1.5rem"><div class="field field-full"><label for="dashboard-query">Buscar</label><input class="control" id="dashboard-query" value="${esc(d.query)}" placeholder="Protocolo, nome, matrícula ou lotação"></div><div class="field"><label for="dashboard-status">Situação</label><select class="control" id="dashboard-status"><option value="">Todas</option>${statusOptions.map(status=>`<option value="${status}" ${d.status===status?'selected':''}>${labelStatus(status)}</option>`).join('')}</select></div><div class="field"><label for="dashboard-type">Modalidade</label><select class="control" id="dashboard-type"><option value="">Todas</option>${['regulamentar','premio','banco_horas'].map(type=>`<option value="${type}" ${d.type===type?'selected':''}>${labelType(type)}</option>`).join('')}</select></div><div class="field"><label for="dashboard-sort">Ordenação</label><select class="control" id="dashboard-sort"><option value="newest" ${d.sort==='newest'?'selected':''}>Mais recentes</option><option value="oldest" ${d.sort==='oldest'?'selected':''}>Mais antigas</option><option value="name" ${d.sort==='name'?'selected':''}>Nome do servidor</option></select></div><div class="field"><label>&nbsp;</label><div class="actions"><button class="button button-primary" type="submit">Aplicar</button><button class="button button-secondary" type="button" data-action="dashboard-clear">Limpar</button></div></div></form><div class="toolbar" style="margin-top:1.5rem"><p><strong>${filtered.length}</strong> resultado(s)${filtered.length?` · exibindo ${start+1}–${Math.min(start+d.pageSize,filtered.length)}`:''}</p><div class="actions"><button class="button button-secondary" data-dashboard-page="${d.page-1}" ${d.page===1?'disabled':''}>Anterior</button><span>Página ${d.page} de ${pages}</span><button class="button button-secondary" data-dashboard-page="${d.page+1}" ${d.page===pages?'disabled':''}>Próxima</button></div></div><div class="table-wrap"><table><thead><tr><th>Protocolo</th><th>Servidor</th><th>Tipo</th><th>Período</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.protocol||r.id.slice(0,8))}</td><td><strong>${esc(r.servidor?.full_name||'Sem nome')}</strong><br>${esc(r.servidor?.matricula||'')}</td><td>${labelType(r.type)}</td><td>${formatDate(r.start_date)} a ${formatDate(r.end_date)}</td><td><span class="badge badge-${r.status}">${labelStatus(r.status)}</span></td><td><button class="button button-secondary" data-request="${r.id}">Analisar</button></td></tr>`).join('')||'<tr><td colspan="6">Nenhuma solicitação corresponde aos filtros.</td></tr>'}</tbody></table></div></section>`;
  }
  async function loadProfiles(){
    const response=await fetch(`${SUPABASE_URL}/functions/v1/manage-profiles`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${state.session.access_token}`},body:JSON.stringify({action:'list'})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Não foi possível carregar os perfis.');state.profiles=body.profiles||[];state.profileLocations=body.locations||[];
  }
  async function renderProfiles(){
    setProgress(0);if(!state.session){await loadSession();if(!state.session)return go('login');}if(state.profile?.role!=='administrador')return go('dashboard');app.innerHTML='<section class="card loading-card"><div class="spinner"></div><p>Carregando perfis…</p></section>';
    try{await loadProfiles();}catch(error){app.innerHTML=shell('Não foi possível carregar os perfis','Tente novamente em alguns instantes.',`<div class="notice notice-danger">${esc(error.message)}</div><div class="actions"><button class="button button-secondary" data-go="dashboard">Voltar</button></div>`);return;}
    const staff=state.profiles.filter(profile=>profile.role!=='servidor').length;
    app.innerHTML=`<section class="card"><div class="toolbar"><div><p class="eyebrow">Administração</p><h2>Perfis e acessos</h2><p class="lead">Defina responsabilidades e o alcance territorial de cada usuário.</p></div><div class="actions"><button class="button button-secondary" data-go="dashboard">Solicitações</button><button class="button button-secondary" data-action="profiles-refresh">Atualizar</button></div></div><div class="stats"><div class="stat"><strong>${state.profiles.length}</strong><span>Contas cadastradas</span></div><div class="stat"><strong>${staff}</strong><span>Acessos de gestão</span></div><div class="stat"><strong>${state.profiles.filter(profile=>profile.role==='diretor').length}</strong><span>Diretores</span></div></div><div class="table-wrap" style="margin-top:1.5rem"><table><thead><tr><th>Usuário</th><th>Matrícula</th><th>Perfil</th><th>Identificador</th><th>Escopo</th><th></th></tr></thead><tbody>${state.profiles.map(profile=>`<tr><td><strong>${esc(profile.full_name)}</strong>${profile.id===state.profile.id?'<br><small>Conta atual</small>':''}</td><td>${esc(profile.servidor?.matricula||'—')}</td><td>${esc(profile.role)}</td><td>${esc(profile.login_identifier||'—')}</td><td>${(profile.scopes||[]).map(scope=>esc(scope.lotacao?.code||scope.lotacao?.name)).join(', ')||(profile.role==='rh'||profile.role==='administrador'?'Global':'—')}</td><td>${profile.id===state.profile.id?'—':`<button class="button button-secondary" data-profile="${profile.id}">Configurar</button>`}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function renderProfileDetail(){
    const profile=state.selected;if(!profile)return go('profiles');const selectedIds=new Set((profile.scopes||[]).map(scope=>scope.lotacao?.id));const roles=[['servidor','Servidor'],['diretor','Diretor(a)'],['rh','RH'],['administrador','Administrador']];
    app.innerHTML=shell('Configurar perfil',`${esc(profile.full_name)}${profile.servidor?.matricula?` · matrícula ${esc(profile.servidor.matricula)}`:''}`,`<form id="profile-access-form" class="form-grid"><div class="field"><label for="profile-role">Perfil de acesso</label><select class="control" id="profile-role" required>${roles.map(([value,label])=>`<option value="${value}" ${profile.role===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label for="profile-identifier">Identificador de gestão</label><input class="control" id="profile-identifier" minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]{3,40}" value="${esc(profile.login_identifier||'')}"><small>Obrigatório para perfis de gestão.</small></div><div class="field field-full"><label>Lotações sob responsabilidade</label><div class="summary">${state.profileLocations.map(location=>`<label class="summary-row"><span>${esc(location.code)} · ${esc(location.name)}</span><input type="checkbox" name="profile-scope" value="${location.id}" ${selectedIds.has(location.id)?'checked':''}></label>`).join('')}</div><small>Diretor e RH precisam de ao menos uma lotação. Somente o administrador possui acesso global.</small></div><div class="field field-full"><div class="notice">Ao promover um servidor para um perfil de gestão, a troca de senha será exigida no próximo acesso administrativo.</div><div class="actions"><button type="button" class="button button-secondary" data-go="profiles">Voltar</button><button class="button button-primary">Salvar perfil</button></div></div></form>`);
  }
  async function saveProfileAccess(event){
    event.preventDefault();const button=event.submitter,role=document.querySelector('#profile-role').value,identifier=document.querySelector('#profile-identifier').value.trim(),scopeIds=[...document.querySelectorAll('[name="profile-scope"]:checked')].map(input=>input.value);button.disabled=true;button.textContent='Salvando…';
    try{const response=await fetch(`${SUPABASE_URL}/functions/v1/manage-profiles`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${state.session.access_token}`},body:JSON.stringify({action:'update',profile_id:state.selected.id,role,identifier,scope_ids:scopeIds})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Não foi possível atualizar o perfil.');showToast('Perfil e escopos atualizados.');go('profiles');}
    catch(error){showToast(error.message);button.disabled=false;button.textContent='Salvar perfil';}
  }
  async function loadInclusions(){
    const response=await fetch(`${SUPABASE_URL}/functions/v1/manage-inclusions`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${state.session.access_token}`},body:JSON.stringify({action:'list'})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Não foi possível carregar as inclusões.');state.inclusions=body.inclusions||[];state.locations=body.locations||[];
  }
  async function renderInclusions(){
    setProgress(0);if(!state.session){await loadSession();if(!state.session)return go('login');}if(!['administrador','rh'].includes(state.profile?.role))return go('dashboard');app.innerHTML='<section class="card loading-card"><div class="spinner"></div><p>Carregando inclusões funcionais…</p></section>';
    try{await loadInclusions();}catch(error){app.innerHTML=shell('Não foi possível carregar as inclusões','Tente novamente em alguns instantes.',`<div class="notice notice-danger">${esc(error.message)}</div><div class="actions"><button class="button button-secondary" data-go="dashboard">Voltar</button></div>`);return;}
    const pending=state.inclusions.filter(item=>['pendente','em_analise'].includes(item.status));
    app.innerHTML=`<section class="card"><div class="toolbar"><div><p class="eyebrow">Cadastros funcionais</p><h2>Inclusões pendentes</h2><p class="lead">Confira os dados declarados e associe cargo, vínculo e lotação oficiais.</p></div><div class="actions"><button class="button button-secondary" data-go="dashboard">Solicitações</button><button class="button button-secondary" data-action="inclusions-refresh">Atualizar</button></div></div><div class="stats"><div class="stat"><strong>${pending.length}</strong><span>Aguardando análise</span></div><div class="stat"><strong>${state.inclusions.filter(item=>item.status==='aprovada').length}</strong><span>Aprovadas</span></div><div class="stat"><strong>${state.inclusions.filter(item=>item.status==='rejeitada').length}</strong><span>Rejeitadas</span></div></div><div class="table-wrap" style="margin-top:1.5rem"><table><thead><tr><th>Servidor</th><th>Matrícula</th><th>Lotação declarada</th><th>Cargo declarado</th><th>Situação</th><th></th></tr></thead><tbody>${state.inclusions.map(item=>`<tr><td><strong>${esc(item.requested_name)}</strong><br>${esc(item.request?.protocol||'')}</td><td>${esc(item.servidor?.matricula||'—')}</td><td>${esc(item.requested_unit)}</td><td>${esc(item.requested_position||'—')}</td><td><span class="badge badge-${item.status}">${labelStatus(item.status)}</span></td><td>${['pendente','em_analise'].includes(item.status)?`<button class="button button-secondary" data-inclusion="${item.id}">Conferir</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="6">Nenhuma inclusão funcional registrada.</td></tr>'}</tbody></table></div></section>`;
  }
  function renderInclusionDetail(){
    const item=state.selected;if(!item)return go('inclusions');const locationOptions=state.locations.map(location=>`<option value="${location.id}">${esc(location.code)} · ${esc(location.name)}</option>`).join('');
    app.innerHTML=shell('Conferir inclusão funcional',`${esc(item.requested_name)} · matrícula ${esc(item.servidor?.matricula||'—')}`,`<div class="summary"><div class="summary-row"><span>Lotação declarada</span><strong>${esc(item.requested_unit)}</strong></div><div class="summary-row"><span>Cargo declarado</span><strong>${esc(item.requested_position||'—')}</strong></div><div class="summary-row"><span>Função declarada</span><strong>${esc(item.requested_function||'—')}</strong></div><div class="summary-row"><span>Vínculo declarado</span><strong>${esc(item.requested_employment_type||'—')}</strong></div></div><form id="inclusion-review-form" class="form-grid"><div class="field field-full"><label for="official-location">Lotação oficial</label><select class="control" id="official-location" required><option value="">Selecione a unidade</option>${locationOptions}</select></div><div class="field"><label for="official-position">Cargo oficial</label><input class="control" id="official-position" required value="${esc(item.requested_position||'')}"></div><div class="field"><label for="official-employment">Vínculo oficial</label><input class="control" id="official-employment" required value="${esc(item.requested_employment_type||'')}"></div><div class="field field-full"><label for="inclusion-notes">Parecer/justificativa</label><textarea class="control" id="inclusion-notes" rows="4"></textarea></div><div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="inclusions">Voltar</button><button type="button" class="button button-danger" data-inclusion-decision="reject">Rejeitar</button><button type="button" class="button button-primary" data-inclusion-decision="approve">Aprovar inclusão</button></div></div></form>`);
  }
  async function reviewInclusion(action,button){
    const notes=document.querySelector('#inclusion-notes').value.trim();if(action==='reject'&&!notes)return showToast('Informe a justificativa da rejeição.');button.disabled=true;button.textContent='Salvando…';
    try{const response=await fetch(`${SUPABASE_URL}/functions/v1/manage-inclusions`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${state.session.access_token}`},body:JSON.stringify({action,id:state.selected.id,notes,location_id:document.querySelector('#official-location').value,position:document.querySelector('#official-position').value.trim(),employment_type:document.querySelector('#official-employment').value.trim()})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Não foi possível concluir a análise.');showToast(action==='approve'?'Inclusão aprovada.':'Inclusão rejeitada.');go('inclusions');}
    catch(error){showToast(error.message);button.disabled=false;button.textContent=action==='approve'?'Aprovar inclusão':'Rejeitar';}
  }
  function renderDetail(){
    const r=state.selected;if(!r)return go('dashboard');const staff=state.profile?.role;
    app.innerHTML=shell(`Solicitação ${esc(r.protocol||r.id.slice(0,8))}`,`${esc(r.servidor?.full_name||'Servidor')} · ${labelType(r.type)}`,`<div class="summary"><div class="summary-row"><span>Status</span><strong>${labelStatus(r.status)}</strong></div><div class="summary-row"><span>Lotação</span><strong>${esc(r.servidor?.lotacao?.name||'—')}</strong></div>${(r.periods||[]).map((p,i)=>`<div class="summary-row"><span>${i+1}º período</span><strong>${formatDate(p.start_date)} a ${formatDate(p.end_date)} — retorno ${formatDate(p.return_date)}</strong></div>`).join('')}</div><div class="field"><label for="decision-notes">Parecer/justificativa</label><textarea class="control" id="decision-notes" rows="4"></textarea></div><div class="actions"><button class="button button-secondary" data-go="dashboard">Voltar</button><button class="button button-secondary" data-status="em_analise">Colocar em análise</button><button class="button button-primary" data-status="aprovada">Aprovar</button><button class="button button-danger" data-status="rejeitada">Rejeitar</button>${staff==='rh'||staff==='administrador'?'<button class="button button-primary" data-status="programada">Programar</button>':''}</div>`);
  }
  async function updateStatus(status){const notes=document.querySelector('#decision-notes').value.trim();if(status==='rejeitada'&&!notes)return showToast('Informe a justificativa da rejeição.');const {error}=await client.from('vacation_requests').update({status,notes:notes||state.selected.notes}).eq('id',state.selected.id);if(error)return showToast(error.message);showToast('Situação atualizada.');await renderDashboard();state.route='dashboard';}
  function render(){sessionAction.classList.toggle('hidden',!state.session);({home:renderHome,types:renderTypes,identity:renderIdentity,rules:renderRules,dates:renderDates,confirm:renderConfirm,receipt:renderReceipt,'employee-login':renderEmployeeLogin,'employee-register':renderEmployeeRegister,'employee-dashboard':renderEmployeeDashboard,'employee-detail':renderEmployeeDetail,login:renderLogin,'change-password':renderChangePassword,dashboard:renderDashboard,profiles:renderProfiles,'profile-detail':renderProfileDetail,inclusions:renderInclusions,'inclusion-detail':renderInclusionDetail,detail:renderDetail}[state.route]||renderHome)();app.focus({preventScroll:true});}

  document.addEventListener('click',async event=>{
    const goButton=event.target.closest('[data-go]');if(goButton){go(goButton.dataset.go);return;}
    const typeButton=event.target.closest('[data-type]');if(typeButton){state.request.type=typeButton.dataset.type;go('identity');return;}
    const requestButton=event.target.closest('[data-request]');if(requestButton){state.selected=state.requests.find(r=>r.id===requestButton.dataset.request);go(state.profile?.role==='servidor'?'employee-detail':'detail');return;}
    const inclusionButton=event.target.closest('[data-inclusion]');if(inclusionButton){state.selected=state.inclusions.find(item=>item.id===inclusionButton.dataset.inclusion);go('inclusion-detail');return;}
    const profileButton=event.target.closest('[data-profile]');if(profileButton){state.selected=state.profiles.find(profile=>profile.id===profileButton.dataset.profile);go('profile-detail');return;}
    const inclusionDecision=event.target.closest('[data-inclusion-decision]');if(inclusionDecision){await reviewInclusion(inclusionDecision.dataset.inclusionDecision,inclusionDecision);return;}
    const statusButton=event.target.closest('[data-status]');if(statusButton){await updateStatus(statusButton.dataset.status);return;}
    const pageButton=event.target.closest('[data-dashboard-page]');if(pageButton&&!pageButton.disabled){state.dashboard.page=Number(pageButton.dataset.dashboardPage);await renderDashboard();return;}
    const action=event.target.closest('[data-action]')?.dataset.action;if(action==='submit-request')await submitRequest();if(action==='restart'){if(state.profile?.role==='servidor')await prepareEmployeeRequest();else location.reload();}if(action==='refresh')await renderDashboard();if(action==='profiles-refresh')await renderProfiles();if(action==='inclusions-refresh')await renderInclusions();if(action==='employee-refresh')await renderEmployeeDashboard();if(action==='employee-new-request')await prepareEmployeeRequest();if(action==='forgot-password')showToast('Solicite a redefinição ao RH. A recuperação automática será habilitada após homologação.');
    if(action==='dashboard-clear'){state.dashboard={query:'',status:'',type:'',sort:'newest',page:1,pageSize:10};await renderDashboard();}
  });
  document.addEventListener('submit',async event=>{
    if(event.target.id==='login-form')return login(event);if(event.target.id==='change-password-form')return changePassword(event);if(event.target.id==='profile-access-form')return saveProfileAccess(event);if(event.target.id==='employee-login-form')return employeeAuth(event,'login');if(event.target.id==='employee-register-form')return employeeAuth(event,'register');event.preventDefault();
    if(event.target.id==='dashboard-filter-form'){state.dashboard.query=document.querySelector('#dashboard-query').value;state.dashboard.status=document.querySelector('#dashboard-status').value;state.dashboard.type=document.querySelector('#dashboard-type').value;state.dashboard.sort=document.querySelector('#dashboard-sort').value;state.dashboard.page=1;await renderDashboard();return;}
    if(event.target.id==='identity-form'){
      const ids=['name','cpf','birthDate','registration','admissionDate','employmentType','position','functionName','unit'];ids.forEach(id=>state.request[id]=document.querySelector(`#${id}`).value.trim());state.request.cpf=formatCPF(state.request.cpf);
      if(!validCPF(state.request.cpf))return showToast('Informe um CPF válido.');if(state.request.admissionDate<state.request.birthDate)return showToast('A admissão não pode ser anterior ao nascimento.');go('rules');
    } else if(event.target.id==='rules-form'){
      ['acquisitionEnd','unjustifiedAbsences','split','availableHours','dailyHours','addBankHours','prizeDays'].forEach(id=>{const el=document.querySelector(`#${id}`);if(el)state.request[id]=el.value;});
      if(state.request.type==='banco_horas'&&ruleSummary().days<1)return showToast('O saldo não corresponde a um dia completo da jornada informada.');if(state.request.split!=='none'&&state.request.employmentType!=='efetivo')state.request.split='none';go('dates');
    } else if(event.target.id==='dates-form'){
      state.request.mode=document.querySelector('#mode').value;const chosen=document.querySelector('#chosenDate').value;state.request.secondStartDate=document.querySelector('#secondStartDate')?.value||'';try{state.request.periods=calculatePeriods(chosen);state.request.startDate=state.request.periods[0].start_date;state.request.returnDate=state.request.periods.at(-1).return_date;go('confirm');}catch(error){showToast(error.message);}
    }
  });
  document.addEventListener('input',event=>{if(event.target.id==='cpf'||event.target.id==='employee-cpf')event.target.value=formatCPF(event.target.value);if(event.target.matches('.control')){event.target.classList.toggle('valid',event.target.checkValidity()&&!!event.target.value);event.target.classList.toggle('invalid',!event.target.checkValidity());}});
  sessionAction.addEventListener('click',async()=>{await client?.auth.signOut();state.session=null;state.profile=null;state.requests=[];state.selected=null;go('home');});
  loadSession().finally(()=>render());
})();
