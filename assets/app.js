(() => {
  'use strict';

  const SUPABASE_URL = 'https://ijhvbzomakbbxverqfqh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_9upWl4mCzsfuaPE1_gOFkw_9Im-Y4sJ';
  const RULE_START = '2025-12-02';
  const HOLIDAYS = new Set();
  const CALENDAR_EVENTS = new Map();
  const LOGIN_COOLDOWN_KEY = 'sgf-login-cooldown-until';
  let loginCooldownTimer = null;
  const readLoginCooldown = () => { try { return Number(globalThis.localStorage?.getItem(LOGIN_COOLDOWN_KEY) || 0); } catch { return 0; } };
  const writeLoginCooldown = value => { try { if (value) globalThis.localStorage?.setItem(LOGIN_COOLDOWN_KEY, String(value)); else globalThis.localStorage?.removeItem(LOGIN_COOLDOWN_KEY); } catch { /* O bloqueio principal permanece no servidor. */ } };
  const roleAwareFetch = (input, init = {}) => {
    const headers = new Headers(init.headers);
    if (state.multiAccess && state.profile?.role) headers.set('x-sgf-role', state.profile.role);
    if (state.activeContext?.bond_id) headers.set('x-sgf-bond', state.activeContext.bond_id);
    if (state.activeContext?.cnes_unit_id) headers.set('x-sgf-cnes', state.activeContext.cnes_unit_id);
    if (state.activeContext?.lotacao_id) headers.set('x-sgf-lotacao', state.activeContext.lotacao_id);
    return fetch(input, { ...init, headers });
  };
  const callbackParams = new URLSearchParams(window.location.hash.slice(1));
  const passwordCallback = ['invite', 'recovery'].includes(callbackParams.get('type')) || /type=(invite|recovery)/.test(window.location.search);
  const callbackError = callbackParams.has('error') || new URLSearchParams(window.location.search).has('error');
  let client;
  const app = document.querySelector('#app');
  const restrictedControls = {
    '[data-catalog-new="cargo"], [data-catalog-new="funcao"], [data-catalog-new="location"], [data-catalog-reference], [data-catalog-location]':'structure',
    '[data-action="request-archive"]':'archive', '#time-bank-form':'timeBank',
    '[data-approval-stage]':'legacyOperation', '[data-distribution-save]':'distribution',
    '[data-revision-plan], [data-revision-commit]':'structure'
  };
  function controlAllowed(target) {
    for(const [selector,capability] of Object.entries(restrictedControls)) {
      if(target?.closest?.(selector) && !SGFAccessPolicy.can(capability,state.profile?.role,Boolean(state.session))) return false;
    }
    return true;
  }
  function applyControlPermissions() {
    for(const [selector,capability] of Object.entries(restrictedControls)) {
      if(!SGFAccessPolicy.can(capability,state.profile?.role,Boolean(state.session)))
        app.querySelectorAll(selector).forEach(element=>(element.id==='time-bank-form' ? element.closest('details') || element : element).remove());
    }
  }
  if(typeof MutationObserver!=='undefined') new MutationObserver(applyControlPermissions).observe(app,{childList:true,subtree:true});
  const progress = document.querySelector('#progress');
  const toast = document.querySelector('#toast');
  const sessionAction = document.querySelector('#session-action');
  const workspaceNav = document.querySelector('#workspace-nav');
  const headerUser = document.querySelector('#header-user');
  const state = {
    recoveryError: '',
    route: /type=(invite|recovery)/.test(`${window.location.hash}${window.location.search}`) ? 'set-password' : 'home', session: null, profile: null, multiAccess: false, accessContexts: [], activeContext: null, requests: [], archivedRequestIds: new Set(), scaleEmployees: [], scaleRequests: [], manualConflicts: [], minimumScale: [], minimumScaleDays: [], scaleLocations: [], notifications: [], inclusions: [], accessRequests: [], locations: [], profiles: [], profileLocations: [], calendarAdmin: [], catalogSort: 'name', profileSort: 'name', catalog: { employees: [], locations: [], positions: [], functions: [], managers: [], managerScopes: [], actorRole: '' }, registrationCatalogs: { cnesUnits: [], teams: [], teamTypes: [], positions: [], internalAllocations: [] }, accessFieldSequence: 0, selected: null, receiptContext: null, calendarLoaded: false, catalogShowAll: false,
    dashboard: { query: '', status: '', type: '', sort: 'newest', archived: false, page: 1, pageSize: 10 },
    scale: { month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`, location: '', cnes: '', mode: 'confirmed', team: '', conflictCriterion: 'position', position: '', functionId: '', status: '', focusDate: '', minimumLocation: '', minimumDate: '' },
    quick: { type: 'vacation', unit: 'uteis', mode: 'start', days: '', availableHours: '', dailyHours: '8', chosenDate: '', periods: [], usedHours: 0 },
    request: {
      type: '', name: '', cpf: '', birthDate: '', registration: '', admissionDate: '', employmentType: '',
      position: '', functionName: '', unit: '', acquisitionEnd: '', unjustifiedAbsences: 'no',
      mode: 'start', startDate: '', returnDate: '', secondStartDate: '', split: 'none',
      availableHours: '', dailyHours: '8', addBankHours: '', notes: '', periods: [], dayResponsibilities: []
    }
  };

  if (passwordCallback || callbackError) state.route = 'set-password';
  // Initialize only after state exists: Auth also uses roleAwareFetch during callbacks.
  client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { detectSessionInUrl: !(passwordCallback || callbackError) }, global: { fetch: roleAwareFetch } });

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const digits = value => String(value || '').replace(/\D/g, '');
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dateFrom = value => { const [y, m, d] = String(value).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (date, amount) => { const d = new Date(date); d.setDate(d.getDate() + amount); return d; };
  const formatDate = value => value ? new Intl.DateTimeFormat('pt-BR').format(typeof value === 'string' ? dateFrom(value) : value) : '—';
  const formatDateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
  const formatDayMonth = value => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(dateFrom(value)) : '—';
  const accessLabel = role => ({ servidor: 'Servidor', diretor: 'Diretor (legado)', rh: 'RH/Diretor', administrador: 'Administrador' })[role] || role;
  const passwordMin = roles => roles?.includes('administrador') ? 8 : 6;
  const institutionalEmail = value => /^[^\s@]+@betim\.mg\.gov\.br$/i.test(String(value || '').trim());
  const accessHome = role => state.activeContext?.institutional ? 'rh-workspace' : role === 'administrador' ? 'rh-calendar' : role === 'servidor' ? 'employee-dashboard' : 'dashboard';
  const sessionHeaders = session => ({ 'Content-Type': 'application/json', apikey: SUPABASE_KEY, ...(state.multiAccess && state.profile?.role ? { 'x-sgf-role': state.profile.role } : {}), ...(state.activeContext?.bond_id ? { 'x-sgf-bond': state.activeContext.bond_id } : {}), ...(state.activeContext?.cnes_unit_id ? { 'x-sgf-cnes': state.activeContext.cnes_unit_id } : {}), ...(state.activeContext?.lotacao_id ? { 'x-sgf-lotacao': state.activeContext.lotacao_id } : {}), Authorization: `Bearer ${session.access_token}` });
  const labelType = type => ({ regulamentar: 'Férias regulamentares', premio: 'Férias-prêmio', banco_horas: 'Folga — banco de horas' })[type] || type;
  const labelStatus = status => ({ rascunho: 'Rascunho', enviada: 'Enviada', em_analise: 'Em análise', devolvida: 'Devolvida para correção', aprovada: 'Aprovada', rejeitada: 'Rejeitada', programada: 'Programada', reprogramada: 'Reprogramada', cancelada: 'Cancelada', concluida: 'Concluída' })[status] || status;
  const labelApprovalStage = stage => ({ chefia_imediata: 'Chefia imediata', rh: 'RH' })[stage] || stage;
  const labelApprovalDecision = decision => ({ pendente: 'Pendente', aprovada: 'Aprovada', rejeitada: 'Rejeitada', devolvida: 'Devolvida' })[decision] || decision;
  const labelUnitReview = status => ({ pendente: 'Aguardando análise', aprovada: 'Aprovada — aguardando calendário', rejeitada: 'Recusada', programada: 'Adicionada ao calendário' })[status] || status;
  const isBirthdayDayOff = date => {
    if (!state.request.birthDate) return false;
    const birth = dateFrom(state.request.birthDate);
    return date.getMonth() === birth.getMonth() && date.getDate() === birth.getDate();
  };
  const isBusiness = (date, includeDayOff = true) => ![0, 6].includes(date.getDay()) && !HOLIDAYS.has(iso(date)) && (!includeDayOff || !isBirthdayDayOff(date));
  const nextBusiness = (date, includeDayOff = true) => { let d = new Date(date); while (!isBusiness(d, includeDayOff)) d = addDays(d, 1); return d; };
  const addBusinessInclusive = (start, count, includeDayOff = true) => { let d = new Date(start), used = 0; while (used < count) { if (isBusiness(d, includeDayOff)) used++; if (used < count) d = addDays(d, 1); } return d; };
  const subtractBusinessForStart = (returnDate, count, includeDayOff = true) => { let d = addDays(returnDate, -1), used = 0; while (used < count) { if (isBusiness(d, includeDayOff)) used++; if (used < count) d = addDays(d, -1); } return d; };
  const ERROR_MESSAGES = {
    ADMIN_REQUIRED: 'Esta ação exige acesso de Administrador.', STAFF_REQUIRED: 'Esta ação exige acesso de RH ou Administrador.', ROLE_NOT_ALLOWED: 'Seu acesso atual não permite esta ação.', ACTOR_NOT_ALLOWED: 'Não foi possível confirmar sua autorização.', REQUEST_NOT_ALLOWED: 'Esta solicitação não pertence ao seu acesso.', REQUEST_OUT_OF_SCOPE: 'A solicitação pertence a uma lotação fora do seu escopo.', REQUEST_NOT_FOUND: 'A solicitação não foi encontrada ou está fora do seu escopo.', REQUEST_ALREADY_DECIDED: 'Esta solicitação já foi analisada.', STAGE_ALREADY_DECIDED: 'Esta etapa de aprovação já foi concluída.', MANAGER_APPROVAL_REQUIRED: 'A aprovação da Chefia Imediata deve ocorrer antes da aprovação do RH.', REJECTION_REASON_REQUIRED: 'Informe o motivo da rejeição.', NOTES_REQUIRED: 'Informe a justificativa antes de continuar.', TRANSITION_NOT_ALLOWED: 'Esta mudança de situação não é permitida no momento.', INSUFFICIENT_VALIDATED_BALANCE: 'O saldo validado do banco de horas é insuficiente.', INVALID_JWT: 'Sua sessão expirou. Entre novamente para continuar.'
  };
  const friendlyMessage = value => { const message = String(value || 'Não foi possível concluir a operação.'); return ERROR_MESSAGES[message] || (message === 'Failed to fetch' ? 'Não foi possível conectar ao serviço. Confira sua internet e tente novamente.' : message); };
  let toastTimer;
  const clearToast = () => { if (toastTimer !== undefined) clearTimeout(toastTimer); toastTimer = undefined; toast.classList.remove('show'); toast.textContent = ''; };
  const showToast = message => { clearToast(); toast.textContent = friendlyMessage(message); toast.classList.add('show'); toastTimer = setTimeout(clearToast, 4200); };
  function syncControlValidation(control) {
    if (!control?.matches?.('.control')) return;
    const hasValue = control.type === 'checkbox' ? control.checked : Boolean(String(control.value || '').trim());
    const invalid = !control.checkValidity(), valid = hasValue && !invalid;
    control.classList.toggle('valid', valid); control.classList.toggle('invalid', invalid); control.setAttribute('aria-invalid', String(invalid));
    const field = control.closest?.('.field'); if (!field) return;
    let status = field.querySelector('.validation-state');
    if (!status && (valid || invalid)) { status = document.createElement('small'); status.className = 'validation-state'; status.setAttribute('aria-live', 'polite'); field.appendChild(status); }
    if (!status) return;
    status.className = `validation-state ${invalid ? 'validation-error' : valid ? 'validation-success' : 'hidden'}`;
    status.textContent = invalid ? 'Atenção: verifique este campo.' : valid ? '✓ Preenchido corretamente.' : '';
  }
  const setProgress = value => progress.style.setProperty('--progress', `${value}%`);
  let navigationVersion = 0;
  function captureView() {
    const version = navigationVersion, route = state.route, context = state.activeContext, user = state.session?.user?.id, role = state.profile?.role;
    return () => version === navigationVersion && route === state.route && context === state.activeContext && user === state.session?.user?.id && role === state.profile?.role;
  }
  const go = route => { navigationVersion++; state.route = SGFAccessPolicy.resolve(route,state.profile?.role,Boolean(state.session),state.profile?.must_change_password); window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); if (state.route === 'stored-receipt') { renderStoredReceipt(); app.focus({ preventScroll: true }); } else render(); };

  async function loadCalendarEvents() {
    if (!client) return;
    const { data, error } = await client.from('calendar_events').select('event_date,type,name').eq('active', true).order('event_date');
    if (error) { console.error('calendar-events', error); return; }
    HOLIDAYS.clear(); CALENDAR_EVENTS.clear();
    (data || []).forEach(event => { if(event.type==='feriado') HOLIDAYS.add(event.event_date); CALENDAR_EVENTS.set(event.event_date, event); });
    state.calendarLoaded = true;
  }

  function validCPF(value) {
    const cpf = digits(value); if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    const digit = length => { let sum = 0; for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i); const mod = (sum * 10) % 11; return mod === 10 ? 0 : mod; };
    return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
  }
  function formatCPF(value) { const v = digits(value).slice(0, 11); return v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }
  function field(label, id, type = 'text', required = true, hint = '', attrs = '') {
    const value = state.request[id] ?? '';
    return `<div class="field"><label for="${id}">${label}${required ? ' *' : ''}</label><input class="control" id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${attrs}>${hint ? `<small>${hint}</small>` : ''}</div>`;
  }
  function selectField(label, id, options, hint = '') {
    return `<div class="field"><label for="${id}">${label} *</label><select class="control" id="${id}" name="${id}" required><option value="">Selecione</option>${options.map(([v, t]) => `<option value="${v}" ${state.request[id] === v ? 'selected' : ''}>${t}</option>`).join('')}</select>${hint ? `<small>${hint}</small>` : ''}</div>`;
  }
  function shell(title, lead, content, step = 0) {
    setProgress(step); return `<section class="card"><p class="eyebrow">Prefeitura Municipal de Betim</p><h2>${title}</h2>${lead ? `<p class="lead">${lead}</p>` : ''}${content}</section>`;
  }
  function renderHeaderUser() {
    if (!headerUser) return;
    headerUser.classList.toggle('hidden', !state.session || !state.profile);
    if (!state.session || !state.profile) { headerUser.innerHTML = ''; return; }
    const firstAndLast = String(state.profile.full_name || '').trim().split(/\s+/);
    const name = firstAndLast.length > 1 ? `${firstAndLast[0]} ${firstAndLast.at(-1)}` : firstAndLast[0];
    const employee = Array.isArray(state.profile.servidor) ? state.profile.servidor[0] : state.profile.servidor;
    const context = state.activeContext;
    const contextLabel = context?.global ? 'Visão geral' : context?.cnes_name || context?.lotacao_name || employee?.lotacao?.name || state.profile.primary_lotacao?.name || 'Contexto a definir';
    const roleLabel = context?.institutional ? 'RH da unidade' : state.profile.role === 'servidor' ? (context?.position || employee?.cargo?.name || employee?.declared_position || 'Servidor') : (accessLabel(state.profile.role || '') || 'Escolha um perfil');
    headerUser.innerHTML = `<strong>${esc(name)}</strong><small>${esc(roleLabel)} · ${esc(contextLabel)}</small>${state.activeContext?.institutional&&state.rhState?.operator?`<small>Operador declarado: ${esc(state.rhState.operator.name)}</small>`:''}`;
  }
  function catalogTabs() {
    const items = [['catalogs', 'Servidores e lotações'], ['inclusions', 'Pendências funcionais']];
    if (state.profile?.role === 'administrador') items.push(['profiles', 'Usuários e acessos'], ['calendar-admin', 'Feriados'], ['cnes-import', 'Conferência CNES'], ['rh-accounts', 'Contas RH e operadores'], ['rh-calendar', 'Calendário RH']);
    return `<nav class="catalog-tabs" aria-label="Seções de cadastros">${items.map(([route, label]) => `<button type="button" class="button button-secondary" data-go="${route}" ${state.route === route ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
  }
  function renderWorkspaceNav() {
    if (!workspaceNav) return;
    const show = state.session && state.profile?.role && !state.profile.must_change_password && !['change-password', 'set-password'].includes(state.route);
    workspaceNav.classList.toggle('hidden', !show);
    if (!show) { workspaceNav.innerHTML = ''; return; }
    if(state.activeContext?.institutional){workspaceNav.innerHTML='<button type="button" data-go="rh-workspace" aria-current="page">Calendário da unidade</button>';return;}
    const employee = state.profile?.role === 'servidor';
    const items = state.profile?.role === 'administrador'
      ? [['rh-calendar', 'Calendário'], ['rh-accounts', 'Cadastro das unidades'], ['calendar-admin', 'Feriados']]
      : employee ? [['employee-dashboard', 'Registros anteriores'], ['quick', 'Simular']]
      : [['dashboard', 'Registros anteriores'], ['scale', 'Escala anterior'], ['audit-history', 'Histórico']];
    workspaceNav.innerHTML = `${state.accessContexts.length > 1 ? `<button type="button" data-go="choose-access" class="access-switch">${accessLabel(state.profile.role)} · ${esc(state.activeContext?.cnes_code || state.activeContext?.lotacao_name || 'Geral')} ▾</button>` : ''}${items.map(([route, label]) => `<button type="button" data-go="${route}" ${route === 'catalogs' ? ['catalogs', 'inclusions', 'inclusion-detail', 'profiles', 'profile-detail', 'employee-registry-detail', 'location-detail', 'reference-detail', 'calendar-admin', 'profile-create'].includes(state.route) ? 'aria-current="page"' : '' : state.route === route ? 'aria-current="page"' : ''}>${label}</button>`).join('')}`;
  }

  function renderHome() {
    if (state.session && state.profile?.role) return go(accessHome(state.profile.role));
    if (state.session) return go('choose-access');
    setProgress(0);
    app.innerHTML = `<section class="card hero"><div><p class="eyebrow">RH das unidades e Diretoria DAPS</p><h1>Férias da unidade em um só lugar.</h1><p class="lead">Gerencie os afastamentos da unidade pelo calendário ou simule datas sem entrar.</p></div><div class="choice-grid"><button class="choice choice-featured" data-go="login"><span class="choice-kicker">RH e Administração</span><strong>Entrar no SGF →</strong><span>Acesse o calendário, os funcionários e os registros da sua unidade.</span></button><button class="choice" data-go="quick"><span class="choice-kicker">Consulta livre</span><strong>Simulação Rápida</strong><span>Estime datas de férias sem informar dados pessoais.</span></button></div><p class="page-footnote">A simulação é uma estimativa. A programação dos afastamentos é realizada pelo RH.</p></section>`;
  }
  function renderQuick() {
    setProgress(0);
    const q = state.quick;
    app.innerHTML = shell('Simulação Rápida', 'Faça uma estimativa sem cadastrar seus dados ou enviar um pedido.', `<form id="quick-form" class="form-grid">
      <div class="form-section-heading field-full"><span class="step-number">1</span><div><h3>Escolha o que calcular</h3><p>Informe a quantidade e a forma de contagem dos dias.</p></div></div>
      <div class="field"><label for="quick-type">O que deseja simular?</label><select class="control" id="quick-type"><option value="vacation" ${q.type === 'vacation' ? 'selected' : ''}>Férias</option></select></div>
      <div class="field" id="quick-days-group"><label for="quick-days">Quantos dias?</label><input class="control" id="quick-days" type="number" min="1" max="90" step="1" value="${esc(q.days)}"></div>
      <div class="form-section-heading field-full"><span class="step-number">2</span><div><h3>Defina a contagem e a data</h3><p>Você pode partir do primeiro dia de afastamento ou do dia em que deseja voltar.</p></div></div>
      <div class="field"><label for="quick-unit">Como contar os dias?</label><select class="control" id="quick-unit"><option value="uteis" ${q.unit === 'uteis' ? 'selected' : ''}>Dias úteis</option><option value="corridos" ${q.unit === 'corridos' ? 'selected' : ''}>Dias corridos</option></select><small>Corridos incluem fins de semana e feriados.</small></div>
      <div class="field"><label for="quick-mode">Calcular a partir de</label><select class="control" id="quick-mode"><option value="start" ${q.mode === 'start' ? 'selected' : ''}>Data de início</option><option value="return" ${q.mode === 'return' ? 'selected' : ''}>Data de retorno</option></select></div>
      <div class="field"><label for="quick-date" id="quick-date-label">${q.mode === 'return' ? 'Data de retorno desejada' : 'Data de início desejada'}</label><input class="control" id="quick-date" type="date" value="${esc(q.chosenDate)}" required><small id="quick-date-hint">${q.mode === 'return' ? 'O retorno precisa ser em dia útil.' : 'Nos dias úteis, uma data não útil será ajustada para o próximo dia útil.'}</small></div>
      <div class="field field-full"><details class="help-details"><summary>Como funciona esta estimativa?</summary><p>Dias úteis desconsideram fins de semana, feriados e pontos facultativos. Dias corridos contam todos os dias do período. O retorno é no próximo dia útil. O day-off de aniversário não entra na Simulação Rápida.</p></details>${state.calendarLoaded ? '' : '<div class="notice notice-danger">O calendário está indisponível. Atualize a página antes de simular.</div>'}<div class="actions actions-end"><button type="button" class="button button-secondary" data-go="home">Voltar</button><button class="button button-primary" type="submit" ${state.calendarLoaded ? '' : 'disabled'}>Ver resultado</button></div></div>
    </form>`);
    syncQuickFields();
  }
  function syncQuickFields() {
    const bank = document.querySelector('#quick-type')?.value === 'bank';
    for (const [id, active] of [['quick-days', !bank], ['quick-hours', bank], ['quick-daily', bank]]) {
      document.querySelector(`#${id}-group`)?.classList.toggle('hidden', !active);
      const input = document.querySelector(`#${id}`); if (input) input.required = active;
    }
    const dateLabel = document.querySelector('#quick-date-label');
    if (dateLabel) dateLabel.textContent = document.querySelector('#quick-mode')?.value === 'return' ? 'Data de retorno desejada' : 'Data de início desejada';
    const dateHint = document.querySelector('#quick-date-hint');
    if (dateHint) dateHint.textContent = document.querySelector('#quick-mode')?.value === 'return' ? 'O retorno precisa ser em dia útil.' : 'Nos dias úteis, uma data não útil será ajustada para o próximo dia útil.';
  }
  function submitQuick(event) {
    event.preventDefault();
    if (!state.calendarLoaded) return showToast('O calendário está indisponível. Atualize a página e tente novamente.');
    const type = document.querySelector('#quick-type').value;
    if(type!=='vacation') return showToast('A simulação está disponível apenas para férias.');
    const unit = document.querySelector('#quick-unit').value;
    const mode = document.querySelector('#quick-mode').value;
    const chosenDate = document.querySelector('#quick-date').value;
    const availableHours = 0;
    const dailyHours = 0;
    const days = type === 'bank' ? Math.floor(availableHours / dailyHours) : Number(document.querySelector('#quick-days').value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chosenDate) || !['uteis', 'corridos'].includes(unit) || !['start', 'return'].includes(mode) || !Number.isInteger(days) || days < 1 || days > 90 ||
      (type === 'bank' && (!Number.isFinite(availableHours) || !Number.isFinite(dailyHours) || availableHours < 0.5 || dailyHours < 1 || dailyHours > 24))) {
      return showToast('Confira a data, os dias e as horas informadas.');
    }
    const chosen = dateFrom(chosenDate);
    if (mode === 'return' && !isBusiness(chosen, false)) return showToast('Escolha um dia útil para a data de retorno.');
    const start = mode === 'return'
      ? unit === 'corridos' ? addDays(chosen, -days) : subtractBusinessForStart(chosen, days, false)
      : unit === 'corridos' ? chosen : nextBusiness(chosen, false);
    const period = makePeriod(start, days, unit, 1, false);
    if (mode === 'return' && period.return_date !== chosenDate) return showToast('Não foi possível calcular esse retorno. Confira a data escolhida.');
    Object.assign(state.quick, { type, unit, mode, chosenDate, days: type === 'vacation' ? String(days) : '', availableHours: type === 'bank' ? String(availableHours) : '', dailyHours: String(dailyHours), usedHours: type === 'bank' ? days * dailyHours : 0, periods: [period] });
    go('quick-result');
  }
  function renderQuickResult() {
    const q = state.quick, period = q.periods[0];
    if (!period) return go('quick');
    const bank = q.type === 'bank';
    app.innerHTML = shell('Resultado da simulação', bank ? 'Folga por banco de horas' : `Férias em dias ${q.unit === 'corridos' ? 'corridos' : 'úteis'}`, `<div class="summary">
      <div class="summary-row"><span>Dias ${q.unit === 'corridos' ? 'corridos' : 'úteis'} simulados</span><strong>${period.days}</strong></div>
      ${bank ? `<div class="summary-row"><span>Horas utilizadas</span><strong>${q.usedHours} h de ${q.availableHours} h informadas</strong></div><div class="summary-row"><span>Horas restantes</span><strong>${(Number(q.availableHours) - q.usedHours).toFixed(1)} h</strong></div>` : ''}
      ${q.mode === 'start' && q.chosenDate !== period.start_date ? `<div class="summary-row"><span>Data informada</span><strong>${formatDate(q.chosenDate)} — ajustada para o próximo dia útil</strong></div>` : ''}<div class="summary-row"><span>Início</span><strong>${formatDate(period.start_date)}</strong></div><div class="summary-row"><span>Último dia do período</span><strong>${formatDate(period.end_date)}</strong></div><div class="summary-row"><span>Retorno ao trabalho</span><strong>${formatDate(period.return_date)}</strong></div>
    </div>${renderCalendar(q.periods, null)}<p class="page-footnote">Estimativa sem identificação pessoal e sem day-off de aniversário. Não comprova direito, saldo ou autorização de afastamento.</p><div class="actions"><button class="button button-primary" data-go="quick">Alterar simulação</button><button class="button button-secondary" data-go="${state.session ? state.profile?.role === 'servidor' ? 'employee-dashboard' : 'dashboard' : 'login'}">${state.session ? 'Abrir calendário' : 'Entrar no SGF'}</button></div>`);
  }
  function renderTypes() {
    app.innerHTML = shell('O que você deseja solicitar?', 'Escolha a modalidade. As regras e os cálculos serão ajustados automaticamente.', `<div class="choice-grid">
      <button class="choice" data-type="regulamentar"><strong>Férias regulamentares</strong><span>25 dias úteis no novo regime, 16 dias úteis quando aplicável ou 30 dias corridos no regime anterior.</span></button>
      <button class="choice" data-type="premio"><strong>Férias-prêmio</strong><span>Solicitação de 30, 60 ou 90 dias, sujeita à confirmação do direito.</span></button>
      <button class="choice" data-type="banco_horas"><strong>Folga — banco de horas</strong><span>Converta o saldo declarado em dias conforme sua jornada diária.</span></button>
    </div><div class="actions"><button class="button button-secondary" data-go="home">Voltar</button></div>`, 12);
  }
  function renderIdentity() {
    app.innerHTML = shell('Confira seus dados', 'Os dados do cadastro funcional ajudam a identificar o servidor e registrar o pedido.', `<form id="identity-form" class="form-grid" novalidate>
      <div class="form-section-heading field-full"><span class="step-number">1</span><div><h3>Identificação</h3><p>Confira os dados pessoais e a matrícula.</p></div></div>
      ${field('Nome completo', 'name')}${field('CPF', 'cpf', 'text', true, 'Use o CPF vinculado ao cadastro funcional.', 'inputmode="numeric" maxlength="14" autocomplete="off"')}
      ${field('Data de nascimento', 'birthDate', 'date')}${field('Matrícula', 'registration', 'text', true, 'Número usado pela Prefeitura para identificar seu vínculo.')}
      <div class="form-section-heading field-full"><span class="step-number">2</span><div><h3>Dados funcionais</h3><p>Use as informações do seu vínculo atual.</p></div></div>
      ${field('Data de admissão', 'admissionDate', 'date')}${selectField('Vínculo', 'employmentType', [['efetivo', 'Servidor efetivo'], ['comissionado', 'Comissionado sem vínculo efetivo'], ['contratado', 'Contratado'], ['funcao_publica', 'Função pública']], 'Selecione o tipo de vínculo registrado no RH.')}
      ${field('Cargo', 'position')}${field('Função/atividade', 'functionName', 'text', true, 'Atividade exercida atualmente.')}${field('Lotação', 'unit', 'text', true, 'Unidade ou setor em que você trabalha.')}
      <div class="field field-full"><div class="actions actions-end"><button type="button" class="button button-secondary" data-go="types">Voltar</button><button class="button button-primary" type="submit">Continuar para as regras</button></div></div>
    </form>`, 25);
  }
  function renderRules() {
    const r = state.request, regular = r.type === 'regulamentar', bank = r.type === 'banco_horas';
    const regularFields = regular ? `${field('Fim do período aquisitivo', 'acquisitionEnd', 'date', true, 'Data em que se completou o período que dá direito às férias.')}<div class="field"><label for="unjustifiedAbsences">Teve mais de 9 faltas injustificadas?</label><select class="control" id="unjustifiedAbsences"><option value="no" ${r.unjustifiedAbsences === 'no' ? 'selected' : ''}>Não</option><option value="yes" ${r.unjustifiedAbsences === 'yes' ? 'selected' : ''}>Sim</option></select></div><div class="field"><label for="split">Dividir as férias?</label><select class="control" id="split"><option value="none">Não dividir</option><option value="15-10" ${r.split === '15-10' ? 'selected' : ''}>15 + 10 dias úteis</option><option value="10-15" ${r.split === '10-15' ? 'selected' : ''}>10 + 15 dias úteis</option></select><small>Sujeito às regras do vínculo e à análise do RH.</small></div>${field('Horas do banco para acrescentar', 'addBankHours', 'number', false, 'Informe apenas se deseja usar horas do banco junto das férias. O RH validará o saldo.', 'min="0" step="0.5"')}` : '';
    const bankFields = bank ? `${field('Horas disponíveis no banco', 'availableHours', 'number', true, 'Informe o saldo que deseja considerar. O RH fará a validação.', 'min="0.5" step="0.5"')}${field('Carga horária por dia', 'dailyHours', 'number', true, 'Exemplo: 8 horas para uma jornada de 8 horas diárias.', 'min="1" max="24" step="0.5"')}` : '';
    const prize = r.type === 'premio' ? `<div class="field"><label for="prizeDays">Quantidade de dias</label><select class="control" id="prizeDays"><option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option></select></div>` : '';
app.innerHTML = shell('Regras da solicitação', labelType(r.type), `<form id="rules-form" class="form-grid">${regularFields}${bankFields}${prize}<div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="identity">Voltar</button><button class="button button-primary" type="submit">Definir datas</button></div></div></form>`, 42);
    const rights=(state.requestResources?.rights || []).filter(item=>item.type===r.type);
    document.querySelector('#rules-form').insertAdjacentHTML('afterbegin','<div class="field field-full notice"><strong>Conferência antes do envio</strong><p>Dados ou datas incoerentes impedem o envio; isso não registra uma recusa do RH. Depois do envio, a recusa administrativa exige motivo e justificativa. Saldo declarado não é saldo autorizado.</p><p>As referências legais e suas vigências ainda dependem de aprovação institucional no piloto. Consulte a norma vigente indicada pelo RH; se continuar com dúvida, procure o RH da unidade. Problemas do sistema: Administradores ou TI da Prefeitura de Betim.</p></div>');
    if(rights.length) document.querySelector('#rules-form').insertAdjacentHTML('afterbegin',`<div class="field field-full"><label for="rightId">Período aquisitivo conferido pelo RH</label><select class="control" id="rightId"><option value="">Informar período para conferência do RH</option>${rights.map(item=>`<option value="${item.id}" ${r.rightId===item.id?'selected':''}>${formatDate(item.acquisition_start)} a ${formatDate(item.acquisition_end)} · ${item.available_days} dia(s)</option>`).join('')}</select></div>`);
  }
  function ruleSummary() {
    const r = state.request;
    if (r.type === 'banco_horas') { const hours = Number(r.availableHours), daily = Number(r.dailyHours); return { days: Math.floor(hours / daily), unit: 'uteis', text: `${Math.floor(hours / daily)} dia(s) útil(eis), usando ${Math.floor(hours / daily) * daily}h` }; }
    if (r.type === 'premio') { const days = Number(r.prizeDays || 30); return { days, unit: 'corridos', text: `${days} dias corridos` }; }
    const isNew = (r.admissionDate && r.admissionDate >= RULE_START) || (r.acquisitionEnd && r.acquisitionEnd >= RULE_START);
    if (!isNew) return { days: 30, unit: 'corridos', text: '30 dias corridos — regime anterior' };
    if (r.unjustifiedAbsences === 'yes') return { days: 16, unit: 'uteis', text: '16 dias úteis — redução por faltas' };
    const extra = Math.floor(Number(r.addBankHours || 0) / Number(r.dailyHours || 8));
    return { days: 25 + extra, baseDays: 25, extra, unit: 'uteis', text: `25 dias úteis${extra ? ` + ${extra} dia(s) de banco de horas` : ''}` };
  }
  function renderDates() {
    const r = state.request, rule = ruleSummary();
    const splitAllowed = r.type === 'regulamentar' && r.employmentType === 'efetivo' && r.unjustifiedAbsences === 'no' && rule.unit === 'uteis' && r.split !== 'none' && !rule.extra;
    app.innerHTML = shell('Escolha as datas', `Período previsto: ${rule.text}.`, `<form id="dates-form" class="form-grid">
      <div class="field"><label for="mode">Calcular a partir de</label><select id="mode" class="control"><option value="start" ${r.mode === 'start' ? 'selected' : ''}>Data de início</option><option value="return" ${r.mode === 'return' ? 'selected' : ''}>Data de retorno</option></select></div>
      <div class="field"><label for="chosenDate" id="chosen-date-label">${r.mode === 'return' ? 'Data de retorno desejada' : 'Data de início desejada'} *</label><input class="control" id="chosenDate" type="date" value="${esc(r.mode === 'return' ? r.returnDate : r.startDate)}" required><small id="chosen-date-hint">${r.mode === 'return' ? 'Escolha um dia útil para voltar ao trabalho.' : 'Informe o primeiro dia desejado de afastamento.'}</small></div>
      ${splitAllowed ? field('Início do segundo período', 'secondStartDate', 'date', true, 'O segundo período deve iniciar após o primeiro.') : ''}
      <div class="field field-full"><details class="help-details"><summary>Como as datas são calculadas?</summary><p>O day-off de aniversário (${formatDayMonth(r.birthDate)}) e os feriados cadastrados não consomem dias úteis. Os dias corridos incluem todas as datas do intervalo. Respeite a antecedência administrativa exigida pelo RH.</p></details>${state.calendarLoaded ? '' : '<div class="notice notice-danger">O calendário oficial não pôde ser carregado. Atualize a página antes de simular o período.</div>'}<div class="actions actions-end"><button type="button" class="button button-secondary" data-go="rules">Voltar</button><button class="button button-primary" type="submit" ${state.calendarLoaded ? '' : 'disabled'}>Ver período</button></div></div>
    </form>`, 58);
  }
  function syncDatesField() {
    const returning = document.querySelector('#mode')?.value === 'return';
    const label = document.querySelector('#chosen-date-label'); if (label) label.textContent = returning ? 'Data de retorno desejada *' : 'Data de início desejada *';
    const hint = document.querySelector('#chosen-date-hint'); if (hint) hint.textContent = returning ? 'Escolha um dia útil para voltar ao trabalho.' : 'Informe o primeiro dia desejado de afastamento.';
  }
  function makePeriod(start, days, unit, sequence = 1, includeDayOff = true) {
    const end = unit === 'uteis' ? addBusinessInclusive(start, days, includeDayOff) : addDays(start, days - 1);
    return { sequence, start_date: iso(start), end_date: iso(end), return_date: iso(nextBusiness(addDays(end, 1), includeDayOff)), days, counting_mode: unit };
  }
  function calculatePeriods(chosen) {
    if (!state.calendarLoaded) throw new Error('O calendário oficial está indisponível. Atualize a página e tente novamente.');
    const r = state.request, rule = ruleSummary(), unit = rule.unit;
    if(r.admissionDate < r.birthDate) throw new Error('A admissão não pode ser anterior ao nascimento. Confira os dados com o RH.');
    const splitAllowed = r.type === 'regulamentar' && r.employmentType === 'efetivo' && r.unjustifiedAbsences === 'no' && rule.unit === 'uteis' && r.split !== 'none' && !rule.extra;
    let start;
    if (r.mode === 'start') start = dateFrom(chosen); else { const ret = dateFrom(chosen); start = unit === 'uteis' ? subtractBusinessForStart(ret, splitAllowed ? Number(r.split.split('-')[0]) : rule.days) : addDays(ret, -(rule.days)); }
    const firstDays = splitAllowed ? Number(r.split.split('-')[0]) : rule.days;
    if(iso(start) < r.admissionDate) throw new Error('O início solicitado não pode ser anterior à admissão. Confira os dados com o RH.');
    if(r.type === 'regulamentar' && (!r.acquisitionEnd || iso(start) <= r.acquisitionEnd)) throw new Error('O início das férias precisa ser posterior ao fim do período aquisitivo informado. Este impedimento não é recusa administrativa. Consulte a norma vigente indicada pelo RH e procure o RH da sua unidade.');
    const periods = [makePeriod(start, firstDays, unit, 1)];
    if (splitAllowed) { const secondStart = dateFrom(r.secondStartDate); if (secondStart < dateFrom(periods[0].return_date)) throw new Error('O segundo período não pode começar antes do retorno do primeiro. Confira as datas com o RH.'); periods.push(makePeriod(secondStart, Number(r.split.split('-')[1]), unit, 2)); }
    return periods;
  }
  function dayOffsInside(periods, birthDate = state.request.birthDate) {
    if (!birthDate) return [];
    const birth = dateFrom(birthDate), found = [];
    for (const period of periods) {
      const start = dateFrom(period.start_date), end = dateFrom(period.end_date);
      for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
        const day = new Date(year, birth.getMonth(), birth.getDate(), 12);
        if (day >= start && day <= end && !found.includes(iso(day))) found.push(iso(day));
      }
    }
    return found;
  }
  function renderCalendar(periods, birthDate = state.request.birthDate) {
    if (!periods?.length) return '';
    const starts = new Set(periods.map(period => period.start_date)), ends = new Set(periods.map(period => period.end_date)), returns = new Set(periods.map(period => period.return_date));
    const first = dateFrom(periods.map(period => period.start_date).sort()[0]), last = dateFrom(periods.map(period => period.return_date).sort().at(-1));
    const birthday = birthDate ? dateFrom(birthDate) : null, months = []; let cursor = new Date(first.getFullYear(), first.getMonth(), 1, 12), monthCount = 0;
    while (cursor <= last && monthCount < 6) {
      const year = cursor.getFullYear(), month = cursor.getMonth(), days = new Date(year, month + 1, 0, 12).getDate(), offset = new Date(year, month, 1, 12).getDay(), cells = [];
      for (let blank = 0; blank < offset; blank++)cells.push('<span class="calendar-day calendar-empty" aria-hidden="true"></span>');
      for (let day = 1; day <= days; day++) {
        const date = new Date(year, month, day, 12), value = iso(date), classes = ['calendar-day'], labels = [];
        const inside = periods.some(period => value >= period.start_date && value <= period.end_date);
        if (inside) { classes.push('calendar-away'); labels.push('afastamento'); }
        if (HOLIDAYS.has(value)) { classes.push('calendar-holiday'); labels.push(CALENDAR_EVENTS.get(value)?.name || 'feriado ou ponto facultativo'); }
        if (birthday && date.getMonth() === birthday.getMonth() && date.getDate() === birthday.getDate()) { classes.push('calendar-birthday'); labels.push('day-off de aniversário'); }
        if (starts.has(value)) { classes.push('calendar-start'); labels.push('início do afastamento'); }
        if (ends.has(value)) { classes.push('calendar-end'); labels.push('último dia do período'); }
        if (returns.has(value)) { classes.push('calendar-return'); labels.push('retorno ao trabalho'); }
        cells.push(`<span class="${classes.join(' ')}" title="${esc(labels.join(' · '))}" aria-label="${formatDate(value)}${labels.length ? ` — ${esc(labels.join(', '))}` : ''}">${day}</span>`);
      }
      while (cells.length % 7) cells.push('<span class="calendar-day calendar-empty" aria-hidden="true"></span>');
      months.push(`<section class="calendar-month"><h4>${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(cursor)}</h4><div class="calendar-weekdays" aria-hidden="true"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div><div class="calendar-days">${cells.join('')}</div></section>`);
      cursor = new Date(year, month + 1, 1, 12); monthCount++;
    }
    return `<section class="request-calendar" aria-label="Calendário dos períodos solicitados"><div class="calendar-heading"><div><h3>Calendário do afastamento</h3><p>A data de início é o primeiro dia em que o servidor não trabalhará.</p></div><div class="calendar-legend"><span><i class="legend-start"></i>Início</span><span><i class="legend-away"></i>Afastamento</span><span><i class="legend-end"></i>Último dia</span><span><i class="legend-return"></i>Retorno</span><span><i class="legend-holiday"></i>Feriado/ponto facultativo</span>${birthday ? '<span><i class="legend-birthday"></i>Day-off</span>' : ''}</div></div><div class="calendar-grid">${months.join('')}</div></section>`;
  }
  function responsibilityContexts() {
    const bondId = state.activeContext?.bond_id;
    const seen = new Set();
    return state.accessContexts.filter(context => context.role === 'servidor' && context.bond_id === bondId && context.bond_unit_id && context.cnes_unit_id).filter(context => {
      if (seen.has(context.bond_unit_id)) return false; seen.add(context.bond_unit_id); return true;
    });
  }
  function requestWorkDays(periods = state.request.periods, birthDate = state.request.birthDate) {
    const days = [];
    for (const period of periods || []) for (let day = dateFrom(period.start_date), end = dateFrom(period.end_date); day <= end; day = addDays(day, 1)) {
      if (isBusiness(day, true)) days.push(iso(day));
    }
    return [...new Set(days)].sort();
  }
  function renderResponsibilityPlanner() {
    const contexts = responsibilityContexts(), days = requestWorkDays();
    const validUnits = new Set(contexts.map(context => context.bond_unit_id));
    const saved = new Map((state.request.dayResponsibilities || []).filter(item => validUnits.has(item.bond_unit_id)).map(item => [item.date, item]));
    if (contexts.length === 1) for (const date of days) if (!saved.has(date)) saved.set(date, { date, bond_unit_id: contexts[0].bond_unit_id, cnes_unit_id: contexts[0].cnes_unit_id });
    state.request.dayResponsibilities = days.map(date => saved.get(date)).filter(Boolean);
    const options = contexts.map(context => `<option value="${context.bond_unit_id}">${esc(context.cnes_code || '')} · ${esc(context.cnes_name || context.lotacao_name || 'Unidade')}</option>`).join('');
    return `<section class="responsibility-planner"><div class="calendar-heading"><div><h3>Responsável por cada dia</h3><p>Defina qual CNES analisará cada dia útil. Feriados, fins de semana e day-off não exigem atribuição.</p></div></div>${contexts.length > 1 ? `<div class="responsibility-tools"><div class="field"><label for="responsibility-bulk-context">CNES para preenchimento rápido</label><select class="control" id="responsibility-bulk-context"><option value="">Selecione</option>${options}</select></div><div class="field"><label for="responsibility-weekday">Aplicar no dia da semana</label><select class="control" id="responsibility-weekday"><option value="1">Segunda-feira</option><option value="2">Terça-feira</option><option value="3">Quarta-feira</option><option value="4">Quinta-feira</option><option value="5">Sexta-feira</option></select></div><div class="actions"><button type="button" class="button button-secondary" data-action="responsibility-fill-weekday">Aplicar ao dia da semana</button><button type="button" class="button button-secondary" data-action="responsibility-fill-all">Aplicar a todos</button></div></div>` : ''}<div class="responsibility-days">${days.map(date => { const selected = saved.get(date)?.bond_unit_id || ''; return `<label class="responsibility-day"><span><strong>${new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(dateFrom(date))}</strong>${formatDate(date)}</span><select class="control day-context-select" data-responsibility-date="${date}" required><option value="">Selecione o CNES</option>${contexts.map(context => `<option value="${context.bond_unit_id}" ${context.bond_unit_id === selected ? 'selected' : ''}>${esc(context.cnes_code || '')} · ${esc(context.cnes_name || context.lotacao_name || 'Unidade')}</option>`).join('')}</select></label>`; }).join('')}</div></section>`;
  }
  function syncResponsibilityDraft() {
    const contexts = new Map(responsibilityContexts().map(context => [context.bond_unit_id, context]));
    state.request.dayResponsibilities = [...document.querySelectorAll('[data-responsibility-date]')]
      .filter(select => contexts.has(select.value))
      .map(select => ({ date: select.dataset.responsibilityDate, bond_unit_id: select.value, cnes_unit_id: contexts.get(select.value).cnes_unit_id }));
  }
  function preserveResponsibilities(periods) {
    const days = new Set(requestWorkDays(periods));
    const units = new Set(responsibilityContexts().map(context => context.bond_unit_id));
    return (state.request.dayResponsibilities || []).filter(item => days.has(item.date) && units.has(item.bond_unit_id));
  }
  function renderConfirm() {
    const r = state.request, rule = ruleSummary();
    app.innerHTML = shell('Revise antes de enviar', 'Confira principalmente os dados funcionais e as datas.', `<div class="summary">
      ${[['Servidor', r.name], ['Matrícula', r.registration], ['Modalidade', labelType(r.type)], ['Regra', rule.text], ['Lotação', r.unit]].map(([a, b]) => `<div class="summary-row"><span>${a}</span><strong>${esc(b)}</strong></div>`).join('')}
      ${r.periods.map((p, i) => `<div class="summary-row"><span>${r.periods.length > 1 ? `${i + 1}º período` : 'Período'}</span><strong>${formatDate(p.start_date)} a ${formatDate(p.end_date)} - retorno ${formatDate(p.return_date)}</strong></div>`).join('')}
      ${dayOffsInside(r.periods).map(day => `<div class="summary-row"><span>Day-off de aniversário</span><strong>${formatDate(day)} — não consome saldo</strong></div>`).join('')}
    </div>${renderCalendar(r.periods)}${renderResponsibilityPlanner()}<div class="field"><label for="notes">Observações</label><textarea class="control" id="notes" rows="3">${esc(r.notes)}</textarea></div><div class="notice">Ao enviar, você declara que os dados informados são verdadeiros e reconhece que o pedido depende da análise da chefia e do RH.</div><div class="actions"><button class="button button-secondary" data-go="dates">Voltar</button><button class="button button-primary" data-action="submit-request">Enviar solicitação</button></div>`, 76);
  }
  async function submitRequest() {
    const request = state.request, current = captureView();
    const contexts = new Map(responsibilityContexts().map(context => [context.bond_unit_id, context]));
    const responsibilities = [...document.querySelectorAll('[data-responsibility-date]')].map(select => ({ date: select.dataset.responsibilityDate, bond_unit_id: select.value, cnes_unit_id: contexts.get(select.value)?.cnes_unit_id || '' }));
    if (responsibilities.length !== requestWorkDays().length || responsibilities.some(item => !item.bond_unit_id || !item.cnes_unit_id)) return showToast('Defina o CNES responsável por todos os dias úteis.');
    state.request.dayResponsibilities = responsibilities;
    const btn = document.querySelector('[data-action="submit-request"]'); btn.disabled = true; btn.textContent = 'Enviando…'; state.request.notes = document.querySelector('#notes')?.value.trim() || '';
    try {
      const payload = { ...state.request, cpf: digits(state.request.cpf) }; if (payload.type === 'regulamentar') payload.addBankHours = ruleSummary().extra ? ruleSummary().extra * Number(payload.dailyHours || 8) : null; else payload.addBankHours = null;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-request`, { method: 'POST', headers: state.session ? sessionHeaders(state.session) : { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Não foi possível enviar a solicitação.');
      request.protocol = body.protocol; request.requestId = body.id; request.inclusionPending = Boolean(body.inclusion_pending);
      if (current() && state.request === request) go('receipt');
    } catch (error) { if (current() && state.request === request) { showToast(error.message); btn.disabled = false; btn.textContent = 'Enviar solicitação'; } }
  }
  function receiptData(source, stored = false) {
    const servidor = source.servidor || {};
    return { legacy:true, position:source.snapshot?.position, cbo:source.snapshot?.cbo, weeklyHours:source.snapshot?.weekly_hours, team:source.snapshot?.team, protocol: source.protocol || source.requestId || 'sem protocolo', type: source.type, status: stored ? source.status : 'enviada', name: stored ? servidor.full_name : source.name, registration: stored ? source.bond?.registration || servidor.matricula : source.registration, unit: stored ? source.context_cnes?.name || servidor.lotacao?.name : source.unit, birthDate: stored ? servidor.birth_date : source.birthDate, periods: source.periods || [], responsibilities: source.responsibilities || source.dayResponsibilities || [], notes: source.notes || '', inclusionPending: Boolean(source.inclusionPending), requestedAt: source.created_at || new Date().toISOString(), stored };
  }
  function receiptSubject(data) { return `SGF | Comprovante ${data.protocol} | ${data.name}`; }
  function receiptText(data, email = false) { return SGFRhReceipt.text({...data,dayOffs:dayOffsInside(data.periods,data.birthDate)},email); }
  async function copyText(value, success) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else { const area = document.createElement('textarea'); area.value = value; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); const copied = document.execCommand('copy'); area.remove(); if (!copied) throw new Error('copy'); }
      showToast(success);
    } catch { showToast('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.'); }
  }
  function renderReceiptPage(data, backRoute) {
    state.receiptContext = data; setProgress(100);
    const dayOffs = dayOffsInside(data.periods, data.birthDate);
    app.innerHTML = `<section class="card receipt-card">${SGFRhReceipt.document({...data,dayOffs})}<div class="receipt-tools no-print"><div><h3>Guardar o comprovante</h3><p>Confira os dados e siga o procedimento institucional. Documentos extensos podem ocupar mais de uma página.</p></div><div class="actions"><button class="button button-primary" data-action="print">Imprimir / salvar em PDF</button><button class="button button-secondary" data-action="copy-receipt-email">Copiar texto do e-mail</button><button class="button button-secondary" data-action="copy-receipt-data">Copiar dados</button><button class="button button-secondary" data-go="${backRoute}">Voltar</button></div></div></section>`;
  }
  function renderReceipt() { renderReceiptPage(receiptData(state.request), 'employee-dashboard'); }
  function renderStoredReceipt() { if (!state.selected) return go(accessHome(state.profile?.role)); renderReceiptPage(receiptData(state.selected, true), state.profile?.role === 'servidor' ? 'employee-detail' : 'detail'); }
  function applyLoginCooldown(seconds) {
    const duration = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (duration) writeLoginCooldown(Date.now() + duration * 1000);
    if (loginCooldownTimer && typeof clearInterval === 'function') clearInterval(loginCooldownTimer);
    const refresh = () => {
      const button = document.querySelector('#login-form button[type="submit"]');
      if (!button) { if (typeof clearInterval === 'function') clearInterval(loginCooldownTimer); return; }
      const remaining = Math.max(0, Math.ceil((readLoginCooldown() - Date.now()) / 1000));
      button.disabled = remaining > 0;
      button.textContent = remaining > 0 ? `Aguarde ${remaining}s` : 'Entrar no SGF';
      if (!remaining) { writeLoginCooldown(0); if (typeof clearInterval === 'function') clearInterval(loginCooldownTimer); loginCooldownTimer = null; }
    };
    refresh();
    if (readLoginCooldown() > Date.now() && typeof setInterval === 'function') loginCooldownTimer = setInterval(refresh, 250);
  }
  function renderLogin() {
    setProgress(0); app.innerHTML = `<section class="card auth-card"><div class="auth-main"><p class="eyebrow">Acesso ao SGF</p><h2>Entre na sua conta</h2><p class="lead">Use o login do RH da unidade ou o acesso da Administração.</p><form id="login-form" class="auth-form"><div class="field"><label for="access-identifier">Login da unidade, CPF ou e-mail</label><input class="control" id="access-identifier" required minlength="3" maxlength="160" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="access-identifier-help" placeholder="Digite seu login" autofocus><small id="access-identifier-help">Use o nome da unidade. A Administração também pode utilizar seu identificador de acesso.</small></div><div class="field"><div class="field-heading"><label for="access-password">Senha</label><button type="button" class="text-button" data-go="recover-password">Esqueceu a senha?</button></div><div class="password-field"><input class="control" id="access-password" type="password" required minlength="4" maxlength="72" autocomplete="current-password" placeholder="Digite sua senha"><button type="button" class="password-toggle" data-action="toggle-password" data-target="access-password" aria-label="Mostrar senha" aria-pressed="false">Mostrar</button></div></div><p id="login-error" class="form-error hidden" role="alert"></p><button class="button button-primary button-wide" type="submit">Entrar no SGF</button></form><button type="button" class="text-button auth-back" data-go="home">← Voltar ao início</button></div><aside class="auth-aside"><p class="eyebrow">Gestão pelo RH</p><h3>O calendário é o ponto de partida</h3><p>O RH seleciona seu operador autorizado e gerencia os afastamentos da unidade. A Administração acompanha as unidades e organiza os acessos.</p><p>Para habilitar um operador ou resolver problemas de acesso, procure o Administrador.</p><div class="auth-divider"></div><p><strong>Quer planejar as datas?</strong><br>A simulação está disponível sem login.</p><button type="button" class="text-button" data-go="quick">Abrir Simulação Rápida →</button></aside></section>`;
    applyLoginCooldown(0);
  }
  async function login(event) {
    event.preventDefault(); const button = event.submitter, identifier = document.querySelector('#access-identifier').value.trim(), password = document.querySelector('#access-password').value; button.disabled = true; button.textContent = 'Entrando…';
    try { const response = await fetch(`${SUPABASE_URL}/functions/v1/access-auth`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY }, body: JSON.stringify({ action: 'login', identifier, password }) }); const body = await response.json().catch(() => ({})); if (!response.ok) { const failure = new Error(body.error || 'Credenciais inválidas ou acesso indisponível.'); failure.retryAfter = Number(body.retry_after) || (response.status === 429 ? 15 : 3); throw failure; } sessionStorage.removeItem('sgf-access-role'); const { error } = await client.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token }); if (error) throw error; await loadSession(); if (!state.profile) throw new Error('Senha aceita, mas não foi possível carregar seu perfil. Tente novamente.'); go(body.must_change_password ? 'change-password' : state.profile.role ? accessHome(state.profile.role) : 'choose-access'); }
    catch (error) { const message = document.querySelector('#login-error'); if (message) { message.textContent = error.message; message.classList.remove('hidden'); } else showToast(error.message); applyLoginCooldown(error.retryAfter || 3); }
  }
  const nextAccessFieldKey = prefix => `${prefix}-${++state.accessFieldSequence}`;
  const sortedCnesUnits = items => [...items].sort((a,b) => String(a.name || '').trim().localeCompare(String(b.name || '').trim(), 'pt-BR', {sensitivity:'base',numeric:true}) || String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR', {numeric:true}));
  const catalogOptions = (items, placeholder, label) => `<option value="">${placeholder}</option>${items.map(item => `<option value="${item.id}">${esc(label(item))}</option>`).join('')}`;
  function accessUnitMarkup(bondKey, unitKey = nextAccessFieldKey('unit')) {
    const catalogs = state.registrationCatalogs;
    return `<fieldset class="access-unit-card" data-access-unit data-unit-key="${unitKey}"><legend>CNES de atuação</legend><div class="form-grid"><div class="field field-full"><label for="${unitKey}-cnes">CNES / unidade responsável</label><select class="control access-cnes" id="${unitKey}-cnes" required>${catalogOptions(sortedCnesUnits(catalogs.cnesUnits), 'Selecione a unidade', item => `${item.code} · ${item.name}`)}</select></div><div class="field"><label for="${unitKey}-hours">Carga semanal neste CNES</label><input class="control access-unit-hours" id="${unitKey}-hours" type="number" min="1" max="80" inputmode="numeric"><small>Opcional; use quando a jornada for dividida.</small></div><div class="field" hidden><label for="${unitKey}-allocation">Lotação interna da Secretaria</label><select class="control access-allocation" id="${unitKey}-allocation" disabled><option value="">Não se aplica</option></select><small>Disponível somente para subdivisões de Secretarias.</small></div><div class="field"><label for="${unitKey}-team-type">Tipo de equipe</label><select class="control access-team-type" id="${unitKey}-team-type" required><option value="">Selecione</option>${catalogs.teamTypes.map(item => `<option value="${item.code}">${esc(item.name)}</option>`).join('')}<option value="nao_se_aplica">Não se aplica</option></select></div><div class="field"><label for="${unitKey}-team">Equipe da unidade</label><select class="control access-team" id="${unitKey}-team" disabled><option value="">Escolha primeiro CNES e tipo</option></select></div></div><div class="actions actions-end"><button type="button" class="text-button" data-access-remove-unit>Remover este CNES</button></div></fieldset>`;
  }
  function accessBondMarkup() {
    const key = nextAccessFieldKey('bond'), catalogs = state.registrationCatalogs;
    return `<section class="access-bond-card" data-access-bond data-bond-key="${key}"><div class="access-card-heading"><div><p class="eyebrow">Vínculo funcional</p><h3>Dados da matrícula</h3></div><button type="button" class="text-button" data-access-remove-bond>Remover vínculo</button></div><div class="form-grid"><div class="field"><label for="${key}-registration">Matrícula</label><input class="control access-registration" id="${key}-registration" required></div><div class="field"><label for="${key}-position">Cargo</label><select class="control access-position" id="${key}-position" required>${catalogOptions(catalogs.positions, 'Selecione o cargo', item => item.name)}</select></div><div class="field"><label for="${key}-employment">Tipo de vínculo</label><input class="control access-employment" id="${key}-employment" required placeholder="Ex.: efetivo, contratado"></div><div class="field"><label for="${key}-hours">Jornada semanal total</label><input class="control access-bond-hours" id="${key}-hours" type="number" min="1" max="80" inputmode="numeric"></div><div class="field field-full"><label for="${key}-pole">Unidade polo (se houver)</label><select class="control access-pole" id="${key}-pole">${catalogOptions(sortedCnesUnits(catalogs.cnesUnits), 'Sem unidade polo', item => `${item.code} · ${item.name}`)}</select></div></div><div class="access-units" data-access-units>${accessUnitMarkup(key)}</div><div class="actions"><button type="button" class="button button-secondary" data-access-add-unit>+ Adicionar outro CNES</button></div></section>`;
  }
  function updateAccessUnitOptions(unitCard) {
    if (!unitCard) return;
    const cnesId = unitCard.querySelector('.access-cnes').value;
    const type = unitCard.querySelector('.access-team-type').value;
    const teamSelect = unitCard.querySelector('.access-team');
    const previousTeam = teamSelect.value;
    const teams = state.registrationCatalogs.teams.filter(team => team.cnes_unit_id === cnesId && team.type_code === type);
    teamSelect.innerHTML = type === 'nao_se_aplica' ? '<option value="">Não se aplica</option>' : catalogOptions(teams, teams.length ? 'Selecione a equipe' : 'Nenhuma equipe cadastrada', item => item.name);
    teamSelect.value = teams.some(team => team.id === previousTeam) && type !== 'nao_se_aplica' ? previousTeam : '';
    teamSelect.disabled = type === 'nao_se_aplica' || !cnesId || !type || !teams.length;
    teamSelect.required = type !== 'nao_se_aplica';
    const allocationSelect = unitCard.querySelector('.access-allocation');
    const previousAllocation = allocationSelect.value;
    const allocations = state.registrationCatalogs.internalAllocations.filter(item => (item.lotacao_cnes_units || []).some(mapping => mapping.cnes_unit_id === cnesId));
    allocationSelect.innerHTML = catalogOptions(allocations, 'Não se aplica', item => item.name);
    allocationSelect.value = allocations.some(item => item.id === previousAllocation) ? previousAllocation : '';
    allocationSelect.disabled = !allocations.length;
    allocationSelect.closest('.field').hidden = !allocations.length;
  }
  let accessCatalogLoad = 0;
  async function renderAccessRequest() {
    const load = ++accessCatalogLoad;
    const current = () => load === accessCatalogLoad && state.route === 'access-request';
    setProgress(0);
    try { const response = await fetch(`${SUPABASE_URL}/functions/v1/access-auth`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify({ action: 'registration-catalogs' }) }); const body = await response.json(); if (!current()) return; if (!response.ok) throw new Error(body.error || 'Cadastros indisponíveis.'); state.registrationCatalogs = body; } catch (error) { if (!current()) return; app.innerHTML = shell('Solicitar acesso', 'Não foi possível carregar CNES, cargos e equipes. Atualize a página para tentar novamente.', `<div class="notice notice-danger">${esc(error.message)}</div>`); return; }
    app.innerHTML = shell('Solicitar acesso', 'Cadastre seus dados uma única vez e inclua todas as matrículas e unidades em que trabalha.', `<form id="access-request-form"><div class="form-grid"><div class="form-section-heading field-full"><span class="step-number">1</span><div><h3>Dados pessoais</h3><p>CPF e e-mail identificam uma única pessoa, mesmo com vários vínculos.</p></div></div><div class="field"><label for="access-name">Nome completo</label><input class="control" id="access-name" required autocomplete="name"></div><div class="field"><label for="access-email">E-mail institucional</label><input class="control" id="access-email" type="email" required pattern="[^@\s]+@betim\.mg\.gov\.br" placeholder="nome@betim.mg.gov.br" autocomplete="email"></div><div class="field"><label for="access-cpf">CPF</label><input class="control" id="access-cpf" required inputmode="numeric" maxlength="14" autocomplete="off"></div><div class="field"><label for="access-birth-date">Data de nascimento</label><input class="control" id="access-birth-date" type="date" required></div><div class="form-section-heading field-full"><span class="step-number">2</span><div><h3>Vínculos e unidades</h3><p>Adicione cada matrícula e todos os CNES responsáveis por aprovar suas solicitações.</p></div></div></div><div id="access-bonds">${accessBondMarkup()}</div><div class="actions"><button type="button" class="button button-secondary" data-access-add-bond>+ Adicionar vínculo</button></div><div class="notice">A equipe é escolhida separadamente para cada CNES. Use <strong>Não se aplica</strong> para atividades administrativas sem equipe assistencial.</div><div class="actions actions-end"><button type="button" class="button button-secondary" data-go="login">Voltar ao login</button><button class="button button-primary" type="submit">Enviar solicitação de acesso</button></div></form>`);
  }
  async function requestAccess(event) {
    event.preventDefault();
    const button = event.submitter;
    const bonds = [...document.querySelectorAll('[data-access-bond]')].map(bond => ({
      registration: bond.querySelector('.access-registration').value.trim(),
      cargo_id: bond.querySelector('.access-position').value,
      employment_type: bond.querySelector('.access-employment').value.trim(),
      weekly_hours: bond.querySelector('.access-bond-hours').value || null,
      pole_cnes_unit_id: bond.querySelector('.access-pole').value || null,
      units: [...bond.querySelectorAll('[data-access-unit]')].map(unit => ({
        cnes_unit_id: unit.querySelector('.access-cnes').value,
        internal_lotacao_id: unit.querySelector('.access-allocation').value || null,
        team_id: unit.querySelector('.access-team-type').value === 'nao_se_aplica' ? null : unit.querySelector('.access-team').value,
        not_applicable: unit.querySelector('.access-team-type').value === 'nao_se_aplica',
        weekly_hours: unit.querySelector('.access-unit-hours').value || null,
      })),
    }));
    const payload = { action: 'request-access', name: document.querySelector('#access-name').value.trim(), email: document.querySelector('#access-email').value.trim(), cpf: digits(document.querySelector('#access-cpf').value), birthDate: document.querySelector('#access-birth-date').value, bonds };
    if (!validCPF(payload.cpf)) return showToast('Informe um CPF válido.');
    if (!institutionalEmail(payload.email)) return showToast('Use seu e-mail institucional @betim.mg.gov.br.');
    if (!bonds.length || bonds.some(bond => !bond.registration || !bond.cargo_id || !bond.employment_type || !bond.units.length || bond.units.some(unit => !unit.cnes_unit_id || (!unit.not_applicable && !unit.team_id)))) return showToast('Confira matrícula, cargo, vínculo, CNES e equipe de todos os vínculos.');
    button.disabled = true; button.textContent = 'Enviando…';
    try { const response = await fetch(`${SUPABASE_URL}/functions/v1/access-auth`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY }, body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Não foi possível solicitar o acesso.'); app.innerHTML = shell('Solicitação enviada', 'O RH ou administrador conferirá seus vínculos antes de emitir a conta.', '<div class="notice">Após a aprovação, entre com CPF ou e-mail e a senha provisória 123456. Você deverá escolher uma senha pessoal no primeiro login.</div><div class="actions"><button class="button button-primary" data-go="login">Voltar ao login</button></div>'); }
    catch (error) { showToast(error.message); button.disabled = false; button.textContent = 'Enviar solicitação de acesso'; }
  }
  function renderRecoverPassword() {
    setProgress(0); app.innerHTML = shell('Recuperar senha', 'Informe seu CPF ou e-mail. Se houver uma conta vinculada, enviaremos as instruções ao e-mail cadastrado. Contas administrativas antigas também podem informar o login.', `<form id="recover-password-form" class="form-grid"><div class="field field-full"><label for="recover-identifier">CPF ou e-mail</label><input class="control" id="recover-identifier" required minlength="3" maxlength="160" autocomplete="username" autofocus></div><div class="field field-full"><div class="actions actions-end"><button type="button" class="button button-secondary" data-go="login">Voltar ao login</button><button class="button button-primary" type="submit">Enviar instruções</button></div></div></form>`);
  }
  async function recoverPassword(event) {
    event.preventDefault(); const button = event.submitter; button.disabled = true; button.textContent = 'Enviando…';
    try { const response = await fetch(`${SUPABASE_URL}/functions/v1/access-auth`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY }, body: JSON.stringify({ action: 'recover', identifier: document.querySelector('#recover-identifier').value.trim(), redirectTo: `${window.location.origin}${window.location.pathname}` }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Não foi possível iniciar a recuperação.'); app.innerHTML = shell('Confira seu e-mail', 'Se houver uma conta vinculada ao identificador, enviaremos as instruções para redefinir a senha.', '<div class="actions"><button class="button button-primary" data-go="login">Voltar ao login</button></div>'); }
    catch (error) { showToast(error.message); button.disabled = false; button.textContent = 'Enviar instruções'; }
  }
  function renderSetPassword() {
    if (state.recoveryError || !state.session) {
      setProgress(0); app.innerHTML = shell('Recuperação de senha', state.recoveryError || 'A sessão de recuperação não está disponível neste navegador. Solicite um novo e-mail e abra o link mais recente.', '<button class="button button-primary" data-go="recover-password">Solicitar novo e-mail</button>'); return;
    }
    setProgress(0); app.innerHTML = shell('Defina sua senha', 'Crie uma senha pessoal para concluir o convite ou a recuperação.', `<form id="set-password-form" class="form-grid"><div class="field"><label for="set-password">Nova senha</label><input class="control" id="set-password" type="password" required minlength="${passwordMin(state.profile?.roles)}" maxlength="72" autocomplete="new-password"></div><div class="field"><label for="set-password-confirmation">Confirme a senha</label><input class="control" id="set-password-confirmation" type="password" required minlength="${passwordMin(state.profile?.roles)}" maxlength="72" autocomplete="new-password"></div><div class="field field-full"><div class="actions"><button class="button button-primary">Salvar senha</button></div></div></form>`);
  }
  function renderChangePassword() {
    if (!state.session || !state.profile) return go('login');
    setProgress(0); app.innerHTML = shell('Troque sua senha inicial', 'Antes de abrir o painel, defina uma senha pessoal para esta conta.', `<form id="change-password-form" class="form-grid"><div class="field"><label for="new-password">Nova senha</label><input class="control" id="new-password" type="password" required minlength="${passwordMin(state.profile?.roles)}" maxlength="72" autocomplete="new-password"><small>Use pelo menos ${passwordMin(state.profile?.roles)} caracteres para o maior acesso da conta.</small></div><div class="field"><label for="confirm-password">Confirme a nova senha</label><input class="control" id="confirm-password" type="password" required minlength="${passwordMin(state.profile?.roles)}" maxlength="72" autocomplete="new-password"></div><div class="field field-full"><div class="actions"><button class="button button-primary">Salvar nova senha</button></div></div></form><div class="notice notice-warning">O acesso ao gerenciamento será liberado somente depois desta alteração.</div>`);
  }
  async function changePassword(event) {
    event.preventDefault(); const button = event.submitter, password = document.querySelector('#new-password').value, confirmation = document.querySelector('#confirm-password').value; if (password !== confirmation) return showToast('As senhas informadas não coincidem.'); await saveNewPassword(button, password);
  }
  async function setPassword(event) { event.preventDefault(); const button = event.submitter, password = document.querySelector('#set-password').value, confirmation = document.querySelector('#set-password-confirmation').value; if (password !== confirmation) return showToast('As senhas informadas não coincidem.'); await saveNewPassword(button, password); }
  async function saveNewPassword(button, password) {
    if (password.length < passwordMin(state.profile?.roles) || password.length > 72) return showToast(`A senha deve ter entre ${passwordMin(state.profile?.roles)} e 72 caracteres.`);
    button.disabled = true; button.textContent = 'Salvando…';
    try { const { data, error: sessionError } = await client.auth.getSession(); if (sessionError) throw new Error('Não foi possível confirmar sua sessão. Confira a conexão e tente novamente.'); const session = data.session; if (!session || state.recoveryError) throw new Error('A sessão de recuperação não está disponível neste navegador. Solicite um novo e-mail.'); const response = await fetch(`${SUPABASE_URL}/functions/v1/access-auth`, { method: 'POST', headers: sessionHeaders(session), body: JSON.stringify({ action: 'change-password', password }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Não foi possível alterar a senha.'); await loadSession(); history.replaceState({}, document.title, window.location.pathname); showToast('Senha definida com sucesso.'); go(state.profile?.role ? accessHome(state.profile.role) : 'choose-access'); }
    catch (error) { showToast(error.message); button.disabled = false; button.textContent = 'Salvar senha'; }
  }
  async function initializeAuthSession() {
    if (!client) return;
    if (passwordCallback || callbackError) {
      try {
        if (callbackError) throw new Error('Este link não pôde ser validado. Solicite um novo e-mail e use somente o link mais recente.');
        const access_token = callbackParams.get('access_token'), refresh_token = callbackParams.get('refresh_token');
        if (!access_token || !refresh_token) throw new Error('O link de recuperação está incompleto. Solicite um novo e-mail.');
        // Await persistence before rendering the form; never fall back to another stored account.
        const { data, error } = await client.auth.setSession({ access_token, refresh_token }).catch(() => ({ data: null, error: true }));
        if (error || !data?.session) throw new Error('Não foi possível iniciar a sessão de recuperação. Confira a conexão e solicite um novo e-mail se necessário.');
        state.session = data.session;
        sessionStorage.removeItem('sgf-access-role');
        sessionStorage.removeItem('sgf-access-context');
      } catch (error) {
        state.session = null; state.profile = null; state.recoveryError = error.message;
        return;
      } finally {
        callbackParams.delete('access_token'); callbackParams.delete('refresh_token');
        history.replaceState({}, document.title, window.location.pathname);
      }
    }
    await loadSession();
  }
  async function loadSession() {
    if (!client) return;
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw new Error('Não foi possível confirmar sua sessão.');
    state.session = data.session;
    if (!state.session) { state.profile = null; state.accessContexts = []; state.activeContext = null; sessionStorage.removeItem('sgf-access-role'); sessionStorage.removeItem('sgf-access-context'); return; }
    let { data: profile, error: profileError } = await client.from('profiles').select('id,full_name,roles,institutional_cnes_unit_id,must_change_password,disabled_at,primary_lotacao:lotacoes!profiles_primary_lotacao_id_fkey(name),servidor:servidores(declared_position,cargo:cargos(name),lotacao:lotacoes!servidores_lotacao_id_fkey(name))').eq('id', state.session.user.id).single();
    if (profileError?.code === '42703' && profileError.message?.includes('roles')) {
      ({ data: profile, error: profileError } = await client.from('profiles').select('id,full_name,role,must_change_password,servidor:servidores(declared_position,cargo:cargos(name),lotacao:lotacoes!servidores_lotacao_id_fkey(name))').eq('id', state.session.user.id).single());
      if (profile) profile.roles = [profile.role];
      state.multiAccess = false;
    } else {
      state.multiAccess = true;
    }
    if (profileError) { console.error('profile-load', profileError.code, profileError.message); throw new Error('Não foi possível carregar seu perfil. Tente novamente.'); }
    if (!profile) { state.profile = null; return; }
    if (profile.disabled_at) { await client.auth.signOut(); state.session = null; state.profile = null; state.accessContexts = []; state.activeContext = null; sessionStorage.removeItem('sgf-access-context'); sessionStorage.removeItem('sgf-access-role'); return; }
    let contexts = [];
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/access-auth`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${state.session.access_token}` }, body: JSON.stringify({ action: 'contexts' }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && state.multiAccess) throw new Error('Não foi possível validar os acessos atuais. Entre novamente ou procure o Administrador.');
      if (response.ok) contexts = body.contexts || [];
    } catch (error) {
      if (state.multiAccess) {
        state.profile = null; state.accessContexts = []; state.activeContext = null;
        sessionStorage.removeItem('sgf-access-context'); sessionStorage.removeItem('sgf-access-role');
        throw new Error('Não foi possível validar os acessos atuais. Entre novamente ou procure o Administrador.');
      }
    }
    if (!contexts.length && !state.multiAccess) contexts = (profile.roles || []).map(role => ({ role, legacy: true }));
    state.accessContexts = contexts;
    let savedContext = null;
    try { savedContext = JSON.parse(sessionStorage.getItem('sgf-access-context') || 'null'); } catch { sessionStorage.removeItem('sgf-access-context'); }
    const contextKey = item => [item.role, item.bond_id || '', item.cnes_unit_id || '', item.lotacao_id || '', item.global ? 'global' : ''].join(':');
    const activeContext = contexts.find(item => savedContext && contextKey(item) === contextKey(savedContext)) || (contexts.length === 1 ? contexts[0] : null);
    const role = activeContext?.role || null;
    if (activeContext) { sessionStorage.setItem('sgf-access-context', JSON.stringify(activeContext)); sessionStorage.setItem('sgf-access-role', role); }
    else { sessionStorage.removeItem('sgf-access-context'); sessionStorage.removeItem('sgf-access-role'); }
    state.activeContext = activeContext;
    state.profile = { ...profile, role };
    state.rhState = null;
    sessionAction.classList.remove('hidden');
  }
  async function loadRequests() { const current = captureView(); const { data, error } = await client.from('vacation_requests').select('id,context_bond_id,replaces_request_id,protocol,type,status,calendar_adjustment_state,calendar_pending_dates,calendar_adjustment_reason,start_date,end_date,return_date,requested_hours,created_at,notes,bond:employment_bonds!vacation_requests_context_bond_id_fkey(registration),context_cnes:cnes_units!vacation_requests_context_cnes_unit_id_fkey(code,name),servidor:servidores(id,full_name,matricula,birth_date,lotacao:lotacoes!servidores_lotacao_id_fkey(id,name),cargo:cargos(id,name),funcao:funcoes(id,name),time_bank_accounts(declared_minutes,validated_minutes),time_bank_entries(id,minutes,description,occurred_on,validated,request_id)),periods:request_periods(*),responsibilities:request_day_responsibilities(responsibility_date,bond_unit_id,cnes:cnes_units(code,name),lotacao:lotacoes(name)),unit_reviews:request_unit_reviews(id,lotacao_id,lotacao:lotacoes(id,name),status,notes,rejection_code,rejection_label,version,decided_at,scheduled_at,cnes:cnes_units(id,code,name),decided_by:profiles!request_unit_reviews_decided_by_fkey(full_name),scheduled_by:profiles!request_unit_reviews_scheduled_by_fkey(full_name)),approvals:request_approvals(id,stage,decision,notes,rejection_code,rejection_label,version,decided_at,decided_by:profiles(full_name)),status_history:request_status_history(id,previous_status,new_status,notes,occurred_at,actor:profiles(full_name))').order('created_at', { ascending: false }); if (!current()) return; if (error) throw error; state.requests = data || []; }
  async function loadScaleEmployees() { const data = await operationRequest({ action: 'unit-calendar', month: state.scale.month }); state.scaleEmployees = data.employees || []; state.scaleRequests = data.requests || []; }
  function renderApprovals(approvals = []) { const ordered = ['chefia_imediata', 'rh'].map(stage => approvals.find(item => item.stage === stage) || { stage, decision: 'pendente' }); return `<div class="summary">${ordered.map(item => `<div class="summary-row"><span>${labelApprovalStage(item.stage)}</span><strong>${labelApprovalDecision(item.decision)}${item.decided_by?.full_name ? ` · ${esc(item.decided_by.full_name)}` : ''}${item.decided_at ? `<br><small>${formatDateTime(item.decided_at)}</small>` : ''}${item.rejection_label ? `<br><small>Motivo: ${esc(item.rejection_label)}</small>` : ''}${item.notes ? `<br><small>${esc(item.notes)}</small>` : ''}</strong></div>`).join('')}</div>`; }
  function renderUnitReviews(reviews = []) { return `<div class="summary">${reviews.map(review => `<div class="summary-row"><span>${esc(review.cnes?.code ? `CNES ${review.cnes.code}` : 'Unidade')}<br><small>${esc(review.cnes?.name || '')}${review.lotacao?.name ? ` · ${esc(review.lotacao.name)}` : ''}</small></span><strong>${esc(labelUnitReview(review.status))}${review.decided_by?.full_name ? `<br><small>Decisão: ${esc(review.decided_by.full_name)} · ${formatDateTime(review.decided_at)}</small>` : ''}${review.scheduled_by?.full_name ? `<br><small>Calendário: ${esc(review.scheduled_by.full_name)} · ${formatDateTime(review.scheduled_at)}</small>` : ''}${review.rejection_label ? `<br><small>Motivo: ${esc(review.rejection_label)}</small>` : ''}${review.notes ? `<br><small>${esc(review.notes)}</small>` : ''}</strong></div>`).join('')}</div>`; }
  function renderHistory(history = []) { return `<div class="summary">${[...history].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).map(item => `<div class="summary-row"><span>${formatDateTime(item.occurred_at)}<br><small>${esc(item.actor?.full_name || 'Sistema')}</small></span><strong>${item.previous_status ? `${labelStatus(item.previous_status)} → ` : ''}${labelStatus(item.new_status)}${item.notes ? `<br><small>${esc(item.notes)}</small>` : ''}</strong></div>`).join('') || '<p>Nenhuma mudança registrada.</p>'}</div>`; }
  async function operationRequest(payload) { const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-operations`, { method: 'POST', headers: sessionHeaders(state.session), body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.'); return body; }
  async function loadArchives() { const current = captureView(); const body = await operationRequest({ action: 'archives' }); if (current()) state.archivedRequestIds = new Set(body.request_ids || []); }
  async function requestConflicts(request) {
    const current = captureView(), months = new Set();
    for (const period of request.periods || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(period.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(period.end_date)) throw new Error('Datas indisponíveis para conferir conflitos.');
      let month = period.start_date.slice(0, 7); const end = period.end_date.slice(0, 7);
      for (let i = 0; month <= end && i < 120; i++) {
        months.add(month); const [year, number] = month.split('-').map(Number);
        month = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 7);
      }
      if (month <= end) throw new Error('Consulte conflitos por intervalo no calendário.');
    }
    const batches = [];
    for (const month of months) {
      if (!current()) return [];
      batches.push(await operationRequest({action:'unit-calendar',month}));
    }
    if (!current()) return [];
    const projections = new Map();
    for (const item of batches.flatMap(batch=>batch.requests || [])) {
      const key = item.id + ':' + item.row_id, previous = projections.get(key);
      projections.set(key, previous ? {...item, periods:[...new Map([...previous.periods,...item.periods].map(p=>[p.start_date+':'+p.end_date,p])).values()], assigned_dates:item.assigned_dates ? [...new Set([...(previous.assigned_dates || []),...item.assigned_dates])] : null} : item);
    }
    const requests = [...projections.values()].filter(item=>state.scale.mode === 'planning' || item.calendar_confirmed);
    const onLeave = (item,day)=>SGFScaleRange.activeOn(item.servidor,day) && (item.assigned_dates
      ? item.assigned_dates.includes(day) && !CALENDAR_EVENTS.has(day) && item.servidor?.birth_date?.slice(5) !== day.slice(5)
      : (item.periods || []).some(p=>p.start_date <= day && p.end_date >= day));
    return [...new Map(requests.filter(item=>item.id===request.id).flatMap(item=>SGFScaleConflicts.overlaps(item,requests,state.scale.conflictCriterion,onLeave)).map(item=>[item.id,item])).values()];
  }
  async function prepareEmployeeRequest() {
    if (!state.session || state.profile?.role !== 'servidor') return go('login');
    const { data, error } = await client.from('servidores').select('full_name,cpf,birth_date,matricula,admission_date,employment_type,declared_position,declared_unit,lotacao:lotacoes!servidores_lotacao_id_fkey(name),cargo:cargos(name),funcao:funcoes(name)').eq('profile_id', state.session.user.id).single();
    if (error) return showToast('Não foi possível carregar seus dados funcionais.');
    const context = state.activeContext || {};
    Object.assign(state.request, { type: '', periods: [], notes: '', protocol: '', requestId: '', inclusionPending: false, name: data.full_name || '', cpf: formatCPF(data.cpf || ''), birthDate: data.birth_date || '', registration: context.registration || data.matricula || '', admissionDate: data.admission_date || '', employmentType: data.employment_type === 'pendente' ? '' : data.employment_type || '', position: context.position || data.cargo?.name || data.declared_position || '', functionName: data.funcao?.name || '', unit: context.cnes_name || context.lotacao_name || data.lotacao?.name || data.declared_unit || '' });
    if(context.bond_id) {
      try { const resources=await operationRequest({action:'bond-resources',bond_id:context.bond_id}); if(state.activeContext!==context) return;
        state.requestResources=resources; state.request.rightId='';
        state.request.admissionDate=resources.bond.admission_date || ''; state.request.employmentType=resources.bond.employment_type || '';
      } catch(error) { return showToast(error.message); }
    }
    go('types');
  }
  async function renderEmployeeDashboard() {
    const current = captureView();
    setProgress(0); if (!state.session) { await loadSession(); if (!state.session) return go('login'); } if (state.profile?.role !== 'servidor') return go('dashboard'); app.innerHTML = '<section class="card loading-card"><div class="spinner"></div><p>Carregando seus pedidos…</p></section>';
    try { await loadRequests(); } catch (error) { if (!current()) return; app.innerHTML = shell('Não foi possível carregar seus pedidos', 'Tente novamente em alguns instantes.', `<div class="notice notice-danger">${esc(error.message)}</div>`); return; }
    if (!current()) return;
    const pending = state.requests.filter(r => ['enviada', 'em_analise'].includes(r.status)).length;
    app.innerHTML = `<section class="card"><div class="toolbar"><div><p class="eyebrow">Área do servidor</p><h2>Registros anteriores</h2><p class="lead">${esc(state.profile.full_name)}</p></div><div class="actions"><button class="button button-secondary" data-action="employee-refresh">Atualizar</button></div></div><div class="stats"><div class="stat"><strong>${state.requests.length}</strong><span>Total de protocolos</span></div><div class="stat"><strong>${pending}</strong><span>Em andamento</span></div><div class="stat"><strong>${state.requests.filter(r => ['aprovada', 'programada', 'concluida'].includes(r.status)).length}</strong><span>Aprovados/programados</span></div></div><div class="table-wrap" style="margin-top:1.5rem"><table><thead><tr><th>Protocolo</th><th>Modalidade</th><th>Período</th><th>Retorno</th><th>Situação</th><th></th></tr></thead><tbody>${state.requests.map(r => `<tr><td>${esc(r.protocol || r.id.slice(0, 8))}</td><td>${labelType(r.type)}</td><td>${formatDate(r.start_date)} a ${formatDate(r.end_date)}</td><td>${formatDate(r.return_date)}</td><td><span class="badge badge-${r.status}">${labelStatus(r.status)}</span></td><td><button class="button button-secondary" data-request="${r.id}">Ver detalhes</button></td></tr>`).join('') || '<tr><td colspan="6">Você ainda não possui solicitações.</td></tr>'}</tbody></table></div></section>`;
  }
  async function renderEmployeeDetail() {
    const r = state.selected; if (!r) return go('employee-dashboard');
    state.distributionEditor = null;
    if (r.unit_reviews?.length) {
      try { const result = await operationRequest({action:'pending-distribution-editor',request_id:r.id}); if (state.selected !== r || state.route !== 'employee-detail') return; state.distributionEditor = result.distribution; }
      catch (error) { if (state.selected !== r || state.route !== 'employee-detail') return; showToast(error.message); }
    }
    const correction = r.status === 'devolvida' ? `<section class="decision-panel"><h3>Correção solicitada</h3><p>Leia a justificativa no histórico, escreva sua resposta e reenvie o pedido. Caso precise cancelar, procure o RH.</p><div class="field"><label for="decision-notes">Resposta ou justificativa</label><textarea class="control" id="decision-notes" rows="3" required></textarea></div><div class="actions"><button class="button button-primary" data-operation="reenviar">Reenviar solicitação</button></div></section>` : '';
    const reviewProgress = r.unit_reviews?.length ? `<h3>Análise por CNES</h3>${renderUnitReviews(r.unit_reviews)}` : `<h3>Etapas de aprovação</h3>${renderApprovals(r.approvals)}`;
    app.innerHTML = shell(`Protocolo ${esc(r.protocol || r.id.slice(0, 8))}`, labelType(r.type), `<button class="text-button" data-go="employee-dashboard">← Voltar aos pedidos</button><div class="summary"><div class="summary-row"><span>Situação</span><strong><span class="badge badge-${r.status}">${labelStatus(r.status)}</span></strong></div><div class="summary-row"><span>Solicitado em</span><strong>${formatDate(r.created_at)}</strong></div>${(r.periods || []).map((p, i) => `<div class="summary-row"><span>${r.periods.length > 1 ? `${i + 1}º período` : 'Período'}</span><strong>${formatDate(p.start_date)} a ${formatDate(p.end_date)} · retorno ${formatDate(p.return_date)}</strong></div>`).join('')}${r.notes ? `<div class="summary-row"><span>Observações</span><strong>${esc(r.notes)}</strong></div>` : ''}</div>${reviewProgress}${correction}<details class="work-panel"><summary>Histórico da solicitação</summary>${renderHistory(r.status_history)}</details><details class="work-panel"><summary>Ver calendário do afastamento</summary>${renderCalendar(r.periods, r.servidor?.birth_date)}</details><p class="page-footnote">O acompanhamento mostra o andamento do pedido. O afastamento depende da decisão administrativa.</p>`);
    document.querySelector('.summary')?.insertAdjacentHTML('afterend', renderCalendarAdjustment(r));
    showRevisionRelation(r);
    document.querySelector('.summary')?.insertAdjacentHTML('afterend', renderDistributionEditor());
    document.querySelector('.page-footnote')?.insertAdjacentHTML('beforebegin', '<div class="actions"><button class="button button-primary" data-go="stored-receipt">Reimprimir comprovante</button><button class="button button-secondary" data-action="copy-selected-email">Copiar texto do e-mail</button><button class="button button-secondary" data-action="copy-selected-data">Copiar dados</button></div>');
  }
  function renderAccessChoice() {
    if (!state.session || !state.profile) return go('login');
    setProgress(0);
    const accessDescription = role => role === 'servidor'
      ? 'Seus pedidos e novas solicitações.'
      : role === 'diretor'
        ? 'Planejamento, análise e autorização no seu escopo.'
        : role === 'rh'
          ? 'Análises, etapas de aprovação e cadastros do seu escopo.'
          : 'Gestão de acessos, perfis e cadastros.';
    const contexts = state.accessContexts;
    if (!contexts.length) { app.innerHTML = shell('Nenhum acesso disponível', 'Sua conta não possui vínculo ou escopo ativo. Procure o Administrador ou a TI da Prefeitura de Betim.', '<button class="button button-secondary" data-go="home">Tela inicial</button>'); return; }
    app.innerHTML = shell('Escolha seu perfil e local de atuação', `Olá, ${esc(state.profile.full_name)}. Selecione em qual vínculo, CNES ou lotação deseja trabalhar agora.`, `<div class="choice-grid access-choice-grid">${contexts.map((context, index) => {
      const title = context.global ? 'Visão administrativa geral' : context.cnes_name || context.lotacao_name || accessLabel(context.role);
      const details = [context.registration ? `Matrícula ${context.registration}` : '', context.position, context.team_name, context.cnes_code ? `CNES ${context.cnes_code}` : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="choice ${state.activeContext === context ? 'choice-featured' : ''}" data-access-context="${index}"><span class="choice-kicker">${accessLabel(context.role)}</span><strong>${esc(title)} →</strong><span>${esc(details || accessDescription(context.role))}</span></button>`;
    }).join('')}</div><p class="page-footnote">O contexto selecionado acompanha as operações e pode ser trocado pelo menu a qualquer momento.</p>`);
  }
  async function activateAccess(contextIndex) {
    const selected = state.accessContexts[Number(contextIndex)] || null;
    if (!selected) return showToast('Acesso não autorizado.');
    try { await loadSession(); } catch (error) { showToast(error.message); return go('login'); }
    const key = item => [item.role, item.bond_id || '', item.cnes_unit_id || '', item.lotacao_id || '', Boolean(item.global)].join(':');
    const context = state.accessContexts.find(item => key(item) === key(selected)) || null;
    const role = context?.role;
    if (!context || !state.profile?.roles?.includes(role)) { showToast('Este acesso foi alterado ou revogado. Selecione um contexto vigente.'); return go(state.profile ? 'choose-access' : 'login'); }
    if (state.profile.must_change_password) return go('change-password');
    sessionStorage.setItem('sgf-access-role', role);
    sessionStorage.setItem('sgf-access-context', JSON.stringify(context));
    state.activeContext = context;
    clearToast();
    state.profile.role = role;
    state.requests = []; state.selected = null;
    state.requestResources = null; state.resourceBond = null; state.detailBondResources = null; state.organization = null;
    state.catalog = { employees: [], locations: [], positions: [], functions: [], managers: [], managerScopes: [], actorRole: '' };
    state.accessRequests = []; state.inclusions = []; state.profiles = []; state.profileLocations = [];
    state.distributionEditor = null; state.rejectionReasons = []; state.conflictEmployees = [];
    state.minimumScale = []; state.minimumScaleDays = []; state.archivedRequestIds = new Set();
    state.scaleEmployees = []; state.scaleRequests = []; state.manualConflicts = []; state.notifications = []; state.notificationsPage = 0; state.notificationsHasMore = false; state.auditFilter = null;
    Object.assign(state.scale, { cnes: '', location: '', team: '', position: '', functionId: '', status: '', minimumLocation: '' });
    go(accessHome(role));
  }
  async function renderDashboard() {
    const current = captureView();
    setProgress(0); if (!state.session) { await loadSession(); if (!state.session) return go('login'); } if (state.profile?.role === 'servidor') return go('employee-dashboard'); if (state.profile?.must_change_password) return go('change-password'); app.innerHTML = '<section class="card loading-card"><div class="spinner"></div><p>Carregando solicitações…</p></section>';
    try { await Promise.all([loadRequests(), loadArchives()]); } catch (error) { if (!current()) return; app.innerHTML = shell('Não foi possível carregar as solicitações', 'Sua sessão foi iniciada, mas o painel não carregou. Tente novamente ou contate o suporte se o problema persistir.', `<div class="notice notice-danger">${esc(error.message)}</div><div class="actions"><button class="button button-primary" data-action="refresh">Tentar novamente</button><button class="button button-secondary" data-go="home">Voltar ao início</button></div>`); return; }
    if (!current()) return;
    const counts = status => state.requests.filter(r => r.status === status).length, d = state.dashboard, term = d.query.trim().toLocaleLowerCase('pt-BR');
    const filtered = state.requests.filter(r => {
      if (state.archivedRequestIds.has(r.id) !== d.archived) return false;
      const searchable = [r.protocol, r.servidor?.full_name, r.bond?.registration || r.servidor?.matricula, r.context_cnes?.name, r.servidor?.lotacao?.name].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return (!term || searchable.includes(term)) && (!d.status || r.status === d.status) && (!d.type || r.type === d.type);
    }).sort((a, b) => d.sort === 'oldest' ? new Date(a.created_at) - new Date(b.created_at) : d.sort === 'name' ? String(a.servidor?.full_name || '').localeCompare(String(b.servidor?.full_name || ''), 'pt-BR') : d.sort === 'status' ? labelStatus(a.status).localeCompare(labelStatus(b.status), 'pt-BR') : d.sort === 'type' ? labelType(a.type).localeCompare(labelType(b.type), 'pt-BR') : d.sort === 'start' ? String(a.start_date).localeCompare(String(b.start_date)) : d.sort === 'location' ? String(a.servidor?.lotacao?.name || '').localeCompare(String(b.servidor?.lotacao?.name || ''), 'pt-BR') : new Date(b.created_at) - new Date(a.created_at));
    const pages = Math.max(1, Math.ceil(filtered.length / d.pageSize)); d.page = Math.min(Math.max(1, d.page), pages); const start = (d.page - 1) * d.pageSize, rows = filtered.slice(start, start + d.pageSize);
    const statusOptions = ['enviada', 'em_analise', 'devolvida', 'aprovada', 'rejeitada', 'programada', 'reprogramada', 'cancelada', 'concluida'];
    app.innerHTML = `<section class="card"><div class="toolbar"><div><p class="eyebrow">Painel administrativo</p><h2>Registros anteriores</h2><p class="lead">${esc(state.profile?.full_name || state.session.user.email)} · ${esc(state.profile?.role || 'perfil não configurado')}</p></div><div class="actions"><button class="button button-secondary" data-action="refresh">Atualizar</button></div></div><div class="stats"><div class="stat"><strong>${state.requests.length}</strong><span>Total no seu escopo</span></div><div class="stat"><strong>${counts('enviada') + counts('em_analise')}</strong><span>Pendentes</span></div><div class="stat"><strong>${counts('aprovada') + counts('programada')}</strong><span>Aprovadas/programadas</span></div></div><form id="dashboard-filter-form" class="form-grid" style="margin-top:1.5rem"><div class="field field-full"><label for="dashboard-query">Buscar</label><input class="control" id="dashboard-query" value="${esc(d.query)}" placeholder="Protocolo, nome, matrícula ou lotação"></div><div class="field"><label for="dashboard-status">Situação</label><select class="control" id="dashboard-status"><option value="">Todas</option>${statusOptions.map(status => `<option value="${status}" ${d.status === status ? 'selected' : ''}>${labelStatus(status)}</option>`).join('')}</select></div><div class="field"><label for="dashboard-type">Modalidade</label><select class="control" id="dashboard-type"><option value="">Todas</option>${['regulamentar', 'premio', 'banco_horas'].map(type => `<option value="${type}" ${d.type === type ? 'selected' : ''}>${labelType(type)}</option>`).join('')}</select></div><div class="field"><label for="dashboard-sort">Ordenação</label><select class="control" id="dashboard-sort"><option value="newest" ${d.sort === 'newest' ? 'selected' : ''}>Mais recentes</option><option value="oldest" ${d.sort === 'oldest' ? 'selected' : ''}>Mais antigas</option><option value="name" ${d.sort === 'name' ? 'selected' : ''}>Nome do servidor</option><option value="status" ${d.sort === 'status' ? 'selected' : ''}>Situação</option><option value="type" ${d.sort === 'type' ? 'selected' : ''}>Modalidade</option><option value="start" ${d.sort === 'start' ? 'selected' : ''}>Data de início</option><option value="location" ${d.sort === 'location' ? 'selected' : ''}>Lotação</option></select></div><div class="field"><label for="dashboard-archived">Exibir</label><select class="control" id="dashboard-archived"><option value="active" ${d.archived ? '' : 'selected'}>Fila ativa</option><option value="archived" ${d.archived ? 'selected' : ''}>Arquivadas</option></select></div><div class="field"><label>&nbsp;</label><div class="actions"><button class="button button-primary" type="submit">Aplicar</button><button class="button button-secondary" type="button" data-action="dashboard-clear">Limpar</button></div></div></form><div class="toolbar" style="margin-top:1.5rem"><p><strong>${filtered.length}</strong> resultado(s)${filtered.length ? ` · exibindo ${start + 1}–${Math.min(start + d.pageSize, filtered.length)}` : ''}</p><div class="actions"><button class="button button-secondary" data-dashboard-page="${d.page - 1}" ${d.page === 1 ? 'disabled' : ''}>Anterior</button><span>Página ${d.page} de ${pages}</span><button class="button button-secondary" data-dashboard-page="${d.page + 1}" ${d.page === pages ? 'disabled' : ''}>Próxima</button></div></div><div class="table-wrap"><table><thead><tr><th>Protocolo</th><th>Servidor</th><th>Tipo</th><th>Período</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.protocol || r.id.slice(0, 8))}</td><td><strong>${esc(r.servidor?.full_name || 'Sem nome')}</strong><br>${esc(r.bond?.registration || r.servidor?.matricula || '')}</td><td>${labelType(r.type)}</td><td>${formatDate(r.start_date)} a ${formatDate(r.end_date)}</td><td><span class="badge badge-${r.status}">${labelStatus(r.status)}</span></td><td><button class="button button-secondary" data-request="${r.id}">${['enviada', 'em_analise'].includes(r.status) ? 'Analisar' : 'Ver detalhes'}</button></td></tr>`).join('') || '<tr><td colspan="6">Nenhuma solicitação corresponde aos filtros.</td></tr>'}</tbody></table></div></section>`;
  }
  async function rhRequest(payload) {
    const session=state.session;
    if(!session)throw new Error('Entre novamente.');
    const response=await fetch(SUPABASE_URL+'/functions/v1/manage-rh',{method:'POST',headers:{...sessionHeaders(session),'x-sgf-role':state.profile.role},body:JSON.stringify(payload)});
    const body=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(body.error||'Não foi possível acessar o RH.');error.code=body.code;throw error;}
    return body;
  }
  async function renderUnits(){
    const current=captureView();
    await SGFRhUnits.mount({app,esc,request:rhRequest,isCurrent:current,cnesRequest:async payload=>{
      const response=await fetch(SUPABASE_URL+'/functions/v1/manage-cnes',{method:'POST',headers:{...sessionHeaders(state.session),'x-sgf-role':'administrador'},body:JSON.stringify(payload)});
      const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||'Não foi possível atualizar o CNES.');return body;
    }});
  }
  async function renderRhAccounts(){if(state.profile?.role!=='administrador')return go('home');await SGFRhAccounts.mount({app,esc,request:rhRequest,isCurrent:captureView()});}
  async function renderRhWorkspace(){
    if(!state.activeContext?.institutional)return go('home');const current=captureView();
    await SGFRhAccounts.workspace({app,esc,request:rhRequest,isCurrent:current,go,onState:value=>{state.rhState=value;renderHeaderUser();},
      calendar:selection=>SGFRhCalendar.mount({app,esc,request:rhRequest,isCurrent:current,context:selection.context})});
  }
  async function renderRhCalendar(){if(state.profile?.role!=='administrador')return go('home');await SGFRhCalendar.mount({app,esc,request:rhRequest,isCurrent:captureView(),admin:true});}
  async function renderCnesImport() {
    const current = captureView();
    if (state.profile?.role !== 'administrador') return go('home');
    await SGFCnesImport.mount({ app, esc, isCurrent: current, bind: ({cnes,entryId,onDone}) => SGFRhBond.open({app,esc,request:rhRequest,isCurrent:current,cnes,entryId,onDone,backLabel:'Voltar aos funcionários'}), request: async payload => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-cnes`, { method: 'POST', headers: { ...sessionHeaders(state.session), 'x-sgf-role': state.profile.role }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível conferir o cadastro CNES.');
      return body;
    } });
  }
  async function loadAccessRequests() {
    const current = captureView();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-access`, { method: 'POST', headers: sessionHeaders(state.session), body: JSON.stringify({ action: 'list' }) }); const body = await response.json().catch(() => ({})); if (!current()) return; if (!response.ok) throw new Error(body.error || 'Não foi possível carregar as solicitações de acesso.'); state.accessRequests = body.requests || []; state.profileLocations = body.locations || [];
  }
  async function renderAuditHistory() {
    const loadSequence = state.auditLoadSequence = (state.auditLoadSequence || 0) + 1;
    const accessKey = JSON.stringify([state.profile?.role,state.activeContext]);
    const stillCurrent = () => state.auditLoadSequence === loadSequence && state.route === 'audit-history' && accessKey === JSON.stringify([state.profile?.role,state.activeContext]);
    setProgress(0);
    if (!state.session) return go('login');
    if (!['administrador', 'rh', 'diretor'].includes(state.profile?.role)) return go('home');
    state.auditFilter ||= {start_date: `${iso(new Date()).slice(0,7)}-01`, end_date: iso(new Date()), event: '', actor_name: '', affected_name: '', registration: '', actor_id: '', entity_id: '', bond_id: '', cnes_id: '', location_id: '', page: 0};
    const filter = state.auditFilter;
    app.innerHTML = '<section class="card loading-card"><p>Carregando histórico de ações…</p></section>';
    let result = {events: [], has_more: false}, errorNotice = '';
    try { result = await operationRequest({action: 'audit-history', ...filter}); }
    catch (error) { errorNotice = `<div class="notice notice-danger">${esc(error.message)}</div>`; }
    if(!stillCurrent()) return;
app.innerHTML = shell('Histórico de ações', state.profile.role === 'administrador' ? 'Consulta global. Senhas, tokens e chaves são removidos dos detalhes exibidos.' : 'Resumo restrito ao CNES/lotação do seu acesso. Outros escopos e dados completos dos cadastros não são exibidos.', `${errorNotice}<form id="audit-filter-form" class="form-grid"><div class="field"><label for="audit-start">De</label><input class="control" id="audit-start" type="date" value="${esc(filter.start_date)}" required></div><div class="field"><label for="audit-end">Até</label><input class="control" id="audit-end" type="date" value="${esc(filter.end_date)}" required></div>${[['actor_name','Nome do autor'],['affected_name','Nome do servidor afetado'],['registration','Matrícula do vínculo'],['event','Código do evento'],['actor_id','ID do usuário autor'],['entity_id','ID do registro afetado'],['bond_id','ID do vínculo'],...(state.profile.role === 'administrador' ? [['cnes_id','ID da unidade CNES'],['location_id','ID da lotação']] : [])].map(([key,label]) => `<div class="field"><label for="audit-${key}">${label}</label><input class="control" id="audit-${key}" name="${key}" value="${esc(filter[key] || '')}" ${['actor_name','affected_name','registration'].includes(key) ? 'minlength="2" maxlength="120"' : ''} placeholder="${key === 'event' ? 'Ex.: manual_conflict_create' : ['actor_name','affected_name','registration'].includes(key) ? 'Parte do nome ou matrícula — opcional' : 'UUID — opcional'}"></div>`).join('')}<div class="actions"><button class="button button-primary">Filtrar histórico</button></div></form><p class="page-footnote">Registros antigos podem não possuir contexto ou autoria completos. Eventos sem relação comprovável com um servidor não aparecem na busca por seu nome. Alterações cadastrais e operacionais possuem trilha transacional. Registros anteriores sem autoria ou escopo comprovável são preservados sem inferência. Página ${filter.page + 1}, até 50 eventos por página.</p><div class="summary">${result.events.map(item => `<div class="summary-row"><span>${formatDateTime(item.occurred_at)}<br><small>${esc(item.role ? accessLabel(item.role) : 'Papel não registrado')}</small></span><div><strong>${esc(item.action.replaceAll('_',' '))}</strong><p>${esc(item.actor_name || 'Autor não registrado')} · ${esc(item.entity_type)}${item.entity_id ? ` · ${esc(item.entity_id)}` : ''}</p><small>${esc([item.cnes,item.location,item.bond ? `Matrícula ${item.bond}` : ''].filter(Boolean).join(' · ') || 'Contexto não registrado')}</small>${item.affected_name ? `<p>Servidor afetado: ${esc(item.affected_name)} <small>(${item.affected_source === 'reconciled_current' ? 'nome atual na reconciliação' : 'nome registrado na ação'})</small></p>` : ''}${!item.affected_name && item.affected_names?.length ? `<p>Servidores afetados: ${item.affected_names.map(esc).join(', ')} <small>(evento coletivo; nomes registrados na ação)</small></p>` : ''}${item.reason ? `<p>Justificativa: ${esc(item.reason)}</p>` : ''}<details><summary>Antes e depois da ação</summary><h4>Anterior</h4><pre class="audit-payload">${esc(JSON.stringify(item.before,null,2))}</pre><h4>Depois</h4><pre class="audit-payload">${esc(JSON.stringify(item.after,null,2))}</pre></details></div></div>`).join('') || '<p>Nenhum evento encontrado neste recorte.</p>'}</div><div class="actions"><button class="button button-secondary" data-audit-page="-1" ${filter.page ? '' : 'disabled'}>Anterior</button><button class="button button-secondary" data-audit-page="1" ${result.has_more ? '' : 'disabled'}>Próxima</button></div>`);
  }
  async function renderNotifications() {
    const loadSequence = state.notificationLoadSequence = (state.notificationLoadSequence || 0) + 1;
    const accessKey = JSON.stringify([state.profile?.role,state.activeContext]);
    const stillCurrent = () => state.notificationLoadSequence === loadSequence && state.route === 'notifications' && accessKey === JSON.stringify([state.profile?.role,state.activeContext]);
    setProgress(0); if (!state.session) return go('login'); app.innerHTML = '<section class="card loading-card"><div class="spinner"></div><p>Carregando notificações…</p></section>';
    try { const result = await operationRequest({ action: 'notifications',page:state.notificationsPage||0 }); if(!stillCurrent()) return; state.notifications = result.notifications || []; state.notificationsHasMore=Boolean(result.has_more); } catch (error) { if(!stillCurrent()) return; return app.innerHTML = shell('Notificações', '', `<div class="notice notice-danger">${esc(error.message)}</div>`); }
    app.innerHTML = shell('Notificações', 'Avisos do perfil e CNES/lotação ativos. Troque o acesso para consultar outro contexto.', `<div class="actions"><button class="button button-secondary" data-go="home">Voltar</button>${state.notifications.some(item => !item.read_at) ? '<button class="button button-primary" data-action="notifications-read">Marcar avisos deste contexto como lidos</button>' : ''}</div><div class="summary">${state.notifications.map(item => `<div class="summary-row notification-row"><span>${formatDateTime(item.created_at)}${item.read_at ? '' : '<br><small>Nova</small>'}</span><div><strong>${esc(item.title)}</strong>${item.cnes ? `<small>${esc(item.cnes.code)} · ${esc(item.cnes.name)}${item.location ? ` · ${esc(item.location.name)}` : ''}</small>` : '<small>Aviso legado sem escopo inferido</small>'}<p>${esc(item.message)}</p><div class="actions">${item.request_id ? `<button class="button button-secondary" data-notification-open="${item.id}" data-request-id="${item.request_id}">Abrir solicitação</button>` : ''}${item.read_at ? '' : `<button class="text-button" data-notification-read="${item.id}">Marcar como lida</button>`}</div></div></div>`).join('') || '<p>Nenhuma notificação.</p>'}</div><div class="actions"><button class="button button-secondary" data-notification-page="-1" ${state.notificationsPage ? '' : 'disabled'}>Avisos anteriores</button><span>Página ${(state.notificationsPage||0)+1}</span><button class="button button-secondary" data-notification-page="1" ${state.notificationsHasMore ? '' : 'disabled'}>Mais avisos</button></div>`);
  }
  async function renderScale(reuseLoaded = false) {
    setProgress(0); if (!state.session) return go('login');
    const loadSequence = state.scaleLoadSequence = (state.scaleLoadSequence || 0) + 1;
    const accessKey = JSON.stringify([state.profile?.role,state.activeContext]);
    const stillCurrent = () => state.scaleLoadSequence === loadSequence && state.route === 'scale' && accessKey === JSON.stringify([state.profile?.role,state.activeContext]);
    let window;
    try {
      window = SGFScaleRange.range(state.scale);
      const cacheKey = `${accessKey}:${window.start}:${window.end}`;
      if (!reuseLoaded || state.scaleDataKey !== cacheKey || Date.now() - (state.scaleLoadedAt || 0) > 30000) {
      const batches = [];
      await Promise.all([loadRequests(),loadCalendarEvents()]);
      for (const month of window.months) {
        if (!stillCurrent()) return;
        const [calendar,minimum,manual] = await Promise.all([operationRequest({action:'unit-calendar',month}),operationRequest({action:'scale-list',month}),operationRequest({action:'manual-conflicts',month})]);
        batches.push({calendar,minimum,manual});
      }
      if (!stillCurrent()) return;
      const data = SGFScaleRange.merge(batches,window);
      state.scaleEmployees = data.employees; state.scaleRequests = data.requests; state.scaleLegacyWarnings = data.legacy_warnings || [];
      state.minimumScale = data.assignments; state.minimumScaleDays = data.planned_days;
      state.scaleLocations = data.locations; state.manualConflicts = data.conflicts;
      state.scaleDataKey = cacheKey; state.scaleLoadedAt = Date.now();
      }
    } catch (error) { if (stillCurrent()) app.innerHTML = shell('Escala indisponível', '', `<div class="notice notice-danger">${esc(error.message)}</div><button class="button button-secondary" data-scale-month="0">Voltar à visão mensal</button>`); return; }
    const filter = state.scale, days = window.days, monthStart = window.start, monthEnd = window.end;
    filter.focusDate = days.includes(filter.focusDate) ? filter.focusDate : (days.includes(iso(new Date())) ? iso(new Date()) : monthStart);
    const allCalendarRequests = state.scaleRequests;
    const manageable = allCalendarRequests.filter(r => (filter.mode === 'planning' || r.calendar_confirmed) && r.start_date <= monthEnd && r.return_date >= monthStart);
    const unique = (key, label) => [...new Map(state.scaleEmployees.map(employee => [key(employee), label(employee)]).filter(([id]) => id)).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    const teams = unique(employee => employee.team_name, employee => employee.team_name || 'Não se aplica'), locations = unique(employee => employee.lotacao?.id, employee => employee.lotacao?.name || ''), positions = unique(employee => employee.cargo?.id, employee => employee.cargo?.name || ''), functions = unique(employee => employee.funcao?.id, employee => employee.funcao?.name || ''), cnesUnits = unique(employee => employee.cnes?.id, employee => `${employee.cnes?.code || ''} · ${employee.cnes?.name || ''}`);
    const filtered = manageable.filter(r => (!filter.cnes || r.servidor?.cnes?.id === filter.cnes) && (!filter.location || r.servidor?.lotacao?.id === filter.location) && (!filter.position || r.servidor?.cargo?.id === filter.position) && (!filter.functionId || r.servidor?.funcao?.id === filter.functionId) && (!filter.team || r.servidor?.team_name === filter.team) && (!filter.status || r.status === filter.status));
    const employees = state.scaleEmployees.filter(employee => (!filter.cnes || employee.cnes?.id === filter.cnes) && (!filter.location || employee.lotacao?.id === filter.location) && (!filter.position || employee.cargo?.id === filter.position) && (!filter.functionId || employee.funcao?.id === filter.functionId) && (!filter.team || employee.team_name === filter.team) && (!filter.status || filtered.some(request => request.row_id === employee.row_id))).map(employee => ({ employee, requests: filtered.filter(request => request.row_id === employee.row_id) })).sort((a, b) => `${a.employee.cargo?.name || ''}|${a.employee.team_name || ''}|${a.employee.funcao?.name || ''}|${a.employee.full_name}`.localeCompare(`${b.employee.cargo?.name || ''}|${b.employee.team_name || ''}|${b.employee.funcao?.name || ''}|${b.employee.full_name}`, 'pt-BR'));
    const onLeave = (request, day) => {
      const person = request.servidor;
      if (person?.valid_from && day < person.valid_from || person?.valid_until && day > person.valid_until) return false;
      if (request.assigned_dates) return request.assigned_dates.includes(day) && !CALENDAR_EVENTS.has(day) && person?.birth_date?.slice(5) !== day.slice(5);
      return (request.periods || []).some(period => period.start_date <= day && period.end_date >= day);
    }, isReturn = (request, day) => SGFScaleRange.activeOn(request.servidor,day) && (request.periods || []).some(period => period.return_date === day);
    const conflictDetails = (request, day) => SGFScaleConflicts.conflictsFor(request, day, filtered, filter.conflictCriterion, onLeave), conflictAt = (request, day) => conflictDetails(request, day).length > 0;
    const cells = group => days.map(day => {
      if (!SGFScaleRange.activeOn(group.employee,day)) return `<td class="scale-day is-inactive" title="${esc(`${formatDate(day)} — atuação fora da vigência`)}" aria-label="${esc(`${group.employee.full_name}, atuação fora da vigência`)}">—</td>`;
      const absences = group.requests.filter(request => onLeave(request, day)).sort((a, b) => Number(b.calendar_confirmed) - Number(a.calendar_confirmed)), returns = group.requests.filter(request => isReturn(request, day)), request = absences[0] || returns[0];
      const period = request?.periods?.find(item => item.start_date <= day && item.end_date >= day), birth = group.employee.birth_date && group.employee.birth_date.slice(5) === day.slice(5), holiday = CALENDAR_EVENTS.get(day), minimum = state.minimumScale.some(item => item.bond_unit_id === group.employee.row_id && item.scale_date === day), conflict = absences.some(item => conflictAt(item, day)) || SGFScaleConflicts.manualFor(group.employee, day, state.manualConflicts).length > 0;
      const marker = returns.length ? 'R' : period?.start_date === day ? 'I' : period?.end_date === day ? 'F' : absences.length ? '·' : '';
      const title = [formatDate(day), request ? `${labelType(request.type)} · ${request.calendar_confirmed ? 'Adicionada ao calendário' : request.status === 'aprovada' ? 'Aprovada, aguardando calendário' : 'Pedido em análise'}` : 'Sem afastamento', returns.length ? 'Retorno ao trabalho' : '', minimum ? 'Escala mínima' : '', birth ? 'Day-off de aniversário' : '', holiday?.name || '', conflict ? 'Conflito de escala' : ''].filter(Boolean).join(' — ');
      const flags = `${minimum ? '<i class="scale-flag flag-minimum">M</i>' : ''}${birth ? '<i class="scale-flag flag-birthday">A</i>' : ''}${conflict ? '<i class="scale-alert" aria-label="Conflito">!</i>' : ''}`;
      return `<td class="scale-day ${[0, 6].includes(dateFrom(day).getDay()) ? 'is-weekend' : ''} ${day === filter.focusDate ? 'is-focused' : ''} ${request ? `is-leave status-${request.status} ${request.calendar_confirmed ? 'is-confirmed' : 'is-planned'}` : ''} ${period?.start_date === day ? 'is-start' : ''} ${period?.end_date === day ? 'is-end' : ''} ${returns.length ? 'is-return' : ''} ${birth ? 'is-birthday' : ''} ${holiday ? 'is-holiday' : ''} ${minimum ? 'is-minimum' : ''} ${conflict ? 'has-conflict' : ''}" ${request ? `data-request="${request.id}"` : `data-scale-date="${day}"`} title="${esc(title)}" aria-label="${esc(`${group.employee.full_name}, ${title}`)}">${request ? `<button type="button" class="scale-cell-main" data-request="${request.id}" aria-label="${esc(`${group.employee.full_name}, ${title}`)}">${marker}</button>` : `<span class="scale-cell-main">${marker}</span>`}${flags}</td>`;
    }).join('');
    const conflictDays = new Set([...filtered.flatMap(request => days.filter(day => onLeave(request, day) && conflictAt(request, day))), ...employees.flatMap(group => days.filter(day => SGFScaleRange.activeOn(group.employee,day) && SGFScaleConflicts.manualFor(group.employee, day, state.manualConflicts).length))]).size;
    const peak = days.map(day => ({ day, count: new Set(filtered.filter(r => onLeave(r, day)).map(r => r.servidor.id)).size })).sort((a, b) => b.count - a.count)[0] || { day: monthStart, count: 0 };
    const focusDay = filter.focusDate, focusHoliday = CALENDAR_EVENTS.get(focusDay);
    const daily = SGFScaleRange.daySummary(employees,focusDay,onLeave);
    const focusAbsences = daily.absences;
    const focusReturns = daily.active.map(group => ({ group, request: group.requests.find(request => isReturn(request, focusDay)) })).filter(item => item.request);
    const focusMinimum = daily.active.filter(group => state.minimumScale.some(item => item.bond_unit_id === group.employee.row_id && item.scale_date === focusDay));
    const focusBirthdays = daily.active.filter(group => group.employee.birth_date && group.employee.birth_date.slice(5) === focusDay.slice(5));
    const focusConflicts = focusAbsences.filter(item => conflictAt(item.request, focusDay));
    const monthLabel = filter.rangeMode === 'range' ? `${formatDate(monthStart)} a ${formatDate(monthEnd)}` : new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(dateFrom(monthStart));
    const focusLabelRaw = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(dateFrom(focusDay)), focusLabel = focusLabelRaw.charAt(0).toUpperCase() + focusLabelRaw.slice(1);
    const focusIndex = days.indexOf(focusDay);
    const personLine = item => `<button class="scale-person-line" data-request="${item.request.id}"><span><strong>${esc(item.group.employee.full_name)}</strong><small>${esc(item.group.employee.cargo?.name || 'Sem cargo')} · ${esc(item.group.employee.team_name || 'Não se aplica')} · ${esc(item.group.employee.funcao?.name || 'Sem função')}</small></span><em>${item.request.calendar_confirmed ? 'Confirmado' : 'Planejado'} · ${labelType(item.request.type)}</em></button>`;
    const namedLine = (group, label) => `<div class="scale-person-line is-static"><span><strong>${esc(group.employee.full_name)}</strong><small>${esc(group.employee.cargo?.name || 'Sem cargo')} · ${esc(group.employee.team_name || 'Não se aplica')} · ${esc(group.employee.funcao?.name || 'Sem função')}</small></span><em>${label}</em></div>`;
    const opts = (items, selected) => items.map(([id, name]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(name)}</option>`).join('');
    const preferredLocation = state.scaleLocations.find(item => state.scaleEmployees.some(employee => `${employee.cnes.id}:${employee.internal_lotacao_id || ''}` === item.id));
    const minimumLocation = state.scaleLocations.some(item => item.id === filter.minimumLocation) ? filter.minimumLocation : preferredLocation?.id || state.scaleLocations[0]?.id || '';
    const minimumDate = days.includes(filter.minimumDate) ? filter.minimumDate : (days.includes(iso(new Date())) ? iso(new Date()) : monthStart);
    filter.minimumLocation = minimumLocation; filter.minimumDate = minimumDate;
    const minimumCandidates = state.scaleEmployees.filter(employee => `${employee.cnes.id}:${employee.internal_lotacao_id || ''}` === minimumLocation && (!employee.valid_from || employee.valid_from <= minimumDate) && (!employee.valid_until || employee.valid_until >= minimumDate)).sort((a, b) => `${a.cargo?.name || ''}|${a.team_name}|${a.funcao?.name || ''}|${a.full_name}`.localeCompare(`${b.cargo?.name || ''}|${b.team_name}|${b.funcao?.name || ''}|${b.full_name}`, 'pt-BR'));
    const exactDay = state.minimumScaleDays.find(item => item.lotacao_id === minimumLocation && item.scale_date === minimumDate);
    const previousDay = exactDay ? null : state.minimumScaleDays.find(item => item.lotacao_id === minimumLocation && item.scale_date < minimumDate && dateFrom(item.scale_date).getDay() === dateFrom(minimumDate).getDay());
    const sourceDate = exactDay?.source_date || previousDay?.scale_date || null;
    const assignedDate = exactDay ? minimumDate : sourceDate;
    const unavailable = new Set(allCalendarRequests.filter(request => request.calendar_confirmed && `${request.servidor.cnes.id}:${request.servidor.internal_lotacao_id || ''}` === minimumLocation && onLeave(request, minimumDate)).map(request => request.row_id));
    const assigned = new Set(state.minimumScale.filter(item => item.lotacao_id === minimumLocation && item.scale_date === assignedDate && !unavailable.has(item.bond_unit_id)).map(item => item.bond_unit_id));
    const minimumConflicts = allCalendarRequests.filter(request => request.calendar_confirmed && `${request.servidor.cnes.id}:${request.servidor.internal_lotacao_id || ''}` === minimumLocation && assigned.has(request.row_id) && onLeave(request, minimumDate));
    const employeeRows = employees.map((group, index) => {
      const groupKey = `${group.employee.cargo?.name || ''}|${group.employee.team_name || ''}|${group.employee.funcao?.name || ''}`;
      const previous = employees[index - 1], previousKey = previous ? `${previous.employee.cargo?.name || ''}|${previous.employee.team_name || ''}|${previous.employee.funcao?.name || ''}` : '';
      return `<tr class="${index === 0 || groupKey !== previousKey ? 'is-group-start' : ''}"><th class="scale-person"><strong>${esc(group.employee.full_name)}</strong><small>Matrícula ${esc(group.employee.matricula || 'não informada')}</small><div class="scale-person-tags"><span>${esc(group.employee.cargo?.name || 'Sem cargo')}</span><span>${esc(group.employee.team_name || 'Não se aplica')}</span><span>${esc(group.employee.funcao?.name || 'Sem função')}</span></div><em>${esc(group.employee.cnes?.code || '')} · ${esc(group.employee.lotacao?.name || group.employee.cnes?.name || 'Unidade não informada')}</em></th>${cells(group)}</tr>`;
    }).join('');
    app.innerHTML = `<section class="card scale-card"><div class="scale-heading"><div><p class="eyebrow">Gestão de pessoal</p><h2>Escala de ${esc(monthLabel)}</h2><p class="lead">Selecione um dia para ver a composição completa. Cada linha representa um vínculo na unidade. Pedidos aprovados só ficam confirmados depois de adicionados ao calendário.</p></div><div class="actions"><button class="button button-secondary" data-go="dashboard">Voltar</button><button class="button button-secondary" data-scale-month="-1" aria-label="Mês anterior">← Mês anterior</button><button class="button button-secondary" data-scale-month="1" aria-label="Próximo mês">Próximo mês →</button></div></div><div class="notice scale-context">${state.profile?.role === 'administrador' ? 'Visão consolidada: filtre um CNES/lotação para consultar seu calendário.' : `Calendário do contexto ativo: ${esc(state.activeContext?.cnes_name || state.activeContext?.lotacao_name || 'sua unidade')}.`}</div><form id="scale-filter-form" class="scale-filters"><div class="field"><label for="scale-range-mode">Recorte de datas</label><select class="control" id="scale-range-mode"><option value="month" ${filter.rangeMode !== 'range' ? 'selected' : ''}>Mês completo</option><option value="range" ${filter.rangeMode === 'range' ? 'selected' : ''}>Intervalo personalizado</option></select></div><div class="field"><label for="scale-range-start">Início do intervalo</label><input class="control" id="scale-range-start" type="date" value="${esc(filter.rangeMode === 'range' ? filter.rangeStart || monthStart : monthStart)}"><small>Usado no intervalo personalizado, até 93 dias.</small></div><div class="field"><label for="scale-range-end">Fim do intervalo</label><input class="control" id="scale-range-end" type="date" value="${esc(filter.rangeMode === 'range' ? filter.rangeEnd || monthEnd : monthEnd)}"></div><div class="field"><label for="scale-month">Mês</label><input class="control" id="scale-month" type="month" value="${filter.month}"></div><div class="field"><label for="scale-cnes">CNES / Unidade</label><select class="control" id="scale-cnes"><option value="">Todos no seu acesso</option>${opts(cnesUnits, filter.cnes)}</select></div><div class="field"><label for="scale-mode">Visão</label><select class="control" id="scale-mode"><option value="confirmed" ${filter.mode === 'confirmed' ? 'selected' : ''}>Calendário confirmado</option><option value="planning" ${filter.mode === 'planning' ? 'selected' : ''}>Planejamento e confirmados</option></select></div><div class="field"><label for="scale-location">Lotação</label><select class="control" id="scale-location"><option value="">Todas</option>${opts(locations, filter.location)}</select></div><div class="field"><label for="scale-position">Cargo</label><select class="control" id="scale-position"><option value="">Todos</option>${opts(positions, filter.position)}</select></div><div class="field"><label for="scale-team">Equipe</label><select class="control" id="scale-team"><option value="">Todas</option>${opts(teams, filter.team)}</select></div><div class="field"><label for="scale-conflict-criterion">Critério de conflito</label><select class="control" id="scale-conflict-criterion">${Object.entries(SGFScaleConflicts.labels).map(([value, label]) => `<option value="${value}" ${filter.conflictCriterion === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div class="field"><label for="scale-function">Função</label><select class="control" id="scale-function"><option value="">Todas</option>${opts(functions, filter.functionId)}</select></div><div class="field"><label for="scale-status">Situação</label><select class="control" id="scale-status"><option value="">Todas nesta visão</option>${['enviada', 'em_analise', 'devolvida', 'aprovada', 'programada', 'reprogramada', 'concluida'].map(status => `<option value="${status}" ${filter.status === status ? 'selected' : ''}>${labelStatus(status)}</option>`).join('')}</select></div><div class="field scale-filter-action"><button class="button button-primary">Atualizar visão</button></div></form><div class="stats scale-stats"><div class="stat"><strong>${employees.length}</strong><span>Vínculos/unidades no recorte</span></div><div class="stat"><strong>${filtered.length}</strong><span>Solicitações no recorte</span></div><div class="stat ${conflictDays ? 'is-alert' : ''}"><strong>${conflictDays}</strong><span>Dias com conflito</span></div><div class="stat"><strong>${peak.count}</strong><span>${peak.count ? `Maior ausência em ${formatDate(peak.day)}` : 'Sem afastamentos no recorte'}</span></div></div><section class="scale-day-panel" aria-live="polite"><div class="scale-day-panel-head"><div><p class="eyebrow">Visão do dia</p><h3>${esc(focusLabel)}</h3><p>${focusHoliday ? `<strong>${esc(focusHoliday.name)}</strong> · ` : ''}${daily.withoutConfirmed} de ${daily.active.length} atuação(ões) vigente(s) sem afastamento confirmado neste dia. Não indica disponibilidade de trabalho.</p></div><div class="scale-day-navigation"><button class="button button-secondary" data-scale-date="${days[Math.max(0, focusIndex - 1)]}" ${focusIndex === 0 ? 'disabled' : ''} aria-label="Dia anterior">←</button><input class="control" id="scale-focus-date" type="date" min="${monthStart}" max="${monthEnd}" value="${focusDay}" aria-label="Data em destaque"><button class="button button-secondary" data-scale-date="${days[Math.min(days.length - 1, focusIndex + 1)]}" ${focusIndex === days.length - 1 ? 'disabled' : ''} aria-label="Dia seguinte">→</button></div></div><div class="scale-day-metrics"><div class="is-absence"><strong>${focusAbsences.length}</strong><span>${filter.mode === 'planning' ? 'Pedidos no dia' : 'Afastamentos confirmados'}</span></div><div class="is-returning"><strong>${focusReturns.length}</strong><span>Retornos</span></div><div class="is-minimum"><strong>${focusMinimum.length}</strong><span>Escala mínima</span></div><div class="${focusConflicts.length ? 'is-conflict' : ''}"><strong>${focusConflicts.length}</strong><span>Pessoas com alerta</span></div></div><div class="notice ${focusConflicts.length ? 'notice-warning' : ''}"><strong>Critério: ${esc(SGFScaleConflicts.labels[filter.conflictCriterion])}</strong><p>Os alertas consideram apenas os pedidos da visão e dos filtros atuais, dentro do mesmo CNES/lotação. São alertas de planejamento, não impedimentos legais ou recusas automáticas.</p>${focusConflicts.length ? `<ul>${focusConflicts.map(item => `<li>${esc(item.group.employee.full_name)} — ${formatDate(focusDay)} — simultâneo com ${conflictDetails(item.request, focusDay).map(other => esc(other.servidor.full_name)).join(', ')}.</li>`).join('')}</ul>` : '<p>Nenhum conflito para o critério neste dia.</p>'}</div><div class="scale-day-columns"><article><h4>Afastamentos e retornos</h4>${focusAbsences.map(personLine).join('') || '<p class="scale-day-empty">Nenhum servidor afastado.</p>'}${focusReturns.filter(item => !focusAbsences.some(absent => absent.group.employee.row_id === item.group.employee.row_id)).map(item => personLine(item)).join('')}</article><article><h4>Escala mínima e eventos</h4>${focusMinimum.map(group => namedLine(group, 'Escala mínima')).join('')}${focusBirthdays.map(group => namedLine(group, 'Day-off aniversário')).join('')}${focusHoliday ? `<div class="scale-event-line"><span>Feriado/ponto facultativo</span><strong>${esc(focusHoliday.name)}</strong></div>` : ''}${!focusMinimum.length && !focusBirthdays.length && !focusHoliday ? '<p class="scale-day-empty">Nenhum evento ou escala mínima registrada.</p>' : ''}</article></div></section><div class="scale-legend" aria-label="Legenda do calendário"><span class="legend-approved">Adicionada ao calendário</span><span class="legend-planned">Aprovada, aguardando calendário</span><span class="legend-pending">Em análise</span><span class="legend-return">Retorno</span><span class="legend-conflict">Conflito</span><span><b>I</b> início</span><span><b>F</b> fim</span><span><b>R</b> retorno</span><span><b>A</b> aniversário</span><span><b>H</b> feriado</span><span><b>M</b> escala mínima</span></div><div class="scale-scroll" role="region" aria-label="Calendário nominal; use as setas para percorrer as datas" tabindex="0"><table class="scale-grid"><thead><tr><th class="scale-person">Servidor · cargo · equipe · função</th>${days.map(day => { const holiday = CALENDAR_EVENTS.get(day); return `<th class="${[0, 6].includes(dateFrom(day).getDay()) ? 'is-weekend' : ''} ${day === iso(new Date()) ? 'is-today' : ''} ${day === focusDay ? 'is-focused' : ''} ${holiday ? 'is-holiday' : ''}" title="${esc([formatDate(day), holiday?.name].filter(Boolean).join(' — '))}"><button type="button" data-scale-date="${day}" aria-label="Ver ${formatDate(day)}"><span>${filter.rangeMode === 'range' ? `${day.slice(8)}/${day.slice(5,7)}` : day.slice(8)}</span><small>${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dateFrom(day).getDay()]}</small></button></th>`; }).join('')}</tr></thead><tbody>${employeeRows || `<tr><td colspan="${days.length + 1}" class="scale-empty">Nenhum servidor encontrado para os filtros deste recorte.</td></tr>`}</tbody></table></div><p class="lead scale-help"><strong>Como ler:</strong> verde representa os dias adicionados ao calendário desta unidade; faixas tracejadas são planejamento. I e F marcam os limites do período; R indica o retorno previsto. Clique no cabeçalho de uma data para detalhar o dia ou numa faixa para abrir a solicitação.</p></section>`;
    if (state.scaleLegacyWarnings?.length) app.querySelector('.scale-context')?.insertAdjacentHTML('afterend', `<div class="notice notice-warning" role="status">Há ${state.scaleLegacyWarnings.length} solicitação(ões) antiga(s) com vínculo ambíguo neste período. Elas não foram atribuídas automaticamente às matrículas. O RH deve conferir os documentos de origem: ${state.scaleLegacyWarnings.map(item => esc(item.protocol || item.request_id)).join(', ')}.</div>`);
    renderManualConflicts(employees.map(group => group.employee), focusDay, minimumLocation);
    if (!['rh', 'administrador'].includes(state.profile?.role)) return;
    app.innerHTML += `<section class="card minimum-scale-card"><p class="eyebrow">Planejamento do RH</p><h2>Escala mínima nominal</h2><p class="lead">Escolha uma lotação e uma data. A sugestão repete o último ciclo do mesmo dia da semana e pode ser ajustada pelo RH.</p><div class="form-grid"><div class="field"><label for="minimum-location">Lotação</label><select class="control" id="minimum-location">${state.scaleLocations.map(item => `<option value="${item.id}" ${item.id === minimumLocation ? 'selected' : ''}>${esc(item.code ? `${item.code} · ${item.name}` : item.name)}</option>`).join('')}</select></div><div class="field"><label for="minimum-date">Data</label><input class="control" id="minimum-date" type="date" min="${monthStart}" max="${monthEnd}" value="${minimumDate}"></div></div>${!exactDay && sourceDate ? `<div class="notice">Sugestão automática baseada na escala de ${formatDate(sourceDate)}. Servidores afastados foram desmarcados; revise e salve.</div>` : exactDay ? '<div class="notice">Esta data já possui uma escala salva. Qualquer ajuste ficará registrado.</div>' : '<div class="notice">Ainda não há ciclo anterior para este dia da semana. Monte a primeira escala e salve.</div>'}${minimumConflicts.length ? `<div class="notice notice-warning">${minimumConflicts.length} pessoa(s) indicada(s) também têm afastamento neste dia. Confira antes de salvar.</div>` : ''}<form id="minimum-scale-form" data-version="${exactDay?.version || 0}" data-source-date="${sourceDate || ''}"><div class="checkbox-list minimum-list">${minimumCandidates.map(employee => `<label class="checkbox-row"><input type="checkbox" name="minimum-employee" value="${employee.row_id}" ${assigned.has(employee.row_id) ? 'checked' : ''} ${unavailable.has(employee.row_id) ? 'disabled' : ''}><span>${esc(employee.cargo?.name || 'Sem cargo')} - ${esc(employee.team_name || 'Não se aplica')} e ${esc(employee.funcao?.name || 'Sem função')} - ${esc(employee.full_name)} · Matrícula ${esc(employee.matricula || 'não informada')}${unavailable.has(employee.row_id) ? ' (afastado)' : ''}</span></label>`).join('') || '<p>Nenhuma atuação vigente nesta unidade/lotação. Confira os cadastros funcionais.</p>'}</div><div class="actions"><button class="button button-primary" ${minimumLocation ? '' : 'disabled'}>Salvar escala do dia</button></div></form><details class="work-panel"><summary>Últimas escalas desta unidade/lotação</summary><div class="summary">${state.minimumScaleDays.filter(item => item.lotacao_id === minimumLocation && item.scale_date <= minimumDate).slice(0, 8).map(day => { const names = state.minimumScale.filter(item => item.lotacao_id === minimumLocation && item.scale_date === day.scale_date).map(item => state.scaleEmployees.find(employee => employee.row_id === item.bond_unit_id) || {full_name: 'Atuação histórica não disponível no cadastro atual'}); return `<div class="summary-row"><span>${formatDate(day.scale_date)}</span><strong>${names.map(employee => `${esc(employee.cargo?.name || 'Sem cargo')} - ${esc(employee.team_name || 'Não se aplica')} e ${esc(employee.funcao?.name || 'Sem função')} - ${esc(employee.full_name)} · Matrícula ${esc(employee.matricula || 'não informada')}`).join('<br>') || 'Escala salva sem nomes'}</strong></div>`; }).join('') || '<p>Nenhuma escala anterior registrada.</p>'}</div></details></section>`;
  }
  function manualEmployeeOptions(scopeId) {
    return '<option value="">Não vinculado a um servidor — alerta da unidade</option>' + state.scaleEmployees
      .filter(employee => `${employee.cnes.id}:${employee.internal_lotacao_id || ''}` === scopeId)
      .map(employee => `<option value="${employee.row_id}">${esc(employee.cargo?.name || 'Sem cargo')} · ${esc(employee.full_name)} · matrícula ${esc(employee.matricula)}</option>`).join('');
  }
  function renderManualConflicts(visibleEmployees, day, scopeId) {
    const labels = {active: 'Ativo', resolved: 'Resolvido', cancelled: 'Cancelado'};
    const scopeFor = row => state.scaleLocations.find(location => location.cnes_unit_id === row.cnes_unit_id && (location.lotacao_id || null) === (row.lotacao_id || null)) || { name: [row.cnes?.name, row.location?.name].filter(Boolean).join(' · ') || 'CNES/lotação histórica' };
    const rows = state.manualConflicts.filter(row => {
      const scope = scopeFor(row);
      return scope && (!state.scale.cnes || row.cnes_unit_id === state.scale.cnes)
        && (!state.scale.location || visibleEmployees.some(employee => employee.lotacao?.id === state.scale.location && employee.cnes.id === row.cnes_unit_id && (employee.internal_lotacao_id || null) === (row.lotacao_id || null)))
        && (!row.bond_unit_id || !(state.scale.position || state.scale.team || state.scale.functionId || state.scale.status) || visibleEmployees.some(employee => employee.row_id === row.bond_unit_id));
    });
    app.innerHTML += `<section class="card manual-conflicts-card"><p class="eyebrow">Exceções de planejamento</p><h2>Conflitos manuais</h2><div class="notice notice-warning">${rows.filter(row => row.status === 'active' && row.start_date <= day && row.end_date >= day).length} alerta(s) manual(is) ativo(s) em ${formatDate(day)} neste recorte.</div><p class="lead">Alertas registrados pela gestão, independentes do critério automático. Não alteram a decisão de uma solicitação. O histórico do período permanece disponível após resolução ou cancelamento.</p><form id="manual-conflict-form" data-conflict-id="${crypto.randomUUID()}"><div class="form-grid"><div class="field"><label for="manual-conflict-scope">Unidade / lotação</label><select class="control" id="manual-conflict-scope" required>${state.scaleLocations.map(location => `<option value="${location.id}" ${location.id === scopeId ? 'selected' : ''}>${esc(location.code)} · ${esc(location.name)}</option>`).join('')}</select></div><div class="field"><label for="manual-conflict-employee">Atuação relacionada (opcional)</label><select class="control" id="manual-conflict-employee">${manualEmployeeOptions(scopeId)}</select></div><div class="field"><label for="manual-conflict-start">Início</label><input class="control" type="date" id="manual-conflict-start" value="${day}" required></div><div class="field"><label for="manual-conflict-end">Fim</label><input class="control" type="date" id="manual-conflict-end" value="${day}" required></div><div class="field"><label for="manual-conflict-reason">Justificativa obrigatória</label><textarea class="control" id="manual-conflict-reason" minlength="3" maxlength="2000" required></textarea></div></div><div class="actions"><button class="button button-primary" ${state.scaleLocations.length ? '' : 'disabled'}>Registrar conflito</button></div></form><h3>Registros do período e dos filtros atuais</h3><div class="summary">${rows.map(row => {
      const employee = state.scaleEmployees.find(employee => employee.row_id === row.bond_unit_id);
      return `<div class="summary-row manual-conflict-row"><div><strong>${esc(labels[row.status])} · ${formatDate(row.start_date)} a ${formatDate(row.end_date)}</strong><p>${esc(scopeFor(row)?.name)} · ${esc(employee?.full_name || row.unit?.bond?.employee?.full_name || (row.bond_unit_id ? 'Atuação histórica' : 'Toda a unidade'))}</p><p>${esc(row.justification)}</p><small>Registrado por ${esc(row.author?.full_name || 'Usuário identificado no histórico')} em ${formatDateTime(row.created_at)}</small>${row.status !== 'active' ? `<p>${esc(row.closure_reason)}</p><small>${esc(labels[row.status])} por ${esc(row.closer?.full_name || 'Usuário identificado no histórico')} em ${formatDateTime(row.closed_at)}</small>` : ''}</div>${row.status === 'active' ? `<form class="manual-conflict-close-form" data-conflict-id="${row.id}" data-version="${row.version}"><div class="field"><label>Ação<select class="control" name="conflict-action"><option value="resolve">Resolver</option><option value="cancel">Cancelar registro</option></select></label></div><div class="field"><label>Justificativa da ação<textarea class="control" name="closure-reason" minlength="3" maxlength="2000" required></textarea></label></div><button class="button button-secondary">Confirmar ação</button></form>` : ''}</div>`;
    }).join('') || '<p>Nenhum conflito manual neste recorte.</p>'}</div></section>`;
  }
  async function saveManualConflict(event) {
    event.preventDefault();
    const form = event.target, button = event.submitter;
    if (button?.disabled) return;
    const creating = form.id === 'manual-conflict-form';
    const payload = { action: 'manual-conflict-save', id: form.dataset.conflictId,
      conflict_action: creating ? 'create' : form.elements['conflict-action'].value,
      version: creating ? 0 : Number(form.dataset.version),
      justification: (creating ? document.querySelector('#manual-conflict-reason').value : form.elements['closure-reason'].value).trim() };
    if (creating) {
      const scope = state.scaleLocations.find(location => location.id === document.querySelector('#manual-conflict-scope').value);
      if (!scope) return showToast('Selecione uma unidade válida.');
      Object.assign(payload, { cnes_unit_id: scope.cnes_unit_id, internal_lotacao_id: scope.lotacao_id,
        bond_unit_id: document.querySelector('#manual-conflict-employee').value || null,
        start_date: document.querySelector('#manual-conflict-start').value, end_date: document.querySelector('#manual-conflict-end').value });
      if (payload.end_date < payload.start_date) return showToast('O fim do período não pode ser anterior ao início.');
    }
    if (payload.justification.length < 3 || payload.justification.length > 2000) return showToast('Informe uma justificativa de 3 a 2000 caracteres.');
    if (button) button.disabled = true;
    try { await operationRequest(payload); showToast('Conflito registrado no histórico.'); await renderScale(); }
    catch (error) { showToast(error.message); if (button) button.disabled = false; }
  }
  async function renderAccessRequests() {
    const current = captureView();
    setProgress(0); if (!state.session) { await loadSession(); if (!state.session) return go('login'); } if (!['rh', 'administrador'].includes(state.profile?.role)) return go('dashboard'); app.innerHTML = '<section class="card loading-card"><div class="spinner"></div><p>Carregando solicitações de acesso…</p></section>';
    try { await loadAccessRequests(); } catch (error) { if (!current()) return; app.innerHTML = shell('Não foi possível carregar os acessos', 'Tente novamente em alguns instantes.', `<div class="notice notice-danger">${esc(error.message)}</div><div class="actions"><button class="button button-secondary" data-go="dashboard">Voltar</button></div>`); return; }
    if (!current()) return;
    const pending = state.accessRequests.filter(item => item.status === 'pendente');
    app.innerHTML = `<section class="card"><div class="toolbar"><div><p class="eyebrow">Administração</p><h2>Solicitações de acesso</h2><p class="lead">Os acessos são liberados somente após a aprovação.</p></div><div class="actions"><button class="button button-secondary" data-action="access-requests-refresh">Atualizar</button></div></div><div class="stats"><div class="stat"><strong>${pending.length}</strong><span>Pendentes</span></div><div class="stat"><strong>${state.accessRequests.filter(item => item.status === 'aprovada').length}</strong><span>Aprovadas</span></div><div class="stat"><strong>${state.accessRequests.filter(item => item.status === 'rejeitada').length}</strong><span>Rejeitadas</span></div></div><div class="table-wrap" style="margin-top:1.5rem"><table><thead><tr><th>Solicitante</th><th>Matrícula</th><th>E-mail</th><th>Lotação declarada</th><th>Situação</th><th></th></tr></thead><tbody>${state.accessRequests.map(item => `<tr><td><strong>${esc(item.full_name)}</strong><br><small>${formatDateTime(item.created_at)}</small></td><td>${esc(item.registration)}</td><td>${esc(item.email)}</td><td>${esc(item.requested_unit || '—')}</td><td>${esc(item.status)}</td><td>${item.status === 'pendente' ? `<button class="button button-secondary" data-access-request="${item.id}">Analisar</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma solicitação de acesso registrada.</td></tr>'}</tbody></table></div></section>`;
  }
  function renderAccessRequestDetail() {
    const item = state.selected; if (!item) return go('access-requests');
    const locations = state.profileLocations.map(location => `<label class="checkbox-row"><input type="checkbox" name="access-scope" value="${location.id}"><span>${esc(location.code || '')} · ${esc(location.name)}</span></label>`).join('');
    app.innerHTML = shell('Analisar solicitação de acesso', `${esc(item.full_name)} · CPF ${esc(formatCPF(item.cpf))}`, `<button class="text-button" data-go="access-requests">← Voltar aos acessos</button><div class="summary"><div class="summary-row"><span>E-mail</span><strong>${esc(item.email)}</strong></div><div class="summary-row"><span>Matrícula</span><strong>${esc(item.registration)}</strong></div><div class="summary-row"><span>Cargo declarado</span><strong>${esc(item.requested_position || '—')}</strong></div><div class="summary-row"><span>Lotação declarada</span><strong>${esc(item.requested_unit || '—')}</strong></div></div><form id="access-review-form" class="form-grid"><div class="field field-full"><label for="access-location">Lotação CNES a aprovar</label><select class="control" id="access-location" required><option value="">Selecione a lotação oficial</option>${state.profileLocations.map(location => `<option value="${location.id}">${esc(location.code)} · ${esc(location.name)}</option>`).join('')}</select><small>O servidor ficará vinculado a esta lotação após aprovação.</small></div><div class="field field-full"><fieldset class="checkbox-group"><legend>Acessos a conceder</legend><div class="checkbox-list">${(state.profile.role === 'rh' ? [['servidor', 'Servidor']] : [['servidor', 'Servidor'], ['rh', 'RH'], ['administrador', 'Administrador']]).map(([role, label]) => `<label class="checkbox-row"><input type="checkbox" name="access-role" value="${role}" ${role === 'servidor' ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div></fieldset><small>Se o CPF já tiver uma conta, os novos acessos serão acrescentados nela.</small></div><div class="field field-full hidden" id="access-scope-group"><fieldset class="checkbox-group"><legend>Lotações sob responsabilidade do RH</legend><p>Selecione as unidades que o RH poderá acompanhar.</p><input class="control scope-search" id="access-scope-search" type="search" placeholder="Buscar lotação por código ou nome" aria-label="Buscar lotação"><div class="checkbox-list" id="access-scope-list">${locations || '<p>Nenhuma lotação cadastrada.</p>'}</div></fieldset></div><div class="field field-full"><div class="actions actions-end"><button type="button" class="button button-primary" data-access-decision="approve">Aprovar acesso</button></div><details class="work-panel work-panel-danger"><summary>Rejeitar solicitação</summary><div class="field"><label for="access-review-notes">Motivo da rejeição</label><textarea class="control" id="access-review-notes" rows="3"></textarea></div><div class="actions"><button type="button" class="button button-danger" data-access-decision="reject">Confirmar rejeição</button></div></details></div></form>`);
    const summary = document.querySelector('#access-review-form')?.previousElementSibling;
    if (item.model_version === 2) {
      const bonds = (item.access_request_bonds || []).sort((a, b) => a.sequence - b.sequence);
      summary?.insertAdjacentHTML('beforeend', bonds.map(bond => `<div class="summary-row"><span>Matrícula ${esc(bond.registration)}<br><small>${esc(bond.cargo?.name || 'Sem cargo')} · ${esc(bond.employment_type)}</small></span><strong>${(bond.units || []).sort((a, b) => a.sequence - b.sequence).map(unit => `${esc(unit.cnes?.code || '')} · ${esc(unit.cnes?.name || 'CNES')}<br><small>${unit.not_applicable ? 'Não se aplica' : esc(unit.team?.name || 'Equipe não informada')}${unit.allocation?.name ? ` · ${esc(unit.allocation.name)}` : ''}</small>`).join('<br>')}</strong></div>`).join(''));
      const locationSelect = document.querySelector('#access-location'); if (locationSelect) { locationSelect.required = false; locationSelect.closest('.field')?.classList.add('hidden'); }
    } else summary?.insertAdjacentHTML('beforeend', `<div class="summary-row"><span>Equipe declarada</span><strong>${esc(item.requested_team || 'Não se aplica')}</strong></div>`);

    const scopeLegend = document.querySelector('#access-scope-group legend'); if (scopeLegend) scopeLegend.textContent = 'Lotações sob responsabilidade';
    const scopeHelp = document.querySelector('#access-scope-group p'); if (scopeHelp) scopeHelp.textContent = 'Selecione as unidades que o Diretor ou o RH poderá acompanhar.';
    syncRoleScope('access-role', 'access-scope-group');
  }
  function syncRoleScope(roleId, groupId) {
    const hasRh = roleId === 'profile-role'
      ? Boolean(document.querySelector('[name="profile-role"][value="rh"]:checked, [name="profile-role"][value="diretor"]:checked'))
      : Boolean(document.querySelector('[name="access-role"][value="rh"]:checked, [name="access-role"][value="diretor"]:checked'));
    document.querySelector(`#${groupId}`)?.classList.toggle('hidden', !hasRh);
  }
  function filterScopeList(searchId, listId) {
    const query = document.querySelector(`#${searchId}`)?.value.trim().toLocaleLowerCase('pt-BR') || '';
    document.querySelectorAll(`#${listId} .checkbox-row`).forEach(row => row.classList.toggle('hidden', !row.textContent.toLocaleLowerCase('pt-BR').includes(query)));
  }
  async function reviewAccess(action, button) {
    const notes = document.querySelector('#access-review-notes').value.trim(); if (action === 'reject' && !notes) return showToast('Informe a justificativa da rejeição.');
    const roles = [...document.querySelectorAll('[name="access-role"]:checked')].map(input => input.value);
    const payload = { action, id: state.selected.id, notes, roles, lotacao_id: document.querySelector('#access-location').value, scope_ids: roles.some(role => ['diretor', 'rh'].includes(role)) ? [...document.querySelectorAll('[name="access-scope"]:checked')].map(input => input.value) : [], redirectTo: `${window.location.origin}${window.location.pathname}` };
    if (action === 'approve' && !roles.length) return showToast('Selecione ao menos um acesso.'); if (action === 'approve' && state.selected.model_version !== 2 && !payload.lotacao_id) return showToast('Selecione a lotação CNES.');
    if (action === 'approve' && roles.some(role => ['diretor', 'rh'].includes(role)) && !payload.scope_ids.length) return showToast('Selecione ao menos uma lotação para RH/Diretor.');
    button.disabled = true; button.textContent = 'Salvando…';
    try { const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-access`, { method: 'POST', headers: sessionHeaders(state.session), body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Não foi possível analisar o acesso.'); showToast(action === 'approve' ? body.existing ? 'Acessos acrescentados à conta existente.' : 'Acesso aprovado. Primeiro login com senha provisória 123456.' : 'Solicitação rejeitada.'); go('access-requests'); }
    catch (error) { showToast(error.message); button.disabled = false; button.textContent = action === 'approve' ? 'Aprovar acesso' : 'Confirmar rejeição'; }
  }
  async function loadProfiles() {
    const current = captureView();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-profiles`, { method: 'POST', headers: sessionHeaders(state.session), body: JSON.stringify({ action: 'list' }) }); const body = await response.json().catch(() => ({})); if (!current()) return; if (!response.ok) throw new Error(body.error || 'Não foi possível carregar os perfis.'); state.profiles = body.profiles || []; state.profileLocations = body.locations || []; if (body.registrationCatalogs) state.registrationCatalogs = body.registrationCatalogs;
  }
  async function profileRequest(payload) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-profiles`, { method: 'POST', headers: sessionHeaders(state.session), body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Não foi possível atualizar a conta.');
    return body;
  }
  function presentTemporaryPassword(password) {
    if (password) window.prompt('Copie a senha temporária agora. Ela não será exibida novamente e deverá ser trocada no primeiro login.', password);
  }
  function renderProfileCreate() {
    if (state.profile?.role !== 'administrador') return go('catalogs');
    if (!state.registrationCatalogs.cnesUnits.length) return go('profiles');
app.innerHTML = shell('Novo usuário', 'Cadastre a pessoa, todos os vínculos e os CNES responsáveis. A senha provisória será informada após o cadastro e deverá ser trocada no primeiro acesso.', `<form id="profile-create-form"><div class="form-grid"><div class="form-section-heading field-full"><span class="step-number">1</span><div><h3>Dados pessoais</h3><p>CPF e e-mail identificam uma única conta.</p></div></div><div class="field"><label for="create-name">Nome completo</label><input class="control" id="create-name" required autocomplete="name"></div><div class="field"><label for="create-email">E-mail institucional</label><input class="control" id="create-email" type="email" pattern="[^@\\s]+@betim\\.mg\\.gov\\.br" placeholder="nome@betim.mg.gov.br" required></div><div class="field"><label for="create-cpf">CPF</label><input class="control" id="create-cpf" required maxlength="14" inputmode="numeric"></div><div class="field"><label for="create-birth">Nascimento</label><input class="control" id="create-birth" type="date" required></div><div class="form-section-heading field-full"><span class="step-number">2</span><div><h3>Vínculos e unidades</h3><p>Inclua cada matrícula e todos os CNES em que a pessoa atua.</p></div></div></div><div id="access-bonds">${accessBondMarkup()}</div><div class="actions"><button type="button" class="button button-secondary" data-access-add-bond>+ Adicionar vínculo</button></div><div class="form-grid"><fieldset class="checkbox-group field-full"><legend>Acessos</legend>${[['servidor', 'Servidor'], ['rh', 'RH/Diretor'], ['administrador', 'Administrador']].map(([value, label]) => `<label class="checkbox-row"><input type="checkbox" name="create-role" value="${value}" ${value === 'servidor' ? 'checked' : ''}><span>${label}</span></label>`).join('')}</fieldset><div class="field field-full" id="create-scope-group"><fieldset class="checkbox-group"><legend>Lotações sob responsabilidade de Diretor/RH</legend><div class="checkbox-list">${state.profileLocations.map(location => `<label class="checkbox-row"><input type="checkbox" name="create-scope" value="${location.id}"><span>${esc(location.code || '')} · ${esc(location.name)}</span></label>`).join('')}</div></fieldset></div><p class="field-full page-footnote">A senha temporária será exibida uma única vez e deverá ser trocada no primeiro login.</p><div class="field-full actions"><button type="button" class="button button-secondary" data-go="profiles">Voltar</button><button class="button button-primary">Criar usuário</button></div></div></form>`);
  }
  async function createProfile(event) {
    event.preventDefault(); const button = event.submitter, cpf = digits(document.querySelector('#create-cpf').value);
    if (!validCPF(cpf)) return showToast('Informe um CPF válido.');
    const roles = [...document.querySelectorAll('[name="create-role"]:checked')].map(item => item.value);
    if (!roles.length) return showToast('Selecione ao menos um acesso.');
    const email = document.querySelector('#create-email').value.trim();
    if (!institutionalEmail(email)) return showToast('Use e-mail @betim.mg.gov.br.');
    const bonds = [...document.querySelectorAll('[data-access-bond]')].map(bond => ({ registration: bond.querySelector('.access-registration').value.trim(), cargo_id: bond.querySelector('.access-position').value, employment_type: bond.querySelector('.access-employment').value.trim(), weekly_hours: bond.querySelector('.access-bond-hours').value || null, pole_cnes_unit_id: bond.querySelector('.access-pole').value || null, units: [...bond.querySelectorAll('[data-access-unit]')].map(unit => ({ cnes_unit_id: unit.querySelector('.access-cnes').value, internal_lotacao_id: unit.querySelector('.access-allocation').value || null, team_id: unit.querySelector('.access-team-type').value === 'nao_se_aplica' ? null : unit.querySelector('.access-team').value, not_applicable: unit.querySelector('.access-team-type').value === 'nao_se_aplica', weekly_hours: unit.querySelector('.access-unit-hours').value || null })) }));
    if (bonds.some(bond => !bond.registration || !bond.cargo_id || !bond.employment_type || !bond.units.length || bond.units.some(unit => !unit.cnes_unit_id || (!unit.not_applicable && !unit.team_id)))) return showToast('Confira matrícula, cargo, vínculo, CNES e equipe de todos os vínculos.');
    const scopeIds = [...document.querySelectorAll('[name="create-scope"]:checked')].map(item => item.value);
    if (roles.some(role => ['diretor', 'rh'].includes(role)) && !scopeIds.length) return showToast('Selecione ao menos uma lotação para RH/Diretor.');
    button.disabled = true;
    try { const result = await profileRequest({ action: 'create', full_name: document.querySelector('#create-name').value.trim(), email, cpf, birth_date: document.querySelector('#create-birth').value, bonds, roles, scope_ids: scopeIds }); presentTemporaryPassword(result.temporary_password); showToast('Usuário e vínculos criados. A troca de senha será exigida no primeiro login.'); go('profiles'); }
    catch (error) { showToast(error.message); button.disabled = false; }
  }
  async function saveMyLocation(event) {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try { await profileRequest({ action: 'set-my-location', lotacao_id: document.querySelector('#my-location').value }); await loadSession(); showToast('Lotação atualizada.'); go('profiles'); }
    catch (error) { showToast(error.message); button.disabled = false; }
  }
  async function renderProfiles() {
    const current = captureView();
    setProgress(0); if (!state.session) { await loadSession(); if (!state.session) return go('login'); } if (state.profile?.role !== 'administrador') return go('dashboard'); app.innerHTML = '<section class="card loading-card"><div class="spinner"></div><p>Carregando perfis…</p></section>';
    try { await loadProfiles(); } catch (error) { if (!current()) return; app.innerHTML = shell('Não foi possível carregar os perfis', 'Tente novamente em alguns instantes.', `<div class="notice notice-danger">${esc(error.message)}</div><div class="actions"><button class="button button-secondary" data-go="dashboard">Voltar</button></div>`); return; }
    if (!current()) return;
    const staff = state.profiles.filter(profile => profile.roles?.some(role => role !== 'servidor')).length; state.profiles.sort((a, b) => state.profileSort === 'location' ? String(a.primary_lotacao?.name || '').localeCompare(String(b.primary_lotacao?.name || ''), 'pt-BR') : state.profileSort === 'role' ? String(a.roles?.at(-1) || '').localeCompare(String(b.roles?.at(-1) || ''), 'pt-BR') : state.profileSort === 'status' ? Number(Boolean(a.disabled_at)) - Number(Boolean(b.disabled_at)) : String(a.full_name).localeCompare(String(b.full_name), 'pt-BR'));
    app.innerHTML = `<section class="card"><div class="toolbar"><div><p class="eyebrow">Administração</p><h2>Perfis e acessos</h2><p class="lead">Cada CPF pode ter os acessos Servidor, RH/Diretor e Administrador.</p></div><div class="actions"><button class="button button-primary" data-go="profile-create">Novo usuário</button><button class="button button-secondary" data-action="profiles-refresh">Atualizar</button></div></div>${catalogTabs()}<div class="field" style="max-width:280px"><label for="profile-sort">Ordenar usuários</label><select class="control" id="profile-sort"><option value="name" ${state.profileSort === 'name' ? 'selected' : ''}>Nome</option><option value="location" ${state.profileSort === 'location' ? 'selected' : ''}>Lotação</option><option value="role" ${state.profileSort === 'role' ? 'selected' : ''}>Acesso</option><option value="status" ${state.profileSort === 'status' ? 'selected' : ''}>Situação</option></select></div><div class="stats"><div class="stat"><strong>${state.profiles.length}</strong><span>Contas cadastradas</span></div><div class="stat"><strong>${staff}</strong><span>Acessos de gestão</span></div><div class="stat"><strong>${state.profiles.filter(profile => profile.roles?.includes('rh')).length}</strong><span>Acessos RH</span></div></div><div class="table-wrap" style="margin-top:1.5rem"><table><thead><tr><th>Usuário</th><th>CPF</th><th>Matrícula</th><th>Acessos</th><th>Lotação</th><th>Escopo de gestão</th><th>Situação</th><th></th></tr></thead><tbody>${state.profiles.map(profile => `<tr><td><strong>${esc(profile.full_name)}</strong>${profile.id === state.profile.id ? '<br><small>Conta atual</small>' : ''}</td><td>${esc(formatCPF(profile.cpf || ''))}</td><td>${esc(profile.servidor?.matricula || '—')}</td><td>${(profile.roles || []).map(role => esc(accessLabel(role))).join(', ')}</td><td>${esc(profile.primary_lotacao?.name || profile.servidor?.lotacao?.name || 'A definir')}</td><td>${(profile.scopes || []).map(scope => esc(scope.lotacao?.code || scope.lotacao?.name)).join(', ') || '—'}</td><td>${profile.disabled_at ? 'Desativado' : 'Ativo'}</td><td><button class="button button-secondary" data-profile="${profile.id}">${profile.id === state.profile.id ? 'Minha lotação' : 'Configurar'}</button></td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function renderProfileDetail() {
    const profile = state.selected; if (!profile) return go('profiles'); if (profile.id === state.profile.id) { app.innerHTML = shell('Minha lotação', 'Selecione o CNES da sua lotação para completar o cabeçalho.', `<form id="my-location-form" class="form-grid"><div class="field field-full"><label for="my-location">Lotação</label><select class="control" id="my-location" required><option value="">Selecione</option>${state.profileLocations.map(item => `<option value="${item.id}" ${item.id === profile.primary_lotacao_id ? 'selected' : ''}>${esc(item.code)} · ${esc(item.name)}</option>`).join('')}</select></div><div class="field field-full actions"><button class="button button-secondary" type="button" data-go="profiles">Voltar</button><button class="button button-primary">Salvar lotação</button></div></form>`); return; } const selectedIds = new Set((profile.scopes || []).map(scope => scope.lotacao?.id)); const roles = [['servidor', 'Servidor'], ['rh', 'RH/Diretor'], ['administrador', 'Administrador']];
    app.innerHTML = shell('Configurar acessos', `${esc(profile.full_name)}${profile.servidor?.matricula ? ` · matrícula ${esc(profile.servidor.matricula)}` : ''}`, `<button class="text-button" data-go="profiles">← Voltar aos perfis</button><form id="profile-access-form" class="form-grid"><div class="field field-full"><label for="profile-location">Lotação principal (CNES)</label><select class="control" id="profile-location" required><option value="">Selecione</option>${state.profileLocations.map(item => `<option value="${item.id}" ${item.id === profile.primary_lotacao_id ? 'selected' : ''}>${esc(item.code)} · ${esc(item.name)}</option>`).join('')}</select></div><div class="field"><label for="profile-cpf">CPF</label><input class="control" id="profile-cpf" required inputmode="numeric" maxlength="14" value="${esc(formatCPF(profile.cpf || ''))}"></div><div class="field field-full"><fieldset class="checkbox-group"><legend>Acessos concedidos</legend><div class="checkbox-list">${roles.map(([value, label]) => `<label class="checkbox-row"><input type="checkbox" name="profile-role" value="${value}" ${(profile.roles || []).includes(value) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div></fieldset><small>O usuário escolherá um destes acessos após entrar com CPF e senha.</small></div><div class="field field-full" id="profile-scope-group"><fieldset class="checkbox-group"><legend>Lotações sob responsabilidade da gestão</legend><p>Selecione ao menos uma lotação quando Diretor ou RH estiver marcado.</p><input class="control scope-search" id="profile-scope-search" type="search" placeholder="Buscar lotação por código ou nome" aria-label="Buscar lotação"><div class="checkbox-list" id="profile-scope-list">${state.profileLocations.map(location => `<label class="checkbox-row"><input type="checkbox" name="profile-scope" value="${location.id}" ${selectedIds.has(location.id) ? 'checked' : ''}><span>${esc(location.code)} · ${esc(location.name)}</span></label>`).join('') || '<p>Nenhuma lotação cadastrada.</p>'}</div></fieldset></div><div class="field field-full"><div class="actions actions-end"><button class="button button-primary" type="submit">Salvar acessos</button></div></div></form><div class="actions"><button class="button button-secondary" data-action="profile-reset">Resetar senha</button><button class="button button-danger" data-action="profile-deactivate">Desativar usuário</button></div><p class="page-footnote">A desativação impede novo acesso e preserva o histórico para auditoria.</p>`);
    syncRoleScope('profile-role', 'profile-scope-group');
    const scopeLegend = document.querySelector('#profile-scope-group legend');
    if (scopeLegend) scopeLegend.textContent = 'Lotações sob responsabilidade';
    const scopeHelp = document.querySelector('#profile-scope-group p');
    if (scopeHelp) scopeHelp.textContent = 'Selecione ao menos uma lotação quando Diretor ou RH estiver marcado.';

    syncRoleScope('profile-role', 'profile-scope-group');
  }
  async function saveProfileAccess(event) {
    event.preventDefault(); const button = event.submitter, roles = [...document.querySelectorAll('[name="profile-role"]:checked')].map(input => input.value), cpf = digits(document.querySelector('#profile-cpf').value), scopeIds = roles.some(role => ['diretor', 'rh'].includes(role)) ? [...document.querySelectorAll('[name="profile-scope"]:checked')].map(input => input.value) : [];
    if (!validCPF(cpf) || !roles.length) return showToast('Informe um CPF válido e ao menos um acesso.');
    if (roles.some(role => ['diretor', 'rh'].includes(role)) && !scopeIds.length) return showToast('Selecione ao menos uma lotação para RH/Diretor.'); if (!document.querySelector('#profile-location').value) return showToast('Selecione a lotação principal.');
    button.disabled = true; button.textContent = 'Salvando…';
    try { const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-profiles`, { method: 'POST', headers: sessionHeaders(state.session), body: JSON.stringify({ action: 'update', profile_id: state.selected.id, roles, cpf, scope_ids: scopeIds, lotacao_id: document.querySelector('#profile-location').value }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Não foi possível atualizar o perfil.'); showToast('Acessos e escopos atualizados.'); go('profiles'); }
    catch (error) { showToast(error.message); button.disabled = false; button.textContent = 'Salvar perfil'; }
  }
  async function catalogRequest(payload) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-catalogs`, { method: 'POST', headers: sessionHeaders(state.session), body: JSON.stringify(payload) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.'); return body;
  }
  async function loadCatalogs() { const current = captureView(); const body = await catalogRequest({ action: 'list' }); if (current()) state.catalog = body; }
  async function renderCalendarAdmin() {
    if (state.profile?.role !== 'administrador') return go('catalogs');
    setProgress(0);
    app.innerHTML = '<section class="card loading-card"><div class="spinner"></div><p>Carregando calendário…</p></section>';
    try { state.calendarAdmin = (await catalogRequest({ action: 'calendar-list' })).events || []; }
    catch (error) { app.innerHTML = shell('Feriados', '', `<div class="notice notice-danger">${esc(error.message)}</div>`); return; }
    app.innerHTML = `<section class="card"><h2>Feriados e pontos facultativos</h2><details id="holiday-editor"><summary>Adicionar ou editar data</summary><form id="calendar-event-form" class="form-grid"><div class="field"><label for="calendar-date">Data</label><input class="control" id="calendar-date" type="date" required></div><div class="field"><label for="calendar-type">Tipo</label><select class="control" id="calendar-type"><option value="feriado">Feriado</option><option value="ponto_facultativo">Ponto facultativo</option></select></div><div class="field field-full"><label for="calendar-name">Nome</label><input class="control" id="calendar-name" required maxlength="120" placeholder="Ex.: Feriado municipal"></div><div class="field"><label><input id="calendar-active" type="checkbox" checked> Data ativa</label></div><div class="field"><label>&nbsp;</label><button class="button button-primary">Salvar data</button></div></form></details><div class="table-wrap" style="margin-top:1.5rem"><table><thead><tr><th>Data</th><th>Tipo</th><th>Nome</th><th>Situação</th><th></th></tr></thead><tbody>${[...state.calendarAdmin].sort((a,b)=>a.event_date.localeCompare(b.event_date)||a.name.localeCompare(b.name,'pt-BR')).map(item => `<tr><td>${formatDate(item.event_date)}</td><td>${item.type === 'feriado' ? 'Feriado' : 'Ponto facultativo'}</td><td>${esc(item.name)}</td><td>${item.active ? 'Ativa' : 'Inativa'}</td><td><button type="button" class="button button-secondary" data-calendar-edit="${item.id}">Editar</button></td></tr>`).join('') || '<tr><td colspan="5">Nenhuma data cadastrada.</td></tr>'}</tbody></table></div></section>`;
    
  }
  async function saveCalendarEvent(event) {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try {
      const form = document.querySelector('#calendar-event-form');
      await catalogRequest({ action: 'calendar-save', id: form.dataset.eventId || null, version: Number(form.dataset.version) || null, event_date: document.querySelector('#calendar-date').value, type: document.querySelector('#calendar-type').value, name: document.querySelector('#calendar-name').value.trim(), active: document.querySelector('#calendar-active').checked });
      await loadCalendarEvents(); showToast('Data salva no calendário.'); await renderCalendarAdmin();
    } catch (error) { showToast(error.message); button.disabled = false; }
  }
  function showCalendarAdjustmentInDetail(request) {
    document.querySelector('.summary')?.insertAdjacentHTML('afterend', renderCalendarAdjustment(request));
  }
  function filterCatalogLocations() {
    const search = document.querySelector('#catalog-location-search');
    if (!search) return;
    const query = search.value.trim().toLocaleLowerCase('pt-BR');
    const rows = [...document.querySelectorAll('[data-catalog-location-row]')];
    const matching = rows.filter(row => row.dataset.search.includes(query));
    const limit = query || state.catalogShowAll ? matching.length : 12;
    rows.forEach(row => { row.hidden = true; });
    matching.slice(0, limit).forEach(row => { row.hidden = false; });
    const count = document.querySelector('#catalog-location-count');
    if (count) count.textContent = matching.length ? `Exibindo ${Math.min(matching.length, limit)} de ${matching.length} ${matching.length === 1 ? 'lotação' : 'lotações'}` : 'Nenhuma lotação encontrada';
    const toggle = document.querySelector('[data-action="catalog-locations-toggle"]');
    if (toggle) { toggle.hidden = Boolean(query) || rows.length <= 12; toggle.textContent = state.catalogShowAll ? 'Mostrar menos' : 'Mostrar todas'; }
  }

  const reasonModeLabel = mode => ({bank:'Saldo de banco de horas',conflict:'Funcionário e período do conflito',other:'Justificativa textual'})[mode] || mode;
  async function renderReasonCatalog() {
    if (state.profile?.role !== 'administrador') return go('catalogs');
    app.innerHTML = '<section class="card loading-card"><p>Carregando motivos de recusa…</p></section>';
    try {
      const result = await operationRequest({action:'rejection-reasons',include_inactive:true});
      if (state.route !== 'rejection-catalog' || state.profile?.role !== 'administrador') return;
      state.reasonCatalog = result.reasons || [];
      app.innerHTML = shell('Motivos de recusa','Catálogo administrativo. Alterações exigem justificativa e preservam as decisões anteriores.', `<div class="actions"><button class="button button-secondary" data-go="catalogs">Voltar aos cadastros</button><button class="button button-primary" data-reason-edit="">Novo motivo</button><button class="button button-secondary" data-go="rejection-catalog">Atualizar catálogo</button></div><div class="notice">Não há exclusão de motivos. Desative os que não devem mais ser utilizados. Código e modo de preenchimento são permanentes; decisões anteriores mantêm o rótulo registrado na época. Pelo menos um motivo deve permanecer ativo.</div><div class="table-wrap"><table><thead><tr><th>Motivo</th><th>Preenchimento</th><th>Ordem</th><th>Situação</th><th></th></tr></thead><tbody>${state.reasonCatalog.map(item => `<tr><td><strong>${esc(item.label)}</strong><br><small>${esc(item.code)}</small></td><td>${esc(reasonModeLabel(item.input_mode))}</td><td>${item.display_order}</td><td>${item.active ? 'Ativo' : 'Inativo'}</td><td><button class="button button-secondary" data-reason-edit="${esc(item.code)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="5">Nenhum motivo cadastrado.</td></tr>'}</tbody></table></div><div id="reason-editor"></div>`);
    } catch (error) {
      if (state.route === 'rejection-catalog') app.innerHTML = shell('Motivos de recusa','',`<div class="notice notice-danger">${esc(error.message)}</div><button class="button button-secondary" data-go="catalogs">Voltar</button>`);
    }
  }
  function editReasonCatalog(code) {
    if (state.profile?.role !== 'administrador') return;
    const item = code ? state.reasonCatalog?.find(entry => entry.code === code) : null;
    if (code && !item) return showToast('Atualize o catálogo para editar este motivo.');
    state.reasonCatalogSelected = item;
    document.querySelector('#reason-editor').innerHTML = `<h3>${item ? 'Editar motivo' : 'Novo motivo'}</h3><form id="reason-catalog-form" class="form-grid"><div class="field"><label for="reason-code">Código permanente</label><input class="control" id="reason-code" name="code" value="${esc(item?.code || '')}" pattern="[a-z][a-z0-9_]{2,63}" minlength="3" maxlength="64" ${item ? 'readonly' : ''} placeholder="Ex.: incompatibilidade_escala" required></div><div class="field"><label for="reason-label">Nome exibido</label><input class="control" id="reason-label" name="label" value="${esc(item?.label || '')}" minlength="3" maxlength="160" required></div><div class="field"><label for="reason-mode">Campos exigidos</label><select class="control" id="reason-mode" name="input_mode" ${item ? 'disabled' : ''}>${['other','bank','conflict'].map(mode => `<option value="${mode}" ${item?.input_mode === mode ? 'selected' : ''}>${esc(reasonModeLabel(mode))}</option>`).join('')}</select></div><div class="field"><label for="reason-order">Ordem de exibição</label><input class="control" id="reason-order" name="display_order" type="number" min="0" max="10000" step="1" value="${item?.display_order ?? 0}" required></div><div class="field"><label for="reason-active"><input id="reason-active" name="active" type="checkbox" ${!item || item.active ? 'checked' : ''}> Motivo ativo</label></div><div class="field field-full"><label for="reason-justification">Justificativa desta alteração</label><textarea class="control" id="reason-justification" name="justification" minlength="3" maxlength="2000" required></textarea></div><div class="field field-full"><div class="notice notice-danger hidden" id="reason-error" role="alert"></div><div class="actions"><button type="button" class="button button-secondary" data-go="rejection-catalog">Cancelar edição</button><button class="button button-primary">Salvar motivo</button></div></div></form>`;
    document.querySelector(item ? '#reason-label' : '#reason-code').focus();
  }
  async function saveReasonCatalog(event) {
    event.preventDefault();
    if (state.profile?.role !== 'administrador') return;
    const form = event.target, button = event.submitter || form.querySelector('button[type="submit"],button:not([type])');
    const item = state.reasonCatalogSelected, input = form.elements;
    button.disabled = true;
    try {
      await operationRequest({action:'rejection-reason-save',code:item?.code || input.code.value,
        label:input.label.value,input_mode:item?.input_mode || input.input_mode.value,active:input.active.checked,
        display_order:Number(input.display_order.value),version:item?.version || 0,justification:input.justification.value});
      showToast('Motivo salvo com registro no histórico.');
      if (state.route === 'rejection-catalog') await renderReasonCatalog();
    } catch (error) {
      const notice = form.querySelector('#reason-error'); notice.textContent = error.message; notice.classList.remove('hidden'); button.disabled = false;
    }
  }
  async function renderCatalogs() {
    const current = captureView();
    setProgress(0); if (!state.session) { await loadSession(); if (!state.session) return go('login'); } if (!['administrador', 'rh'].includes(state.profile?.role)) return go('dashboard'); app.innerHTML = '<section class="card loading-card"><div class="spinner"></div><p>Carregando cadastros…</p></section>';
    try { await loadCatalogs(); } catch (error) { if (!current()) return; app.innerHTML = shell('Não foi possível carregar os cadastros', 'Tente novamente em alguns instantes.', `<div class="notice notice-danger">${esc(error.message)}</div>`); return; }
    if (!current()) return;
    const c = state.catalog, admin = c.actorRole === 'administrador';
    const compare = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR');
    c.employees.sort((a, b) => state.catalogSort === 'registration' ? compare(a.matricula, b.matricula) : state.catalogSort === 'location' ? compare(a.lotacao?.name, b.lotacao?.name) : state.catalogSort === 'status' ? Number(b.active) - Number(a.active) : compare(a.full_name, b.full_name));
    c.locations.sort((a, b) => state.catalogSort === 'registration' ? compare(a.code, b.code) : state.catalogSort === 'status' ? Number(b.active) - Number(a.active) : compare(a.name, b.name));
    app.innerHTML = `<section class="card"><div class="toolbar"><div><p class="eyebrow">Estrutura organizacional</p><h2>Cadastros</h2><p class="lead">Lotações, responsáveis e registros funcionais com histórico.</p></div><div class="actions"><button class="button button-secondary" data-action="catalogs-refresh">Atualizar</button></div></div>${catalogTabs()}<div class="notice">${admin ? 'Visão administrativa global. O Administrador pode consultar todas as unidades.' : `Funcionários somente da unidade selecionada: ${esc([state.activeContext?.cnes_code, state.activeContext?.cnes_name, state.activeContext?.internal_lotacao_id ? state.activeContext?.lotacao_name : null].filter(Boolean).join(' · ') || state.activeContext?.lotacao_name || 'contexto ativo')}. Para consultar outra unidade autorizada, troque o contexto no menu.`}</div><div class="field" style="max-width:280px"><label for="catalog-sort">Ordenar cadastros</label><select class="control" id="catalog-sort"><option value="name" ${state.catalogSort === 'name' ? 'selected' : ''}>Nome</option><option value="registration" ${state.catalogSort === 'registration' ? 'selected' : ''}>Matrícula / CNES</option><option value="location" ${state.catalogSort === 'location' ? 'selected' : ''}>Lotação</option><option value="status" ${state.catalogSort === 'status' ? 'selected' : ''}>Situação</option></select></div><h3>Servidores</h3><div class="actions"><button class="button button-primary" data-catalog-new="employee">Novo servidor</button></div><div class="table-wrap"><table><thead><tr><th>Servidor</th><th>Matrícula</th><th>Lotação</th><th>Cargo/função</th><th>Vínculo</th><th>Situação</th><th></th></tr></thead><tbody>${c.employees.map(item => `<tr><td><strong>${esc(item.full_name || 'Sem nome')}</strong></td><td>${esc(item.matricula)}</td><td>${esc(item.lotacao?.name || 'Sem lotação')}</td><td>${esc(item.cargo?.name || '—')}<br><small>${esc(item.funcao?.name || '')}</small></td><td>${esc(item.employment_type)}</td><td>${item.active ? 'Ativo' : 'Bloqueado'}</td><td><button class="button button-secondary" data-catalog-employee="${item.id}">Editar</button></td></tr>`).join('') || '<tr><td colspan="7">Nenhum servidor no escopo.</td></tr>'}</tbody></table></div><h3 style="margin-top:2rem">Cargos e funções</h3><div class="choice-grid"><div><div class="actions"><button class="button button-primary" data-catalog-new="cargo">Novo cargo</button></div><div class="summary">${c.positions.map(item => `<button class="summary-row" data-catalog-reference="cargo" data-reference-id="${item.id}"><span>${esc(item.name)}</span><strong>Editar</strong></button>`).join('') || '<p>Nenhum cargo cadastrado.</p>'}</div></div><div><div class="actions"><button class="button button-primary" data-catalog-new="funcao">Nova função</button></div><div class="summary">${c.functions.map(item => `<button class="summary-row" data-catalog-reference="funcao" data-reference-id="${item.id}"><span>${esc(item.name)}</span><strong>Editar</strong></button>`).join('') || '<p>Nenhuma função cadastrada.</p>'}</div></div></div><h3 style="margin-top:2rem">Lotações</h3><div class="catalog-location-filter"><div class="field"><label for="catalog-location-search">Buscar lotação por código ou nome</label><input class="control" id="catalog-location-search" type="search" autocomplete="off" placeholder="Digite para filtrar"></div><span id="catalog-location-count" aria-live="polite"></span><button class="button button-secondary" type="button" data-action="catalog-locations-toggle">Mostrar todas</button></div>${admin ? '<div class="actions"><button class="button button-primary" data-catalog-new="location">Nova lotação</button></div>' : '<div class="notice">O RH visualiza somente suas lotações. Alterações estruturais são exclusivas do administrador.</div>'}<div class="table-wrap"><table><thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Situação</th><th>Responsáveis</th><th></th></tr></thead><tbody>${c.locations.map(item => { const responsibleIds = c.managerScopes.filter(scope => scope.lotacao_id === item.id).map(scope => scope.profile_id); const names = c.managers.filter(manager => responsibleIds.includes(manager.id)).map(manager => manager.full_name).join(', '); return `<tr data-catalog-location-row data-search="${esc(`${item.code || ''} ${item.name}`.toLocaleLowerCase('pt-BR'))}"><td>${esc(item.code || '—')}</td><td>${esc(item.name)}</td><td>${esc(item.unit_type)}</td><td>${item.active ? 'Ativa' : 'Inativa'}</td><td>${esc(names || '—')}</td><td>${admin ? `<button class="button button-secondary" data-catalog-location="${item.id}">Editar</button>` : '—'}</td></tr>`; }).join('')}</tbody></table></div></section>`;
    if (admin) app.querySelector('.toolbar .actions').insertAdjacentHTML('beforeend','<button class="button button-secondary" data-go="rejection-catalog">Motivos de recusa</button>');
    filterCatalogLocations();
    if(admin) app.querySelector('.toolbar .actions').insertAdjacentHTML('beforeend','<button class="button button-secondary" data-go="organization">CNES e equipes</button>');
    app.querySelector('.card').insertAdjacentHTML('beforeend',`<h3>Direitos e saldos por matrícula</h3><p>Selecione o vínculo correto. O saldo é único por matrícula, mesmo com atuação em mais de um CNES.</p><div class="summary">${(c.bonds || []).map(b=>`<button class="summary-row" data-bond-resources="${b.id}"><span>${esc(c.employees.find(e=>e.id===b.servidor_id)?.full_name || '')} · Matrícula ${esc(b.registration)}</span><strong>Direitos e banco de horas →</strong></button>`).join('') || '<p>Nenhuma matrícula ativa disponível no contexto.</p>'}</div>`);
  }
  async function renderLocationDetail() {
    if (state.catalog.actorRole !== 'administrador') return go('catalogs'); const item = state.selected || { active: true, unit_type: 'unidade' }; const assigned = new Set(state.catalog.managerScopes.filter(scope => scope.lotacao_id === item.id).map(scope => scope.profile_id));
    const current = captureView();
    let organization;
    try { organization = await catalogRequest({action:'organization-list'}); }
    catch(error) { if(current()) app.innerHTML=shell('Lotação','',`<div class="notice notice-danger">${esc(error.message)}</div><button class="button button-secondary" data-go="catalogs">Voltar</button>`); return; }
    if(!current()) return;
    app.innerHTML = shell(item.id ? 'Editar lotação' : 'Nova lotação', 'Defina a hierarquia, o código CNES e os responsáveis.', `<form id="location-form" class="form-grid"><div class="field"><label for="location-code">Código CNES</label><input class="control" id="location-code" value="${esc(item.code || '')}"></div><div class="field"><label for="location-name">Nome</label><input class="control" id="location-name" required value="${esc(item.name || '')}"></div><div class="field"><label for="location-type">Tipo</label><select class="control" id="location-type">${[['secretaria', 'Secretaria'], ['diretoria', 'Diretoria'], ['unidade', 'Unidade'], ['setor', 'Setor']].map(([value, label]) => `<option value="${value}" ${item.unit_type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label for="location-parent">Lotação superior</label><select class="control" id="location-parent"><option value="">Sem superior</option>${state.catalog.locations.filter(location => location.id !== item.id).map(location => `<option value="${location.id}" ${item.parent_id === location.id ? 'selected' : ''}>${esc(location.name)}</option>`).join('')}</select></div><div class="field field-full"><label>Responsáveis</label><div class="summary">${state.catalog.managers.map(manager => `<label class="summary-row"><span>${esc(manager.full_name)} · ${esc((manager.roles || []).map(accessLabel).join(', '))}</span><input type="checkbox" name="location-manager" value="${manager.id}" ${assigned.has(manager.id) ? 'checked' : ''}></label>`).join('') || '<p>Não há usuários de RH disponíveis.</p>'}</div></div><div class="field"><label><input type="checkbox" id="location-active" ${item.active ? 'checked' : ''}> Lotação ativa</label></div><div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="catalogs">Voltar</button><button class="button button-primary">Salvar lotação</button></div></div></form>`);
    document.querySelector('#location-code')?.closest('.field').remove();
    document.querySelector('#location-form').insertAdjacentHTML('afterbegin',SGFOrganization.locationExtra(item,organization));
  }
  async function renderOrganization() {
    const current=captureView();
    app.innerHTML=shell('CNES e equipes','Carregando…','');
    try { const data=await catalogRequest({action:'organization-list'}); if(!current()) return; state.organization=data; app.innerHTML=SGFOrganization.registryPage(data); }
    catch(error) { if(current()) app.innerHTML=shell('CNES e equipes','',`<div class="notice notice-danger">${esc(error.message)}</div><button class="button button-secondary" data-go="catalogs">Voltar</button>`); }
  }
  async function renderBondResources() {
    const current=captureView(),bond=state.resourceBond;
    if(!bond) return go('catalogs');
    app.innerHTML=shell('Direitos por matrícula','Carregando…','');
    try { const data=await operationRequest({action:'bond-resources',bond_id:bond.id}); if(!current()) return;
      state.bondResources=data; app.innerHTML=SGFOrganization.bondPage(data,state.catalog.employees.find(e=>e.id===bond.servidor_id)?.full_name || '');
      app.querySelector('.stats').insertAdjacentHTML('beforebegin',SGFOrganization.bondEditor(data,state.catalog));
      document.querySelector('#bond-bank-form').dataset.entryKey=crypto.randomUUID();
    } catch(error) { if(current()) app.innerHTML=shell('Direitos por matrícula','',`<div class="notice notice-danger">${esc(error.message)}</div><button class="button button-secondary" data-go="catalogs">Voltar</button>`); }
  }
  async function saveOrganization(event) {
    event.preventDefault(); const form=event.target,button=event.submitter,current=captureView(); button.disabled=true;
    try { const item=Object.fromEntries(new FormData(form)); item.id=form.dataset.id||null; item.version=Number(form.dataset.version); item.active=form.elements.active.checked;
      await catalogRequest({action:'organization-save',kind:form.dataset.kind,item}); showToast('Cadastro salvo com histórico.'); if(current()) await renderOrganization();
    } catch(error) { showToast(error.message); if(current()) button.disabled=false; }
  }
  async function saveBondResource(event) {
    event.preventDefault(); const form=event.target,button=event.submitter,current=captureView(); button.disabled=true;
    const bondId=state.resourceBond.id;
    try {
      const item=Object.fromEntries(new FormData(form));
      if(form.id==='bond-bank-form') await operationRequest({action:'time-bank',bond_id:bondId,...item,version:Number(form.dataset.version),entry_key:form.dataset.entryKey});
      else await operationRequest({action:form.id==='bond-registry-form'?'bond-save':'bond-right-save',bond_id:bondId,item:{...item,id:form.dataset.id||null,version:Number(form.dataset.version)}});
      showToast('Registro salvo com autoria e vínculo.'); if(current()) await renderBondResources();
    } catch(error) { showToast(error.message); if(current()) button.disabled=false; }
  }
  function renderReferenceDetail() {
    const selected = state.selected || { kind: 'cargo', item: null }, label = selected.kind === 'cargo' ? 'cargo' : 'função';
    app.innerHTML = shell(selected.item ? `Editar ${label}` : `Novo ${label}`, 'O nome ficará disponível nos cadastros funcionais.', `<form id="reference-form" class="form-grid"><div class="field field-full"><label for="reference-name">Nome</label><input class="control" id="reference-name" required value="${esc(selected.item?.name || '')}" autofocus></div><div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="catalogs">Voltar</button><button class="button button-primary">Salvar</button></div></div></form>`);
  }
  async function renderEmployeeRegistryDetail() {
    const item = state.selected || { active: true }, c = state.catalog; let history = [];
    if (item.id) { try { history = (await catalogRequest({ action: 'history', id: item.id })).history || []; } catch (error) { showToast(error.message); } }
    const option = (items, selected, empty) => `<option value="">${empty}</option>${items.map(entry => `<option value="${entry.id}" ${entry.id === selected ? 'selected' : ''}>${esc(entry.code ? `${entry.code} · ${entry.name}` : entry.name)}</option>`).join('')}`;
    app.innerHTML = shell(item.id ? 'Editar servidor' : 'Novo servidor', item.id ? 'Alterações de lotação, cargo, função, vínculo e situação ficam registradas no histórico.' : 'Cadastre os dados funcionais básicos.', `<form id="employee-registry-form" class="form-grid"><div class="form-section-heading field-full"><span class="step-number">1</span><div><h3>Identificação do servidor</h3><p>Dados pessoais e matrícula funcional.</p></div></div><div class="field"><label for="registry-name">Nome completo</label><input class="control" id="registry-name" required value="${esc(item.full_name || '')}"></div><div class="field"><label for="registry-registration">Matrícula</label><input class="control" id="registry-registration" required value="${esc(item.matricula || '')}"></div><div class="field"><label for="registry-cpf">CPF</label><input class="control" id="registry-cpf" required maxlength="14" inputmode="numeric" value="${esc(formatCPF(item.cpf || ''))}"></div><div class="field"><label for="registry-birth">Data de nascimento</label><input class="control" id="registry-birth" type="date" required value="${esc(item.birth_date || '')}"></div><div class="form-section-heading field-full"><span class="step-number">2</span><div><h3>Vínculo e lotação</h3><p>Confira os dados oficiais antes de salvar.</p></div></div><div class="field"><label for="registry-admission">Data de admissão</label><input class="control" id="registry-admission" type="date" value="${esc(item.admission_date || '')}"></div><div class="field"><label for="registry-employment">Tipo de vínculo</label><input class="control" id="registry-employment" required value="${esc(item.employment_type || '')}"><small>Use a denominação registrada no cadastro funcional.</small></div><div class="field"><label for="registry-location">Lotação</label><select class="control" id="registry-location" required>${option(c.locations.filter(location => location.active), item.lotacao?.id, 'Selecione')}</select></div><div class="field"><label for="registry-position">Cargo</label><select class="control" id="registry-position">${option(c.positions, item.cargo?.id, 'Sem cargo')}</select></div><div class="field"><label for="registry-function">Função</label><select class="control" id="registry-function">${option(c.functions, item.funcao?.id, 'Sem função')}</select></div><div class="field"><label for="registry-hours">Jornada semanal (horas)</label><input class="control" id="registry-hours" type="number" min="1" max="80" value="${esc(item.weekly_hours || '')}"></div><div class="field"><label><input type="checkbox" id="registry-active" ${item.active ? 'checked' : ''}> Servidor ativo</label></div><div class="form-section-heading field-full"><span class="step-number">3</span><div><h3>Registro da alteração</h3><p>A justificativa ficará no histórico funcional.</p></div></div><div class="field field-full"><label for="registry-reason">Justificativa da inclusão ou alteração</label><textarea class="control" id="registry-reason" required rows="3"></textarea></div><div class="field field-full"><div class="actions"><button type="button" class="button button-secondary" data-go="catalogs">Voltar</button><button class="button button-primary">Salvar servidor</button></div></div></form>${item.id ? `<h3>Histórico funcional</h3><div class="summary">${history.map(entry => `<div class="summary-row"><span>${formatDateTime(entry.changed_at)}<br><small>${esc(entry.changed_by?.full_name || '')}</small></span><strong>${esc(entry.reason)}<br><small>Lotação: ${esc(entry.previous_lotacao?.name || '—')} → ${esc(entry.new_lotacao?.name || '—')} · Situação: ${entry.previous_active === false ? 'bloqueado' : 'ativo'} → ${entry.new_active === false ? 'bloqueado' : 'ativo'}</small></strong></div>`).join('') || '<p>Nenhuma mudança funcional registrada.</p>'}</div>` : ''}`);
    document.querySelector('#registry-function')?.closest('.field')?.insertAdjacentHTML('afterend', `<div class="field"><label for="registry-team">Equipe</label><input class="control" id="registry-team" maxlength="120" required value="${esc(item.team_name || 'Não se aplica')}"><label class="inline-check"><input type="checkbox" data-team-na="registry-team" ${item.team_name === 'Não se aplica' || !item.team_name ? 'checked' : ''}> Não se aplica</label></div>`);
  }
async function saveLocation(event) { event.preventDefault(); const button = event.submitter; button.disabled = true; try { await catalogRequest({ action: 'save-location', id: state.selected?.id || null, name: document.querySelector('#location-name').value.trim(), cnes_unit_id: document.querySelector('#location-cnes').value, version: state.selected?.version || 0, reason: document.querySelector('#location-reason').value.trim(), is_internal_allocation: document.querySelector('#location-internal').checked, unit_type: document.querySelector('#location-type').value, parent_id: document.querySelector('#location-parent').value || null, active: document.querySelector('#location-active').checked, responsible_ids: [...document.querySelectorAll('[name="location-manager"]:checked')].map(input => input.value) }); showToast('Lotação salva.'); go('catalogs'); } catch (error) { showToast(error.message); button.disabled = false; } }
  async function saveReference(event) { event.preventDefault(); const button = event.submitter; button.disabled = true; try { await catalogRequest({ action: 'save-reference', kind: state.selected.kind, id: state.selected.item?.id || null, name: document.querySelector('#reference-name').value.trim() }); showToast('Cadastro salvo.'); go('catalogs'); } catch (error) { showToast(error.message); button.disabled = false; } }
  async function saveEmployeeRegistry(event) { event.preventDefault(); const button = event.submitter, cpf = digits(document.querySelector('#registry-cpf').value); if (!validCPF(cpf)) return showToast('Informe um CPF válido.'); button.disabled = true; try { await catalogRequest({ action: 'save-employee', id: state.selected?.id || null, full_name: document.querySelector('#registry-name').value.trim(), registration: document.querySelector('#registry-registration').value.trim(), cpf, birth_date: document.querySelector('#registry-birth').value, admission_date: document.querySelector('#registry-admission').value || null, employment_type: document.querySelector('#registry-employment').value.trim(), team: document.querySelector('#registry-team')?.value.trim() || 'Não se aplica', lotacao_id: document.querySelector('#registry-location').value, cargo_id: document.querySelector('#registry-position').value || null, funcao_id: document.querySelector('#registry-function').value || null, weekly_hours: document.querySelector('#registry-hours').value || null, active: document.querySelector('#registry-active').checked, reason: document.querySelector('#registry-reason').value.trim() }); showToast('Servidor salvo com histórico.'); go('catalogs'); } catch (error) { showToast(error.message); button.disabled = false; } }
  async function loadInclusions() {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-inclusions`, { method: 'POST', headers: sessionHeaders(state.session), body: JSON.stringify({ action: 'list' }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Não foi possível carregar as inclusões.'); state.inclusions = body.inclusions || []; state.locations = body.locations || [];
  }
  async function renderInclusions() {
    setProgress(0); if (!state.session) { await loadSession(); if (!state.session) return go('login'); } if (!['administrador', 'rh'].includes(state.profile?.role)) return go('dashboard'); app.innerHTML = '<section class="card loading-card"><div class="spinner"></div><p>Carregando inclusões funcionais…</p></section>';
    try { await loadInclusions(); } catch (error) { app.innerHTML = shell('Não foi possível carregar as inclusões', 'Tente novamente em alguns instantes.', `<div class="notice notice-danger">${esc(error.message)}</div><div class="actions"><button class="button button-secondary" data-go="dashboard">Voltar</button></div>`); return; }
    const pending = state.inclusions.filter(item => ['pendente', 'em_analise'].includes(item.status));
    app.innerHTML = `<section class="card"><div class="toolbar"><div><p class="eyebrow">Cadastros funcionais</p><h2>Inclusões pendentes</h2><p class="lead">Confira os dados declarados e associe cargo, vínculo e lotação oficiais.</p></div><div class="actions"><button class="button button-secondary" data-action="inclusions-refresh">Atualizar</button></div></div>${catalogTabs()}<div class="stats"><div class="stat"><strong>${pending.length}</strong><span>Aguardando análise</span></div><div class="stat"><strong>${state.inclusions.filter(item => item.status === 'aprovada').length}</strong><span>Aprovadas</span></div><div class="stat"><strong>${state.inclusions.filter(item => item.status === 'rejeitada').length}</strong><span>Rejeitadas</span></div></div><div class="table-wrap" style="margin-top:1.5rem"><table><thead><tr><th>Servidor</th><th>Matrícula</th><th>Lotação declarada</th><th>Cargo declarado</th><th>Situação</th><th></th></tr></thead><tbody>${state.inclusions.map(item => `<tr><td><strong>${esc(item.requested_name)}</strong><br>${esc(item.request?.protocol || '')}</td><td>${esc(item.servidor?.matricula || '—')}</td><td>${esc(item.requested_unit)}</td><td>${esc(item.requested_position || '—')}</td><td><span class="badge badge-${item.status}">${labelStatus(item.status)}</span></td><td>${['pendente', 'em_analise'].includes(item.status) ? `<button class="button button-secondary" data-inclusion="${item.id}">Conferir</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma inclusão funcional registrada.</td></tr>'}</tbody></table></div></section>`;
  }
  function renderInclusionDetail() {
    const item = state.selected; if (!item) return go('inclusions'); const locationOptions = state.locations.map(location => `<option value="${location.id}">${esc(location.code)} · ${esc(location.name)}</option>`).join('');
    app.innerHTML = shell('Conferir inclusão funcional', `${esc(item.requested_name)} · matrícula ${esc(item.servidor?.matricula || '—')}`, `<button class="text-button" data-go="inclusions">← Voltar às inclusões</button><div class="summary"><div class="summary-row"><span>Lotação declarada</span><strong>${esc(item.requested_unit)}</strong></div><div class="summary-row"><span>Cargo declarado</span><strong>${esc(item.requested_position || '—')}</strong></div><div class="summary-row"><span>Função declarada</span><strong>${esc(item.requested_function || '—')}</strong></div><div class="summary-row"><span>Vínculo declarado</span><strong>${esc(item.requested_employment_type || '—')}</strong></div></div><form id="inclusion-review-form" class="form-grid"><div class="form-section-heading field-full"><span class="step-number">1</span><div><h3>Confira os dados oficiais</h3><p>Compare as informações declaradas acima com o cadastro do RH.</p></div></div><div class="field field-full"><label for="official-location">Lotação oficial</label><select class="control" id="official-location" required><option value="">Selecione a unidade</option>${locationOptions}</select></div><div class="field"><label for="official-position">Cargo oficial</label><input class="control" id="official-position" required value="${esc(item.requested_position || '')}"></div><div class="field"><label for="official-employment">Tipo de vínculo oficial</label><input class="control" id="official-employment" required value="${esc(item.requested_employment_type || '')}"></div><div class="field field-full"><label for="inclusion-notes">Parecer ou justificativa</label><textarea class="control" id="inclusion-notes" rows="3"></textarea><small>Obrigatório se a inclusão for rejeitada.</small></div><div class="field field-full"><div class="actions actions-end"><button type="button" class="button button-primary" data-inclusion-decision="approve">Aprovar inclusão</button></div><details class="work-panel work-panel-danger"><summary>Rejeitar inclusão</summary><p class="panel-hint">Informe o motivo no campo de parecer antes de rejeitar.</p><button type="button" class="button button-danger" data-inclusion-decision="reject">Confirmar rejeição</button></details></div></form>`);
    document.querySelector('#official-employment')?.closest('.field')?.insertAdjacentHTML('afterend', `<div class="field"><label for="official-team">Equipe oficial</label><input class="control" id="official-team" maxlength="120" required value="${esc(item.requested_team || 'Não se aplica')}"><label class="inline-check"><input type="checkbox" data-team-na="official-team" ${item.requested_team === 'Não se aplica' || !item.requested_team ? 'checked' : ''}> Não se aplica</label></div>`);
  }
  async function reviewInclusion(action, button) {
    const notes = document.querySelector('#inclusion-notes').value.trim(); if (action === 'reject' && !notes) return showToast('Informe a justificativa da rejeição.');
    if (action === 'approve' && !document.querySelector('#inclusion-review-form').reportValidity()) return;
    button.disabled = true; button.textContent = 'Salvando…';
    try { const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-inclusions`, { method: 'POST', headers: sessionHeaders(state.session), body: JSON.stringify({ action, id: state.selected.id, notes, location_id: document.querySelector('#official-location').value, position: document.querySelector('#official-position').value.trim(), team: document.querySelector('#official-team').value.trim(), employment_type: document.querySelector('#official-employment').value.trim() }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a análise.'); showToast(action === 'approve' ? 'Inclusão aprovada.' : 'Inclusão rejeitada.'); go('inclusions'); }
    catch (error) { showToast(error.message); button.disabled = false; button.textContent = action === 'approve' ? 'Aprovar inclusão' : 'Confirmar rejeição'; }
  }
  async function renderDetail() {
    const r = state.selected; if (!r) return go('dashboard');
    const staff = state.profile?.role, approvals = r.approvals || [], unitReviews = r.unit_reviews || [];
    const currentDetail = captureView(); let conflicts = [], conflictError = '';
    try { conflicts = await requestConflicts(r); } catch (error) { conflictError = error.message; }
    if (!currentDetail() || state.selected !== r) return;
    let account = r.context_bond_id ? null : r.servidor?.time_bank_accounts?.[0];
    state.detailBondResources=null;
    if(r.context_bond_id) {
      const current=captureView();
      try { const resources=await operationRequest({action:'bond-resources',bond_id:r.context_bond_id}); if(!current() || state.selected!==r) return; state.detailBondResources=resources; account=resources.account; }
      catch(error) { if(!current()) return; showToast('Não foi possível conferir o saldo desta matrícula. '+error.message); }
    }
    const manager = approvals.find(item => item.stage === 'chefia_imediata') || { decision: 'pendente' };
    const rh = approvals.find(item => item.stage === 'rh') || { decision: 'pendente' };
    const canManage = ['diretor', 'rh', 'administrador'].includes(staff);
    if (canManage && (unitReviews.length || ['rh','administrador'].includes(staff))) {
      try {
        const [result, candidates, editor] = await Promise.all([
          operationRequest({action:'rejection-reasons'}),
          unitReviews.length ? operationRequest({action:'conflict-employees',request_id:r.id}) : Promise.resolve({employees:[]}),
          unitReviews.length && ['rh','administrador'].includes(staff) ? operationRequest({action:'pending-distribution-editor',request_id:r.id}) : Promise.resolve({distribution:null})
        ]);
        if (state.selected !== r || state.route !== 'detail') return;
        state.rejectionReasons = result.reasons || [];
        state.conflictEmployees = candidates.employees || [];
        state.rejectionUsesAssignment = Boolean(unitReviews.length);
        state.distributionEditor = editor.distribution;
      }
      catch (error) { if (state.selected === r && state.route === 'detail') app.innerHTML = shell('Não foi possível carregar os motivos de recusa', '', `<div class="notice notice-danger">${esc(error.message)}</div><button class="button button-secondary" data-go="dashboard">Voltar</button>`); return; }
      if (state.selected !== r || state.route !== 'detail') return;
    }
    const managerActions = ['rh', 'administrador'].includes(staff) && manager.decision === 'pendente' && ['enviada', 'em_analise'].includes(r.status) ? '<button class="button button-primary" data-approval-stage="chefia_imediata" data-approval-decision="aprovada">Aprovar na chefia</button><button class="button button-danger" data-approval-stage="chefia_imediata" data-approval-decision="rejeitada">Rejeitar</button><button class="button button-secondary" data-operation="devolver">Devolver para correção</button>' : '';
    const rhActions = canManage && manager.decision === 'aprovada' && rh.decision === 'pendente' && ['enviada', 'em_analise'].includes(r.status) ? '<button class="button button-primary" data-approval-stage="rh" data-approval-decision="aprovada">Aprovar no RH</button><button class="button button-danger" data-approval-stage="rh" data-approval-decision="rejeitada">Rejeitar</button><button class="button button-secondary" data-operation="devolver">Devolver para correção</button>' : '';
    const operational = canManage ? `${r.status === 'aprovada' ? '<button class="button button-primary" data-operation="programar">Programar afastamento</button>' : ''}${['programada', 'reprogramada'].includes(r.status) ? '<button class="button button-primary" data-operation="concluir">Concluir afastamento</button>' : ''}` : '';
    const reschedule = canManage && ['programada', 'reprogramada'].includes(r.status) ? `<details class="work-panel"><summary>Reprogramar datas</summary><p class="panel-hint">Atualize o início, o fim e o retorno de cada período. Registre a justificativa no campo de parecer acima.</p><div class="form-grid">${(r.periods || []).map((p, i) => `<div class="field"><label for="reschedule-start-${i}">Início ${i + 1}</label><input class="control" id="reschedule-start-${i}" type="date" value="${p.start_date}"></div><div class="field"><label for="reschedule-end-${i}">Fim ${i + 1}</label><input class="control" id="reschedule-end-${i}" type="date" value="${p.end_date}"></div><div class="field"><label for="reschedule-return-${i}">Retorno ${i + 1}</label><input class="control" id="reschedule-return-${i}" type="date" value="${p.return_date}"></div>`).join('')}</div><div class="actions"><button class="button button-secondary" data-operation="reprogramar">Salvar reprogramação</button></div></details>` : '';
    const cancel = canManage && !['rejeitada', 'cancelada', 'concluida'].includes(r.status) ? '<details class="work-panel work-panel-danger"><summary>Cancelar solicitação</summary><p class="panel-hint">Informe o motivo no campo de parecer antes de cancelar.</p><button class="button button-danger" data-operation="cancelar">Confirmar cancelamento</button></details>' : '';
    const actions = managerActions + rhActions + operational;
    const legacyDecision = actions || reschedule || cancel ? `<section class="decision-panel"><h3>Análise da solicitação legada</h3>${managerActions || rhActions ? renderRejectionControls() : ''}<div class="field"><label for="decision-notes">Parecer ou justificativa</label><textarea class="control" id="decision-notes" rows="3" maxlength="2000"></textarea><small>Na recusa, selecione um motivo padronizado, preencha seus dados e justifique (3 a 2000 caracteres). Obrigatório para rejeitar, devolver, reprogramar ou cancelar.</small></div>${actions ? `<div class="actions">${actions}</div>` : ''}${reschedule}${cancel}</section>` : '';
    const reviewActions = unitReviews.map(review => {
      if(['cancelada','concluida','rejeitada'].includes(r.status) || !canActOnUnitReview(review)) return '';
      const buttons = review.status === 'pendente' ? `<button class="button button-primary" data-unit-review-action="approve" data-review-id="${review.id}" data-review-version="${review.version}">Aprovar</button><button class="button button-danger" data-unit-review-action="reject" data-review-id="${review.id}" data-review-version="${review.version}">Recusar</button>` : review.status === 'aprovada' ? `<button class="button button-primary" data-unit-review-action="schedule" data-review-id="${review.id}" data-review-version="${review.version}">Adicionar ao Calendário</button><button class="button button-danger" data-unit-review-action="reject" data-review-id="${review.id}" data-review-version="${review.version}">Recusar</button>` : '';
      return buttons ? `<div class="unit-review-action"><div><strong>${esc(review.cnes?.code ? `CNES ${review.cnes.code}` : 'Unidade')}</strong><span>${esc(review.cnes?.name || '')}</span></div><div class="actions">${buttons}</div></div>` : '';
    }).join('');
    const unitDecision = unitReviews.length && canManage ? `<section class="decision-panel"><h3>Análise do contexto atual</h3><p>Aprovar apenas registra a decisão. A ausência somente entra no calendário após a ação específica.</p>${renderRejectionControls()}<div class="field"><label for="decision-notes">Explique a decisão</label><textarea class="control" id="decision-notes" rows="3" minlength="3" maxlength="2000"></textarea><small>Ao recusar, escolha o motivo, preencha seus dados específicos e justifique (3 a 2000 caracteres). A primeira inclusão no calendário debita as horas solicitadas uma única vez por matrícula. Recusa ou cancelamento estorna eventual débito, preservando o histórico. Em dúvidas sobre direitos, consulte a norma homologada e o RH; problemas técnicos devem ser encaminhados aos Administradores ou à TI da Prefeitura de Betim. Aprovação e inclusão no calendário ficam registradas pelo usuário logado.</small></div>${reviewActions || '<div class="notice">Não há ação pendente para este CNES.</div>'}</section>` : '';
    state.revisionPlan = null;
    const decision = (unitReviews.length ? unitDecision : legacyDecision) + (unitReviews.length && ['rh','administrador'].includes(staff) ? renderDistributionEditor() : '') + SGFRequestRevision.panel(r,staff);
const bank = canManage && (!r.context_bond_id || state.detailBondResources) ? `<details class="work-panel"><summary>Banco de horas</summary><div class="summary"><div class="summary-row"><span>Saldo declarado</span><strong>${((account?.declared_minutes || 0) / 60).toFixed(1)} h</strong></div><div class="summary-row"><span>Saldo validado</span><strong>${((account?.validated_minutes || 0) / 60).toFixed(1)} h</strong></div></div><form id="time-bank-form" class="form-grid"><div class="field"><label for="bank-hours">Horas a lançar</label><input class="control" id="bank-hours" type="number" step="0.5" required><small>Use um número negativo para descontar horas.</small></div><div class="field"><label for="bank-date">Data do lançamento</label><input class="control" id="bank-date" type="date" value="${iso(new Date())}" required></div><div class="field field-full"><label for="bank-description">Motivo do lançamento</label><input class="control" id="bank-description" required></div><div class="field field-full"><button class="button button-primary">Registrar horas</button></div></form></details>` : '';
    const reviewSummary = unitReviews.length ? `<h3>Análise por CNES</h3>${renderUnitReviews(unitReviews)}` : `<h3>Etapas de aprovação</h3>${renderApprovals(approvals)}`;
    app.innerHTML = shell(`Solicitação ${esc(r.protocol || r.id.slice(0, 8))}`, `${esc(r.servidor?.full_name || 'Servidor')} · ${labelType(r.type)}`, `<button class="text-button" data-go="dashboard">← Voltar às solicitações</button><div class="summary"><div class="summary-row"><span>Situação</span><strong><span class="badge badge-${r.status}">${labelStatus(r.status)}</span></strong></div><div class="summary-row"><span>Lotação</span><strong>${esc(r.context_cnes?.name || r.servidor?.lotacao?.name || '—')}</strong></div>${(r.periods || []).map((p, i) => `<div class="summary-row"><span>${r.periods.length > 1 ? `${i + 1}º período` : 'Período'}</span><strong>${formatDate(p.start_date)} a ${formatDate(p.end_date)} · retorno ${formatDate(p.return_date)}</strong></div>`).join('')}</div>${conflictError ? `<div class="notice notice-warning">Não foi possível conferir conflitos: ${esc(conflictError)}. Abra a Escala para tentar novamente.</div>` : ''}<p class="page-footnote">Conflitos: ${esc(SGFScaleConflicts.labels[state.scale.conflictCriterion])} · ${state.scale.mode === 'planning' ? 'planejamento e confirmados' : 'calendário confirmado'}. Altere o critério na Escala.</p>${conflicts.length ? `<div class="notice notice-warning"><strong>Atenção: ${conflicts.length} sobreposição(ões) de escala.</strong> ${conflicts.map(item => esc(item.servidor?.full_name)).join(', ')}.</div>` : ''}${reviewSummary}${decision}${bank}<details class="work-panel"><summary>Histórico da solicitação</summary>${renderHistory(r.status_history)}</details><details class="work-panel"><summary>Ver calendário do afastamento</summary>${renderCalendar(r.periods, r.servidor?.birth_date)}</details><div class="actions"><button class="button button-secondary" data-action="request-archive">${state.archivedRequestIds.has(r.id) ? 'Restaurar à fila' : 'Arquivar na minha fila'}</button></div>`);
    showCalendarAdjustmentInDetail(r);
    showRevisionRelation(r);
    document.querySelector('.actions')?.insertAdjacentHTML('beforeend','<button class="button button-secondary" data-go="stored-receipt">Reimprimir comprovante</button>');
    const bankForm=document.querySelector('#time-bank-form'); if(bankForm) bankForm.dataset.entryKey=crypto.randomUUID();
  }
  function showRevisionRelation(request) {
    const predecessor=state.requests.find(item=>item.id===request.replaces_request_id);
    const successor=state.requests.find(item=>item.replaces_request_id===request.id);
    const text=request.replaces_request_id?`Nova análise de ${predecessor?.protocol || request.replaces_request_id}. Decisões anteriores não autorizam este novo período.`
      :successor?`Pedido substituído por ${successor.protocol}. As decisões e datas abaixo pertencem ao histórico anterior, não ao calendário confirmado.`:'';
    if(text) document.querySelector('.summary')?.insertAdjacentHTML('beforebegin',`<div class="notice notice-warning">${esc(text)}</div>`);
  }
  async function prepareRequestRevision(button) {
    const selected=state.selected;
    const starts=[...document.querySelectorAll('[data-revision-start]')];
    if(state.profile?.role!=='administrador' || !selected || starts.some(input=>!input.reportValidity())) return;
    button.disabled=true;
    state.revisionPlan=null;
    document.getElementById('revision-plan').innerHTML='';
    const values=starts.map(input=>input.value);
    try {
      const result=await operationRequest({action:'revision-plan',request_id:selected.id,starts:values});
      if(state.selected!==selected || state.route!=='detail' || starts.some((input,i)=>input.value!==values[i])) return;
      state.revisionPlan={...result.plan,starts:values};
      document.getElementById('revision-plan').innerHTML=SGFRequestRevision.planView(result.plan,selected);
    } catch(error){showToast(error.message);} finally{button.disabled=false;}
  }
  async function commitRequestRevision(button) {
    const selected=state.selected,plan=state.revisionPlan;
    if(state.profile?.role!=='administrador' || !plan || plan.request_id!==selected?.id) return showToast('Simule novamente antes de confirmar.');
    const starts=[...document.querySelectorAll('[data-revision-start]')].map(input=>input.value);
    if(starts.some((value,i)=>value!==plan.starts[i])) return showToast('As datas mudaram. Simule novamente.');
    const inputs=[...document.querySelectorAll('[data-revision-date]'),document.getElementById('revision-reason'),document.getElementById('revision-confirm')];
    if(inputs.some(input=>!input || !input.reportValidity())) return;
    const justification=document.getElementById('revision-reason').value.trim();
    if(justification.length<3 || justification.length>2000) return showToast('Justifique em 3 a 2000 caracteres.');
    const days=[...document.querySelectorAll('[data-revision-date]')].map(input=>({date:input.dataset.revisionDate,bond_unit_id:input.value}));
    button.disabled=true;
    try {
      const result=await operationRequest({action:'revision-commit',request_id:selected.id,starts,days,fingerprint:plan.fingerprint,justification});
      showToast(`Novo protocolo ${result.replacement.protocol}. Todas as unidades precisam analisar novamente.`);
      await loadRequests();
      if(state.selected===selected && state.route==='detail'){state.selected=state.requests.find(item=>item.id===result.replacement.id);await renderDetail();}
    }catch(error){state.revisionPlan=null;document.getElementById('revision-plan')?.replaceChildren();showToast(error.message);}
    finally{button.disabled=false;}
  }
  function renderDistributionEditor() {
    const editor = state.distributionEditor;
    if (!editor) return '';
    if (!editor.editable) return '<div class="notice">Redistribuição bloqueada: confira as decisões já registradas e as pendências de revisão do calendário. Procure o Administrador/TI para revisar o caso.</div>';
    return `<details class="work-panel"><summary>Redistribuir responsabilidade de um dia</summary><p>Corrija dias antes das decisões. Revisões sem dias e ainda pendentes podem ser retiradas, com histórico preservado. Dias novos após feriado exigem indicação explícita pelo RH quando houver mais de uma unidade. Não reabre decisões. Versão ${esc(editor.version)}.</p><div class="form-grid"><div class="field"><label for="distribution-day">Dia e unidade atuais</label><select class="control" id="distribution-day" required><option value="">Selecione o dia</option>${editor.days.map(day => `<option value="${esc(day.date)}">${esc(formatDate(day.date))} · ${esc([day.current_unit,day.current_location].filter(Boolean).join(' · '))}</option>`).join('')}</select></div><div class="field"><label for="distribution-assignment">Nova unidade responsável</label><select class="control" id="distribution-assignment" required disabled><option value="">Selecione primeiro o dia</option></select></div><div class="field field-full"><label for="distribution-reason">Justificativa da redistribuição</label><textarea class="control" id="distribution-reason" rows="3" minlength="3" maxlength="2000" required></textarea></div></div><div class="actions"><button class="button button-primary" data-distribution-save>Salvar redistribuição</button></div><small>Salve um dia por vez. A solicitação será recarregada para atualizar a distribuição e as versões das análises.</small></details>`;
  }
  function renderCalendarAdjustment(request) {
    if (!request.calendar_adjustment_state || request.calendar_adjustment_state === 'clear') return '';
    const reasons = {LEGACY_COUNTING_UNKNOWN:'A forma de contagem deste pedido antigo não está registrada.',PERIOD_OVERLAP:'O ajuste faria duas parcelas se sobreporem.',EXISTING_ASSIGNMENT_INELIGIBLE:'Uma atuação responsável não está mais elegível.',REVIEW_SCOPE_REMOVED:'Uma unidade ficaria sem dias; suas decisões precisam de revisão.'};
    const message = request.calendar_adjustment_state === 'pending_distribution'
      ? `As datas foram recalculadas. Defina o CNES responsável por: ${(request.calendar_pending_dates || []).map(formatDate).join(', ')}.`
      : (reasons[request.calendar_adjustment_reason] || 'A mudança do calendário exige conferência individual.');
    return `<div class="notice notice-warning" role="status"><strong>Calendário alterado — conferência necessária.</strong> ${esc(message)} Procure o RH; aprovar ou adicionar ao calendário fica bloqueado até resolver a pendência. Decisões anteriores permanecem no histórico.</div>`;
  }
  function syncDistributionCandidates() {
    const day = state.distributionEditor?.days.find(item => item.date === document.getElementById('distribution-day')?.value);
    const select = document.getElementById('distribution-assignment');
    if (!select) return;
    const candidates = (day?.candidates || []).filter(item => item.id !== day.current_assignment);
    select.disabled = !candidates.length;
    select.innerHTML = `<option value="">${day ? candidates.length ? 'Selecione a nova unidade' : 'Não há outra atuação elegível para este dia' : 'Selecione primeiro o dia'}</option>${candidates.map(item => `<option value="${esc(item.id)}">${esc([item.unit,item.location].filter(Boolean).join(' · '))}</option>`).join('')}`;
  }
  async function savePendingDistribution(button) {
    const request = state.selected, editor = state.distributionEditor;
    if (!['servidor','rh','administrador'].includes(state.profile?.role) || !editor?.editable || editor.request_id !== request?.id) return showToast('Atualize o pedido e confira seu perfil antes de redistribuir.');
    for (const id of ['distribution-day','distribution-assignment','distribution-reason']) {
      const input = document.getElementById(id);
      if (!input || input.disabled || !input.reportValidity()) return showToast('Preencha o dia, a nova unidade e a justificativa.');
    }
    const date = document.getElementById('distribution-day').value, assignment = document.getElementById('distribution-assignment').value;
    const justification = document.getElementById('distribution-reason').value.trim();
    const day = editor.days.find(item => item.date === date);
    if (!day?.candidates.some(item => item.id === assignment) || assignment === day.current_assignment || justification.length < 3 || justification.length > 2000) return showToast('Confira a atuação elegível e a justificativa.');
    button.disabled = true; button.textContent = 'Salvando…';
    try {
      await operationRequest({action:'redistribute-pending-day',request_id:request.id,date,bond_unit_id:assignment,version:editor.version,justification});
      showToast('Responsabilidade atualizada. Confira a distribuição antes de analisar.');
      await loadRequests();
      if (state.selected === request && ['detail','employee-detail'].includes(state.route)) { state.selected = state.requests.find(item => item.id === request.id); await (state.route === 'detail' ? renderDetail() : renderEmployeeDetail()); }
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; button.textContent = 'Salvar redistribuição'; }
  }
  function renderRejectionControls() {
    return `<div class="field"><label for="rejection-code">Motivo padronizado da recusa</label><select class="control" id="rejection-code"><option value="">Selecione ao recusar</option>${(state.rejectionReasons || []).map(reason => `<option value="${esc(reason.code)}">${esc(reason.label)}</option>`).join('')}</select></div><div id="rejection-fields" class="form-grid"></div>`;
  }
  function readRejectionInput(notes) {
    if (notes.length < 3 || notes.length > 2000) throw new Error('A justificativa deve ter entre 3 e 2000 caracteres.');
    const reason = (state.rejectionReasons || []).find(item => item.code === document.querySelector('#rejection-code')?.value);
    if (!reason) throw new Error('Selecione um motivo de recusa.');
    const requiredIds = reason.input_mode === 'bank' ? ['rejection-available','rejection-required'] : reason.input_mode === 'conflict' ? ['rejection-employee','rejection-start','rejection-end'] : [];
    for (const id of requiredIds) {
      const input = document.getElementById(id);
      if (!input || !input.reportValidity()) throw new Error('Preencha os dados exigidos pelo motivo selecionado.');
    }
    const value = id => document.getElementById(id).value;
    const rejection = {code:reason.code};
    if (reason.input_mode === 'bank') {
      const available = Number(value('rejection-available')), required = Number(value('rejection-required'));
      if (!Number.isFinite(available) || !Number.isFinite(required) || available < 0 || required <= available || required > 100000) throw new Error('A quantidade necessária deve superar o saldo real informado.');
      Object.assign(rejection,{available_hours:available,required_hours:required});
    }
    if (reason.input_mode === 'conflict') {
      if (value('rejection-end') < value('rejection-start')) throw new Error('O fim do conflito não pode ser anterior ao início.');
      if (state.rejectionUsesAssignment) {
        const employee = (state.conflictEmployees || []).find(item => item.id === value('rejection-employee'));
        if (!employee) throw new Error('Selecione uma atuação válida do funcionário relacionado.');
        Object.assign(rejection,{employee_name:employee.full_name,bond_unit_id:employee.id});
      } else rejection.employee_name = value('rejection-employee').trim();
      Object.assign(rejection,{start_date:value('rejection-start'),end_date:value('rejection-end')});
    }
    return rejection;
  }
  function updateRejectionFields() {
    const reason = (state.rejectionReasons || []).find(item => item.code === document.querySelector('#rejection-code')?.value);
    const fields = document.querySelector('#rejection-fields');
    if (!fields) return;
    fields.innerHTML = reason?.input_mode === 'bank'
      ? '<div class="field"><label for="rejection-available">Saldo real conferido pelo RH (horas)</label><input class="control" id="rejection-available" type="number" min="0" max="100000" step="any" required></div><div class="field"><label for="rejection-required">Quantidade necessária (horas)</label><input class="control" id="rejection-required" type="number" min="0.01" max="100000" step="any" required></div>'
      : reason?.input_mode === 'conflict'
        ? `${renderConflictEmployeeField()}<div class="field"><label for="rejection-start">Início do período daquele funcionário</label><input class="control" id="rejection-start" type="date" required></div><div class="field"><label for="rejection-end">Fim do período daquele funcionário</label><input class="control" id="rejection-end" type="date" required></div>` : '';
  }
  function renderConflictEmployeeField() {
    if (!state.rejectionUsesAssignment) return '<div class="field"><label for="rejection-employee">Nome do funcionário relacionado</label><input class="control" id="rejection-employee" minlength="3" maxlength="200" required><small>Informação declarada pela gestão no fluxo legado; explique o conflito na justificativa.</small></div>';
    const employees = state.conflictEmployees || [];
    return `<div class="field field-full"><label for="rejection-employee">Funcionário e atuação relacionados ao conflito</label><select class="control" id="rejection-employee" required><option value="">Selecione a atuação no CNES da revisão</option>${employees.map(employee => `<option value="${esc(employee.id)}">${esc([employee.full_name,employee.registration,employee.position,employee.cnes_name,employee.location_name].filter(Boolean).join(' · '))}</option>`).join('')}</select><small>${employees.length ? 'A atuação deve pertencer ao CNES/lotação analisado e estar vigente em todo o período informado. Explique o conflito na justificativa.' : 'Não há atuação elegível neste escopo. Confira o cadastro e o contexto antes de registrar uma recusa por conflito.'}</small></div>`;
  }
  function canActOnUnitReview(review) {
    const context=state.activeContext;
    if(state.profile?.role!==context?.role || !review) return false;
    if(context.role==='administrador') return context.global===true;
    return ['rh','diretor'].includes(context.role) && Boolean(context.cnes_unit_id)
      && (review.cnes_unit_id || review.cnes?.id)===context.cnes_unit_id
      && (review.lotacao_id || null)===(context.internal_lotacao_id || null);
  }
  let unitReviewBusy=false;
  async function updateUnitReview(button) {
    if(unitReviewBusy) return;
    const selected=state.selected,current=captureView();
    const review=selected?.unit_reviews?.find(item=>item.id===button.dataset.reviewId);
    if(!canActOnUnitReview(review)) return showToast('Esta análise não pertence ao seu perfil e CNES/lotação selecionados.');
    const action = button.dataset.unitReviewAction;
    const notes = document.querySelector('#decision-notes')?.value.trim() || '';
    if (action === 'reject' && !notes) return showToast('Informe a justificativa da recusa.');
    let rejection = null;
    if (action === 'reject') { try { rejection = readRejectionInput(notes); } catch (error) { return showToast(error.message); } }
    unitReviewBusy=true;
    const reviewButtons=[...document.querySelectorAll('[data-unit-review-action]')];
    reviewButtons.forEach(item=>item.disabled=true);
    button.disabled = true; button.textContent = 'Salvando…';
    try {
      await operationRequest({ action: 'unit-review', review_id: button.dataset.reviewId, review_action: action, version: Number(button.dataset.reviewVersion), notes, rejection });
      if(!current() || state.selected!==selected) return;
      showToast(action === 'approve' ? 'Solicitação aprovada neste CNES.' : action === 'reject' ? 'Solicitação recusada neste CNES.' : 'Solicitação adicionada ao calendário deste CNES.');
      await loadRequests();
      if(!current() || state.selected!==selected) return;
      state.selected = state.requests.find(item => item.id === selected.id); await renderDetail();
    } catch (error) { if(current() && state.selected===selected){showToast(error.message);reviewButtons.forEach(item=>item.disabled=false);button.textContent = action === 'approve' ? 'Aprovar' : action === 'reject' ? 'Recusar' : 'Adicionar ao Calendário';} }
    finally{unitReviewBusy=false;}
  }
  async function updateApproval(stage, decision) {
    const notes = document.querySelector('#decision-notes')?.value.trim() || '';
    const selected = state.selected, approval = selected?.approvals?.find(item => item.stage === stage);
    if (!approval || selected.unit_reviews?.length) return showToast('Atualize a solicitação para analisar a etapa correta.');
    let rejection = null;
    if (decision === 'rejeitada') { try { rejection = readRejectionInput(notes); } catch (error) { return showToast(error.message); } }
    const buttons = [...document.querySelectorAll('[data-approval-stage]')];
    buttons.forEach(button => button.disabled = true);
    try {
      await operationRequest({action:'legacy-approval',request_id:selected.id,stage,decision,version:approval.version,notes,rejection});
      showToast(decision === 'aprovada' ? 'Etapa aprovada.' : 'Etapa recusada com motivo registrado.');
      if (state.selected === selected && state.route === 'detail') { state.route = 'dashboard'; renderWorkspaceNav(); await renderDashboard(); }
    } catch (error) { showToast(error.message); buttons.forEach(button => button.disabled = false); }
  }
  let operationBusy = false;
  async function updateOperation(operation) {
    if (operationBusy || !state.selected) return;
    const request = state.selected, current = captureView();
    const notes = document.querySelector('#decision-notes')?.value.trim() || '';
    if (['devolver','reprogramar','cancelar','reenviar'].includes(operation) && !notes) return showToast('Informe a justificativa antes de continuar.');
    const periods = operation === 'reprogramar' ? request.periods.map((p,i)=>({...p,start_date:document.querySelector('#reschedule-start-'+i).value,end_date:document.querySelector('#reschedule-end-'+i).value,return_date:document.querySelector('#reschedule-return-'+i).value})) : null;
    const buttons = [...document.querySelectorAll('[data-operation]')];
    operationBusy = true; buttons.forEach(button=>button.disabled=true);
    try {
      await operationRequest({action:'operation',request_id:request.id,operation,notes,periods});
      if (!current() || state.selected !== request) return;
      showToast('Operação concluída.'); go(state.profile.role === 'servidor' ? 'employee-dashboard' : 'dashboard');
    } catch (error) { if (current() && state.selected === request) showToast(error.message); }
    finally { operationBusy = false; if (current() && state.selected === request) buttons.forEach(button=>button.disabled=false); }
  }
function render() { state.route = SGFAccessPolicy.resolve(state.route,state.profile?.role,Boolean(state.session),state.profile?.must_change_password); if(state.session && state.activeContext?.institutional) state.route = ['choose-operator','rh-workspace'].includes(state.route) ? state.route : 'rh-workspace'; if (state.session && state.profile?.must_change_password && !['set-password', 'change-password'].includes(state.route)) state.route = 'change-password'; if (state.session && state.profile && !state.profile.role && !['set-password', 'change-password', 'choose-access'].includes(state.route)) state.route = 'choose-access'; if (['types', 'identity', 'rules', 'dates', 'confirm', 'receipt'].includes(state.route) && (!state.session || state.profile?.role !== 'servidor')) state.route = state.session ? 'choose-access' : 'login'; if (!client) { app.innerHTML = shell('Não foi possível iniciar o SGF', 'A biblioteca de conexão não foi carregada. Confira sua conexão e atualize a página.', ''); return; } sessionAction.classList.toggle('hidden', !state.session); renderHeaderUser(); renderWorkspaceNav(); ({ 'rh-calendar': renderRhCalendar, 'rh-accounts': renderUnits, 'choose-operator': renderRhWorkspace, 'rh-workspace': renderRhWorkspace, 'cnes-import': renderUnits, home: renderHome, quick: renderQuick, 'quick-result': renderQuickResult, types: renderTypes, identity: renderIdentity, rules: renderRules, dates: renderDates, confirm: renderConfirm, receipt: renderReceipt, 'employee-dashboard': renderEmployeeDashboard, 'employee-detail': renderEmployeeDetail, login: renderLogin, 'choose-access': renderAccessChoice, 'access-request': renderAccessRequest, 'recover-password': renderRecoverPassword, 'set-password': renderSetPassword, 'change-password': renderChangePassword, dashboard: renderDashboard, notifications: renderNotifications, 'audit-history': renderAuditHistory, scale: renderScale, 'access-requests': renderAccessRequests, 'access-request-detail': renderAccessRequestDetail, profiles: renderProfiles, 'profile-detail': renderProfileDetail, 'profile-create': renderProfileCreate, catalogs: renderCatalogs, organization: renderOrganization, 'bond-resources': renderBondResources, 'rejection-catalog': renderReasonCatalog, 'calendar-admin': renderCalendarAdmin, 'location-detail': renderLocationDetail, 'reference-detail': renderReferenceDetail, 'employee-registry-detail': renderEmployeeRegistryDetail, inclusions: renderInclusions, 'inclusion-detail': renderInclusionDetail, detail: renderDetail }[state.route] || renderHome)(); app.focus({ preventScroll: true }); }

  document.addEventListener('click', async event => {
    if(!controlAllowed(event.target)) { event.preventDefault(); return showToast('Ação indisponível para o perfil ativo.'); }
    const revisionPlanButton=event.target.closest('[data-revision-plan]'); if(revisionPlanButton){await prepareRequestRevision(revisionPlanButton);return;}
    const revisionCommitButton=event.target.closest('[data-revision-commit]'); if(revisionCommitButton){await commitRequestRevision(revisionCommitButton);return;}
    const distributionButton = event.target.closest('[data-distribution-save]'); if (distributionButton) { await savePendingDistribution(distributionButton); return; }
    const reasonEdit = event.target.closest('[data-reason-edit]');
    if (reasonEdit) { editReasonCatalog(reasonEdit.dataset.reasonEdit); return; }
    const auditPage = event.target.closest('[data-audit-page]');
    if (auditPage && !auditPage.disabled) { state.auditFilter.page = Math.max(0, state.auditFilter.page + Number(auditPage.dataset.auditPage)); await renderAuditHistory(); return; }
    const receiptAction = event.target.closest('[data-action]')?.dataset.action;
    if (receiptAction === 'copy-receipt-email' && state.receiptContext) await copyText(`Assunto: ${receiptSubject(state.receiptContext)}\n\n${receiptText(state.receiptContext, true)}`, 'Assunto e texto do e-mail copiados.');
    if (receiptAction === 'copy-receipt-data' && state.receiptContext) await copyText(receiptText(state.receiptContext), 'Dados do comprovante copiados.');
    if (receiptAction === 'copy-selected-email' && state.selected) { const data = receiptData(state.selected, true); await copyText(`Assunto: ${receiptSubject(data)}\n\n${receiptText(data, true)}`, 'Assunto e texto do e-mail copiados.'); }
    if (receiptAction === 'copy-selected-data' && state.selected) await copyText(receiptText(receiptData(state.selected, true)), 'Dados do comprovante copiados.');
    const addBond = event.target.closest('[data-access-add-bond]'); if (addBond) { document.querySelector('#access-bonds')?.insertAdjacentHTML('beforeend', accessBondMarkup()); return; }
    const removeBond = event.target.closest('[data-access-remove-bond]'); if (removeBond) { const bonds = document.querySelectorAll('[data-access-bond]'); if (bonds.length === 1) return showToast('A solicitação precisa ter ao menos um vínculo.'); removeBond.closest('[data-access-bond]')?.remove(); return; }
    const addUnit = event.target.closest('[data-access-add-unit]'); if (addUnit) { const bond = addUnit.closest('[data-access-bond]'); bond?.querySelector('[data-access-units]')?.insertAdjacentHTML('beforeend', accessUnitMarkup(bond.dataset.bondKey)); return; }
    const removeUnit = event.target.closest('[data-access-remove-unit]'); if (removeUnit) { const bond = removeUnit.closest('[data-access-bond]'); const units = bond?.querySelectorAll('[data-access-unit]') || []; if (units.length === 1) return showToast('Cada vínculo precisa ter ao menos um CNES.'); removeUnit.closest('[data-access-unit]')?.remove(); return; }
    const accessButton = event.target.closest('[data-access-context]'); if (accessButton) { await activateAccess(accessButton.dataset.accessContext); return; }
    const goButton = event.target.closest('[data-go]'); if (goButton) { go(goButton.dataset.go); return; }
    const typeButton = event.target.closest('[data-type]'); if (typeButton) { state.request.type = typeButton.dataset.type; go('identity'); return; }
    const requestButton = event.target.closest('[data-request]'); if (requestButton) { state.selected = state.requests.find(r => r.id === requestButton.dataset.request); go(state.profile?.role === 'servidor' ? 'employee-detail' : 'detail'); return; }
    const scaleDateButton = event.target.closest('[data-scale-date]'); if (scaleDateButton && !scaleDateButton.disabled) { state.scale.focusDate = scaleDateButton.dataset.scaleDate; await renderScale(true); return; }
    const inclusionButton = event.target.closest('[data-inclusion]'); if (inclusionButton) { state.selected = state.inclusions.find(item => item.id === inclusionButton.dataset.inclusion); go('inclusion-detail'); return; }
    const profileButton = event.target.closest('[data-profile]'); if (profileButton) { state.selected = state.profiles.find(profile => profile.id === profileButton.dataset.profile); go('profile-detail'); return; }
    const accessRequestButton = event.target.closest('[data-access-request]'); if (accessRequestButton) { state.selected = state.accessRequests.find(item => item.id === accessRequestButton.dataset.accessRequest); go('access-request-detail'); return; }
    const calendarEdit = event.target.closest('[data-calendar-edit]'); if (calendarEdit) { const item = state.calendarAdmin.find(entry => entry.id === calendarEdit.dataset.calendarEdit); if (item) { document.querySelector('#holiday-editor').open=true; document.querySelector('#calendar-event-form').dataset.eventId = item.id; document.querySelector('#calendar-event-form').dataset.version = item.version; document.querySelector('#calendar-date').value = item.event_date; document.querySelector('#calendar-type').value = item.type; document.querySelector('#calendar-name').value = item.name; document.querySelector('#calendar-active').checked = item.active; document.querySelector('#calendar-date').focus(); } return; }
    const notificationRead = event.target.closest('[data-notification-read]'); if (notificationRead) { try { await operationRequest({ action: 'read-notifications', id: notificationRead.dataset.notificationRead }); await renderNotifications(); } catch (error) { showToast(error.message); } return; }
    const notificationPage = event.target.closest('[data-notification-page]'); if(notificationPage){state.notificationsPage=Math.max(0,(state.notificationsPage||0)+Number(notificationPage.dataset.notificationPage)); await renderNotifications(); return;}
    const notificationOpen = event.target.closest('[data-notification-open]'); if (notificationOpen) { try { await operationRequest({ action: 'read-notifications', id: notificationOpen.dataset.notificationOpen }); await loadRequests(); state.selected = state.requests.find(item => item.id === notificationOpen.dataset.requestId); if (!state.selected) throw new Error('Esta solicitação não está disponível no seu acesso atual.'); go(state.profile.role === 'servidor' ? 'employee-detail' : 'detail'); } catch (error) { showToast(error.message); } return; }
    const catalogLocation = event.target.closest('[data-catalog-location]'); if (catalogLocation) { state.selected = state.catalog.locations.find(item => item.id === catalogLocation.dataset.catalogLocation); go('location-detail'); return; }
    const orgEdit=event.target.closest('[data-organization-edit]'); if(orgEdit) {
      const kind=orgEdit.dataset.organizationEdit,list=kind==='cnes'?state.organization.cnesUnits:state.organization.teams;
      const item=orgEdit.dataset.id?list.find(x=>x.id===orgEdit.dataset.id):null;
      document.querySelector('#organization-editor').innerHTML=SGFOrganization.registryEditor(kind,item,state.organization);
      document.querySelector('#org-name').focus(); return;
    }
    const bondOpen=event.target.closest('[data-bond-resources]'); if(bondOpen) { state.resourceBond=state.catalog.bonds.find(b=>b.id===bondOpen.dataset.bondResources); go('bond-resources'); return; }
    const rightEdit=event.target.closest('[data-right-edit]'); if(rightEdit) {
      document.querySelector('#right-editor').innerHTML=SGFOrganization.rightEditor(state.bondResources.rights.find(r=>r.id===rightEdit.dataset.rightEdit));
      document.querySelector('#right-type').focus(); return;
    }
    const catalogEmployee = event.target.closest('[data-catalog-employee]'); if (catalogEmployee) { state.selected = state.catalog.employees.find(item => item.id === catalogEmployee.dataset.catalogEmployee); go('employee-registry-detail'); return; }
    const catalogReference = event.target.closest('[data-catalog-reference]'); if (catalogReference) { const kind = catalogReference.dataset.catalogReference, list = kind === 'cargo' ? state.catalog.positions : state.catalog.functions; state.selected = { kind, item: list.find(item => item.id === catalogReference.dataset.referenceId) }; go('reference-detail'); return; }
    const catalogNew = event.target.closest('[data-catalog-new]'); if (catalogNew) { const kind = catalogNew.dataset.catalogNew; state.selected = kind === 'employee' || kind === 'location' ? null : { kind, item: null }; go(kind === 'employee' ? 'employee-registry-detail' : kind === 'location' ? 'location-detail' : 'reference-detail'); return; }
    const accessDecision = event.target.closest('[data-access-decision]'); if (accessDecision) { await reviewAccess(accessDecision.dataset.accessDecision, accessDecision); return; }
    const inclusionDecision = event.target.closest('[data-inclusion-decision]'); if (inclusionDecision) { await reviewInclusion(inclusionDecision.dataset.inclusionDecision, inclusionDecision); return; }
    const approvalButton = event.target.closest('[data-approval-stage]'); if (approvalButton) { await updateApproval(approvalButton.dataset.approvalStage, approvalButton.dataset.approvalDecision); return; }
    const operationButton = event.target.closest('[data-operation]'); if (operationButton) { await updateOperation(operationButton.dataset.operation); return; }
    const unitReviewButton = event.target.closest('[data-unit-review-action]'); if (unitReviewButton) { await updateUnitReview(unitReviewButton); return; }
    const pageButton = event.target.closest('[data-dashboard-page]'); if (pageButton && !pageButton.disabled) { state.dashboard.page = Number(pageButton.dataset.dashboardPage); await renderDashboard(); return; }
    const scaleMonthButton = event.target.closest('[data-scale-month]'); if (scaleMonthButton) { const [year, month] = state.scale.month.split('-').map(Number), shifted = new Date(year, month - 1 + Number(scaleMonthButton.dataset.scaleMonth), 1); state.scale.rangeMode = 'month'; state.scale.month = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`; await renderScale(); return; }
    const passwordButton = event.target.closest('[data-action="toggle-password"]'); if (passwordButton) { const input = document.querySelector(`#${passwordButton.dataset.target}`); if (input) { const visible = input.type === 'password'; input.type = visible ? 'text' : 'password'; passwordButton.textContent = visible ? 'Ocultar' : 'Mostrar'; passwordButton.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha'); passwordButton.setAttribute('aria-pressed', String(visible)); } return; }
    const action = event.target.closest('[data-action]')?.dataset.action; if (action === 'print') window.print(); if (action === 'submit-request') await submitRequest(); if (action === 'restart') { if (state.profile?.role === 'servidor') await prepareEmployeeRequest(); else location.reload(); } if (action === 'refresh') await renderDashboard(); if (action === 'catalogs-refresh') await renderCatalogs(); if (action === 'catalog-locations-toggle') { state.catalogShowAll = !state.catalogShowAll; filterCatalogLocations(); } if (action === 'access-requests-refresh') await renderAccessRequests(); if (action === 'profiles-refresh') await renderProfiles(); if (action === 'inclusions-refresh') await renderInclusions(); if (action === 'employee-refresh') await renderEmployeeDashboard(); if (action === 'employee-new-request') showToast('Os afastamentos são programados pelo RH da unidade.');
    if (['responsibility-fill-all', 'responsibility-fill-weekday'].includes(action)) {
      const unit = document.querySelector('#responsibility-bulk-context')?.value;
      if (!unit) return showToast('Selecione o CNES para o preenchimento rápido.');
      const weekday = Number(document.querySelector('#responsibility-weekday')?.value);
      document.querySelectorAll('[data-responsibility-date]').forEach(select => {
        if (action === 'responsibility-fill-all' || dateFrom(select.dataset.responsibilityDate).getDay() === weekday) select.value = unit;
      });
      syncResponsibilityDraft();
      showToast(action === 'responsibility-fill-all' ? 'CNES aplicado a todos os dias úteis.' : 'CNES aplicado ao dia da semana selecionado.');
    }
    if (action === 'dashboard-clear') { state.dashboard = { query: '', status: '', type: '', sort: 'newest', archived: false, page: 1, pageSize: 10 }; await renderDashboard(); }
    if (action === 'notifications-read') { try { await operationRequest({ action: 'read-notifications' }); await renderNotifications(); } catch (error) { showToast(error.message); } }
    if (action === 'request-archive' && state.selected) { try { const archived = !state.archivedRequestIds.has(state.selected.id); await operationRequest({ action: 'archive-request', request_id: state.selected.id, archived }); showToast(archived ? 'Solicitação arquivada na sua fila.' : 'Solicitação restaurada à fila.'); go('dashboard'); } catch (error) { showToast(error.message); } }
    if (action === 'profile-reset' && state.selected && window.confirm(`Resetar a senha de ${state.selected.full_name}?`)) { try { const result = await profileRequest({ action: 'reset-password', profile_id: state.selected.id }); presentTemporaryPassword(result.temporary_password); showToast('Senha redefinida. A troca será obrigatória no próximo login.'); } catch (error) { showToast(error.message); } }
    if (action === 'profile-deactivate' && state.selected && window.confirm(`Desativar o acesso de ${state.selected.full_name}? O histórico será preservado.`)) { try { await profileRequest({ action: 'deactivate', profile_id: state.selected.id }); showToast('Usuário desativado.'); go('profiles'); } catch (error) { showToast(error.message); } }
  });
  document.addEventListener('input', event => { if (event.target.id === 'catalog-location-search') filterCatalogLocations(); if(event.target.id==='organization-search') { const query=event.target.value.trim().toLocaleLowerCase('pt-BR'); app.querySelectorAll('[data-org-row]').forEach(row=>{row.hidden=!row.dataset.search.includes(query);}); } });
  document.addEventListener('change', event => {
    if (event.target.id === 'rejection-code') updateRejectionFields();
    if(event.target.id==='rightId') { const right=state.requestResources?.rights.find(r=>r.id===event.target.value); if(right && document.querySelector('#acquisitionEnd')) document.querySelector('#acquisitionEnd').value=right.acquisition_end; }
    if (event.target.id === 'distribution-day') syncDistributionCandidates();
    if (event.target.id === 'manual-conflict-scope') document.querySelector('#manual-conflict-employee').innerHTML = manualEmployeeOptions(event.target.value);
  });
  document.addEventListener('change', event => { if (event.target.matches('.access-cnes, .access-team-type')) updateAccessUnitOptions(event.target.closest('[data-access-unit]')); if (event.target.matches('[data-team-na]')) { const input = document.getElementById(event.target.dataset.teamNa); if (input) { input.value = event.target.checked ? 'Não se aplica' : ''; input.readOnly = event.target.checked; input.focus(); syncControlValidation(input); } } if (event.target.id === 'catalog-sort') { state.catalogSort = event.target.value; renderCatalogs(); } if (event.target.id === 'profile-sort') { state.profileSort = event.target.value; renderProfiles(); } if (event.target.id === 'scale-focus-date') { state.scale.focusDate = event.target.value; renderScale(true); } if (event.target.id === 'minimum-location') { state.scale.minimumLocation = event.target.value; renderScale(true); } if (event.target.id === 'minimum-date') { state.scale.minimumDate = event.target.value; renderScale(true); } syncControlValidation(event.target); });
  document.addEventListener('submit', async event => {
    if(event.target.id==='organization-form') return saveOrganization(event);
    if(['bond-bank-form','bond-right-form','bond-registry-form'].includes(event.target.id)) return saveBondResource(event);
    if(!controlAllowed(event.target)) { event.preventDefault(); return showToast('Ação indisponível para o perfil ativo.'); }
    if (event.target.id === 'reason-catalog-form') return saveReasonCatalog(event);
    if (event.target.id === 'audit-filter-form') {
      event.preventDefault();
      Object.assign(state.auditFilter, {start_date: document.querySelector('#audit-start').value, end_date: document.querySelector('#audit-end').value, page: 0});
      for (const key of ['event','actor_name','affected_name','registration','actor_id','entity_id','bond_id','cnes_id','location_id']) state.auditFilter[key] = event.target.elements[key]?.value.trim() || '';
      await renderAuditHistory(); return;
    }
    if (event.target.id === 'manual-conflict-form' || event.target.matches?.('.manual-conflict-close-form')) return saveManualConflict(event);
    if (event.target.id === 'quick-form') return submitQuick(event); if (event.target.id === 'login-form') return login(event); if (event.target.id === 'access-request-form') return requestAccess(event); if (event.target.id === 'recover-password-form') return recoverPassword(event); if (event.target.id === 'set-password-form') return setPassword(event); if (event.target.id === 'change-password-form') return changePassword(event); if (event.target.id === 'profile-access-form') return saveProfileAccess(event); if (event.target.id === 'profile-create-form') return createProfile(event); if (event.target.id === 'my-location-form') return saveMyLocation(event); if (event.target.id === 'calendar-event-form') return saveCalendarEvent(event); if (event.target.id === 'minimum-scale-form') { event.preventDefault(); const button = event.submitter; button.disabled = true; try { await operationRequest({ action: 'scale-save', cnes_unit_id: state.scaleLocations.find(item => item.id === state.scale.minimumLocation)?.cnes_unit_id, internal_lotacao_id: state.scaleLocations.find(item => item.id === state.scale.minimumLocation)?.lotacao_id || null, version: Number(event.target.dataset.version), date: state.scale.minimumDate, source_date: event.target.dataset.sourceDate || null, bond_unit_ids: [...document.querySelectorAll('[name="minimum-employee"]:checked')].map(item => item.value) }); showToast('Escala mínima salva.'); await renderScale(); } catch (error) { showToast(error.message); button.disabled = false; } return; } if (event.target.id === 'location-form') return saveLocation(event); if (event.target.id === 'reference-form') return saveReference(event); if (event.target.id === 'employee-registry-form') return saveEmployeeRegistry(event); event.preventDefault();
    if (event.target.id === 'time-bank-form') { const button = event.submitter; button.disabled = true; try { await operationRequest({ action: 'time-bank', ...(state.selected.context_bond_id ? { bond_id: state.selected.context_bond_id, version: state.detailBondResources.account.version, entry_key: event.target.dataset.entryKey } : { servidor_id: state.selected.servidor.id }), hours: document.querySelector('#bank-hours').value, occurred_on: document.querySelector('#bank-date').value, description: document.querySelector('#bank-description').value.trim() }); showToast('Lançamento registrado.'); await loadRequests(); state.selected = state.requests.find(r => r.id === state.selected.id); renderDetail(); } catch (error) { showToast(error.message); button.disabled = false; } return; }
    if (event.target.id === 'dashboard-filter-form') { state.dashboard.query = document.querySelector('#dashboard-query').value; state.dashboard.status = document.querySelector('#dashboard-status').value; state.dashboard.type = document.querySelector('#dashboard-type').value; state.dashboard.sort = document.querySelector('#dashboard-sort').value; state.dashboard.archived = document.querySelector('#dashboard-archived').value === 'archived'; state.dashboard.page = 1; await renderDashboard(); return; }
    if (event.target.id === 'scale-filter-form') { const rangeMode = document.querySelector('#scale-range-mode').value, rangeStart = document.querySelector('#scale-range-start').value, rangeEnd = document.querySelector('#scale-range-end').value; try { SGFScaleRange.range({rangeMode,rangeStart,rangeEnd,month:document.querySelector('#scale-month').value}); } catch (error) { showToast(error.message); return; } state.scale.rangeMode = rangeMode; state.scale.rangeStart = rangeStart; state.scale.rangeEnd = rangeEnd; state.scale.month = document.querySelector('#scale-month').value; state.scale.cnes = document.querySelector('#scale-cnes').value; state.scale.mode = document.querySelector('#scale-mode').value; state.scale.location = document.querySelector('#scale-location').value; state.scale.position = document.querySelector('#scale-position').value; state.scale.functionId = document.querySelector('#scale-function').value; state.scale.team = document.querySelector('#scale-team').value; state.scale.conflictCriterion = document.querySelector('#scale-conflict-criterion').value; state.scale.status = document.querySelector('#scale-status').value; await renderScale(); return; }
    if (event.target.id === 'identity-form') {
      const ids = ['name', 'cpf', 'birthDate', 'registration', 'admissionDate', 'employmentType', 'position', 'functionName', 'unit']; ids.forEach(id => state.request[id] = document.querySelector(`#${id}`).value.trim()); state.request.cpf = formatCPF(state.request.cpf);
      if (!validCPF(state.request.cpf)) return showToast('Informe um CPF válido.'); if (state.request.admissionDate < state.request.birthDate) return showToast('A admissão não pode ser anterior ao nascimento.'); go('rules');
    } else if (event.target.id === 'rules-form') {
      ['rightId', 'acquisitionEnd', 'unjustifiedAbsences', 'split', 'availableHours', 'dailyHours', 'addBankHours', 'prizeDays'].forEach(id => { const el = document.querySelector(`#${id}`); if (el) state.request[id] = el.value; });
      if (state.request.type === 'banco_horas' && ruleSummary().days < 1) return showToast('O saldo não corresponde a um dia completo da jornada informada.'); if (state.request.split !== 'none' && state.request.employmentType !== 'efetivo') state.request.split = 'none'; go('dates');
    } else if (event.target.id === 'dates-form') {
      state.request.mode = document.querySelector('#mode').value; const chosen = document.querySelector('#chosenDate').value; state.request.secondStartDate = document.querySelector('#secondStartDate')?.value || ''; try { state.request.periods = calculatePeriods(chosen); state.request.dayResponsibilities = preserveResponsibilities(state.request.periods); state.request.startDate = state.request.periods[0].start_date; state.request.returnDate = state.request.periods.at(-1).return_date; go('confirm'); } catch (error) { showToast(error.message); }
    }
  });
  document.addEventListener('change', event => { if (event.target.id === 'quick-mode') { const date = document.querySelector('#quick-date'); if (date) date.value = ''; } if (['quick-type', 'quick-mode'].includes(event.target.id)) syncQuickFields(); if (event.target.id === 'mode') { const date = document.querySelector('#chosenDate'); if (date) date.value = event.target.value === 'return' ? state.request.returnDate : state.request.startDate; syncDatesField(); } if (event.target.matches('[data-responsibility-date]')) { const context = responsibilityContexts().find(item => item.bond_unit_id === event.target.value); state.request.dayResponsibilities = (state.request.dayResponsibilities || []).filter(item => item.date !== event.target.dataset.responsibilityDate); if (context) state.request.dayResponsibilities.push({ date: event.target.dataset.responsibilityDate, bond_unit_id: context.bond_unit_id, cnes_unit_id: context.cnes_unit_id }); } if (event.target.name === 'access-role') syncRoleScope('access-role', 'access-scope-group'); if (event.target.name === 'profile-role') syncRoleScope('profile-role', 'profile-scope-group'); });
  document.addEventListener('input', event => { if (event.target.id === 'notes') state.request.notes = event.target.value; if (['cpf', 'employee-cpf', 'access-cpf', 'profile-cpf', 'registry-cpf'].includes(event.target.id)) event.target.value = formatCPF(event.target.value); if (['access-identifier', 'access-password'].includes(event.target.id)) document.querySelector('#login-error')?.classList.add('hidden'); if (event.target.id === 'access-scope-search') filterScopeList('access-scope-search', 'access-scope-list'); if (event.target.id === 'profile-scope-search') filterScopeList('profile-scope-search', 'profile-scope-list'); syncControlValidation(event.target); });
  sessionAction.addEventListener('click', async () => { await client?.auth.signOut(); sessionStorage.removeItem('sgf-access-role'); sessionStorage.removeItem('sgf-access-context'); state.session = null; state.profile = null; state.rhState = null; state.activeContext = null; state.accessContexts = []; state.requests = []; state.selected = null; state.requestResources = null; state.resourceBond = null; state.detailBondResources = null; state.organization = null; go('home'); });
  Promise.allSettled([initializeAuthSession(), loadCalendarEvents()]).then(results => {
    if (results[0].status === 'rejected') showToast('Não foi possível carregar sua sessão. Confira a conexão e atualize a página.');
  }).finally(() => render());
})();
