import {createHash} from 'node:crypto';

export const CNES_ORIGIN = 'https://cnes2.datasus.gov.br';
const canonical = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

// O portal legado usa tabelas e entidades HTML; nunca executar seu HTML/scripts.
export function textContent(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (_, entity) => {
      const named = {nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', apos:"'"};
      if (entity[0] !== '#') return named[entity.toLowerCase()];
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    }).replace(/\s+/g, ' ').trim();
}

function rows(html) {
  if (typeof html !== 'string' || html.length > 2_000_000) throw Error('CNES_DOCUMENT_INVALID');
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => ({
    html:match[1], cells:[...match[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map(cell => ({
      value:textContent(cell[2]), span:Number(cell[1].match(/\bcolspan\s*=\s*["']?(\d+)/i)?.[1] || 1),
    })),
  }));
}

function table(html, labels) {
  const all = rows(html);
  const index = all.findIndex(row => labels.every(label => row.cells.some(cell => canonical(cell.value) === label)));
  if (index < 0) throw Error('CNES_TABLE_NOT_RECOGNIZED');
  const columns = [];
  for (const cell of all[index].cells) {
    if (cell.span < 1 || cell.span > 20) throw Error('CNES_TABLE_NOT_RECOGNIZED');
    columns.push(canonical(cell.value));
    for (let i=1;i<cell.span;i++) columns.push(`${canonical(cell.value)}:${i}`);
  }
  return {columns, rows:all.slice(index+1)};
}

function values(row, columns) {
  if (row.cells.length !== columns.length || row.cells.some(cell => cell.span !== 1)) throw Error('CNES_ROW_INVALID');
  return Object.fromEntries(columns.map((name,index) => [name,row.cells[index].value]));
}

function date(value) {
  if (!value || value === '-') return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw Error('CNES_DATE_INVALID');
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== iso) throw Error('CNES_DATE_INVALID');
  return iso;
}

function hours(value) {
  const match = /^(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:Hs\.?)?$/i.exec(value);
  if (!match) throw Error('CNES_HOURS_INVALID');
  const result = Number(match[1].replace(',','.'));
  if (result > 168) throw Error('CNES_HOURS_INVALID');
  return result;
}

function cns(value) {
  if (!/^\d{15}$/.test(value)) throw Error('CNES_IDENTITY_INVALID');
  return value;
}

function key(record) {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

export function parseProfessionals(html) {
  const data = table(html,['nome','cns','cbo','ch outros','ch amb.','ch hosp.','total','vinculacao','tipo','subtipo','situacao']);
  const result = new Map();
  for (const row of data.rows) {
    const raw = row.cells[0]?.value || '';
    // Páginas repetem cabeçalhos e possuem linhas de navegação depois da tabela.
    if (!row.cells.some(cell => /^\d{6}\s*-|^\d{15}$/.test(cell.value))) continue;
    const item = values(row,data.columns), occupation = /^(\d{6})\s*-\s*(.+)$/.exec(item.cbo);
    if (!occupation || !raw) throw Error('CNES_ROW_INVALID');
    const record = {
      fullName:item.nome, cns:cns(item.cns), principalCns:null,
      cbo:occupation[1], occupation:occupation[2],
      weeklyHours:hours(item.total), hoursOther:hours(item['ch outros']),
      hoursAmbulatory:hours(item['ch amb.']), hoursHospital:hours(item['ch hosp.']),
      relationship:item.vinculacao, relationshipType:item.tipo, relationshipSubtype:item.subtipo,
      status:item.situacao, sourceEntryDate:date(item['dt.entrada']),
      deactivationCompetence:item['comp. desativacao'] || null,
    };
    const master = item['cns master/principal'] || item['* cns master/principal'];
    if (master) record.principalCns=cns(master);
    const sum=record.hoursOther+record.hoursAmbulatory+record.hoursHospital;
    if (Math.abs(sum-record.weeklyHours)>0.01) throw Error('CNES_HOURS_TOTAL_MISMATCH');
    const sourceKey=key(record);
    result.set(sourceKey,{sourceKey,...record});
  }
  if (!result.size) throw Error('CNES_PROFESSIONALS_EMPTY_REQUIRES_REVIEW');
  return [...result.values()];
}

export function teamUrl(href, cnesCode) {
  const url = new URL(href,CNES_ORIGIN+'/');
  if (url.origin !== CNES_ORIGIN || url.pathname !== '/Mod_Equipes_Profisssional.asp' || url.hash || url.username || url.password) throw Error('CNES_TEAM_URL_INVALID');
  const expected = ['VUnidade','Varea','VTipo','VMunicipio','VSeqEq'];
  if ([...url.searchParams.keys()].length !== expected.length || expected.some(name => !/^\d{1,13}$/.test(url.searchParams.get(name)||''))
    || url.searchParams.get('VUnidade') !== `310670${cnesCode}` || url.searchParams.get('VMunicipio') !== '310670') throw Error('CNES_TEAM_URL_INVALID');
  return url.href;
}

export function parseTeams(html,cnesCode) {
  if (!/^\d{7}$/.test(cnesCode)) throw Error('CNES_CODE_INVALID');
  if(canonical(textContent(html)).endsWith('estabelecimento nao possui equipes')) return [];
  const data=table(html,['tipo','ine','nome','area','data ativacao','data desativacao']);
  const result=new Map();
  for (const row of data.rows) {
    const links=[...row.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
      .map(match=>match[1].replace(/&amp;/gi,'&')).filter(href=>/Mod_Equipes_Profisssional\.asp/i.test(href));
    if (!links.length) continue;
    if (links.length !== 1) throw Error('CNES_TEAM_ROW_INVALID');
    const item=values(row,data.columns), url=teamUrl(links[0],cnesCode);
    if (!/^\d{10}$/.test(item.ine) || !item.nome) throw Error('CNES_TEAM_ROW_INVALID');
    const team={ine:item.ine,name:item.nome,type:item.tipo,area:item.area,
      activatedOn:date(item['data ativacao']),deactivatedOn:date(item['data desativacao']),url};
    if (result.has(team.ine)) throw Error('CNES_TEAM_DUPLICATED');
    result.set(team.ine,team);
  }
  if (result.size>100) throw Error('CNES_TOO_MANY_TEAMS');
  return [...result.values()];
}

export function parseTeamMembers(html) {
  // Resposta explícita observada no portal para equipe cadastrada sem integrantes.
  // Não tratar página em branco, manutenção ou layout desconhecido como lista vazia.
  if(canonical(textContent(html)).endsWith('equipe nao possui profissionais')) return [];
  const data=table(html,['nome','cns','cbo','atividade','equipe minima','carga horaria','data entrada','data desligamento']);
  const members=new Map();
  for(const row of data.rows) {
    if (!row.cells.some(cell=>/^\d{15}$/.test(cell.value))) continue;
    const item=values(row,data.columns);
    if (!/^\d{6}$/.test(item.cbo) || !item.nome) throw Error('CNES_TEAM_MEMBER_INVALID');
    const record={fullName:item.nome,cns:cns(item.cns),cbo:item.cbo,activity:item.atividade,
      minimumTeam:item['equipe minima'], hoursHospital:hours(item['carga horaria']),
      hoursAmbulatory:hours(item['carga horaria:1']),hoursOther:hours(item['carga horaria:2']),
      // Diferenciada/complementar podem conter indicadores, não necessariamente horas numéricas.
      differentiated:item['carga horaria:3'],complementary:item['carga horaria:4'],
      enteredOn:date(item['data entrada']),leftOn:date(item['data desligamento'])};
    members.set(key(record),record);
  }
  return [...members.values()];
}

export function reconcileTeams(professionals,teams) {
  const index=new Map(), assignments=[],pending=[];
  for (const person of professionals) for (const identity of new Set([person.cns,person.principalCns].filter(Boolean))) {
    const identityKey=`${identity}:${person.cbo}`;
    if(!index.has(identityKey)) index.set(identityKey,[]);
    index.get(identityKey).push(person.sourceKey);
  }
  for (const team of teams) for (const member of team.members) {
    const candidates=index.get(`${member.cns}:${member.cbo}`)||[];
    if(candidates.length !== 1) {pending.push({ine:team.ine,member,reason:candidates.length?'AMBIGUOUS_PROFESSIONAL':'PROFESSIONAL_NOT_FOUND'});continue;}
    assignments.push({professionalKey:candidates[0],ine:team.ine,enteredOn:member.enteredOn,leftOn:member.leftOn,
      hoursHospital:member.hoursHospital,hoursAmbulatory:member.hoursAmbulatory,hoursOther:member.hoursOther});
  }
  return {assignments,pending};
}
