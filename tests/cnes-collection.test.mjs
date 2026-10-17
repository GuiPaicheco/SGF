import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {parseProfessionals,parseTeams,parseTeamMembers,reconcileTeams,teamUrl,textContent,CNES_ORIGIN} from '../scripts/cnes/parse.mjs';
import {collectUnit,createPortalReader,summarize} from '../scripts/cnes/collect.mjs';

// Somente pessoas e identificadores sintéticos. Nunca usar capturas reais como fixtures.
const CNS='900000000000001',MASTER='900000000000002';
const row=cells=>`<tr>${cells.map(value=>`<td>${value}</td>`).join('')}</tr>`;
const professionalHeaders=['Nome','Dt.Entrada','CNS','* CNS Master/Principal','Dt. Atribuição','CBO','CH Outros','CH Amb.','CH Hosp.','Total','SUS','Vinculação','Tipo','Subtipo','Comp. Desativação','Situação','Portaria 134'];
const professionalRow=(overrides={})=>Object.assign(['PESSOA FICTÍCIA','01/02/2020',CNS,MASTER,'01/02/2020','123456 - OCUPAÇÃO FICTÍCIA','10Hs.','20Hs.','00Hs.','30Hs.','SIM','VINCULO EMPREGATICIO','ESTATUTARIO','PROPRIO','','Ativo',''],overrides);
const professionalPage=(records=[professionalRow()])=>`<html><table>${row(professionalHeaders)}${records.map(row).join('')}${row(professionalHeaders)}</table></html>`;
const href='Mod_Equipes_Profisssional.asp?VUnidade=3106706305245&Varea=0001&VTipo=70&VMunicipio=310670&VSeqEq=123456';
const teamPage=(link=href)=>`<table><tr>${['Tipo','INE','Nome','Área'].map(x=>`<td>${x}</td>`).join('')}<td colspan="7">População Assistida</td><td>Data Ativação</td><td>Data Desativação</td></tr>${row(['ESF','0000123456',`<a href="${link}">EQUIPE FICTÍCIA</a>`,'0001','-','-','-','-','-','-','-','01/01/2020',''])}</table>`;
const memberPage=(records=[[MASTER,'123456']])=>`<table><tr>${['Nome','CNS','CBO','Atividade','Equipe Minima'].map(x=>`<td>${x}</td>`).join('')}<td colspan=5>Carga Horária</td><td>Data Entrada</td><td>Data Desligamento</td></tr>${records.map(([cns,cbo])=>row(['PESSOA FICTÍCIA',cns,cbo,'ATIVIDADE','S','0','20','10','N','N','02/02/2020',''])).join('')}</table>`;

test('catálogo RH possui 41 UBS e Secretaria, códigos como texto e nenhum segredo',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../config/rh-units.json',import.meta.url),'utf8'));
  assert.equal(catalog.length,42);assert.equal(new Set(catalog.map(unit=>unit.cnes)).size,42);
  assert.equal(catalog.filter(unit=>unit.login.startsWith('UBS ')).length,41);
  assert.equal(catalog.find(unit=>unit.login==='DAPS').cnes,'2126486');
  assert.ok(catalog.some(unit=>unit.cnes==='0856762'));
  for(const unit of catalog){assert.match(unit.cnes,/^\d{7}$/);assert.deepEqual(Object.keys(unit).sort(),['cnes','login']);}
});

test('profissionais preservam identidade, ocupação, carga, vínculo e zeros à esquerda',()=>{
  const [person]=parseProfessionals(professionalPage());
  assert.equal(person.fullName,'PESSOA FICTÍCIA');assert.equal(person.cns,CNS);assert.equal(person.principalCns,MASTER);
  assert.equal(person.cbo,'123456');assert.equal(person.weeklyHours,30);assert.equal(person.hoursAmbulatory,20);
  assert.equal(person.sourceEntryDate,'2020-02-01');assert.equal(person.relationshipType,'ESTATUTARIO');
  assert.equal(person.registration,undefined);assert.equal(person.municipalPosition,undefined);
});

test('repetir linhas é idempotente mas vínculos distintos permanecem para conferência',()=>{
  const a=professionalRow(),b=professionalRow({12:'CONTRATADO'});
  assert.equal(parseProfessionals(professionalPage([a,a])).length,1);
  const result=parseProfessionals(professionalPage([a,b]));assert.equal(result.length,2);
  assert.equal(result[0].sourceKey,parseProfessionals(professionalPage([a]))[0].sourceKey);
});

test('layout inesperado e carga inconsistente não viram cadastro vazio ou válido',()=>{
  assert.throws(()=>parseProfessionals('<html>Manutenção</html>'),/CNES_TABLE_NOT_RECOGNIZED/);
  assert.throws(()=>parseProfessionals(professionalPage([])),/EMPTY_REQUIRES_REVIEW/);
  assert.throws(()=>parseProfessionals(professionalPage([professionalRow({9:'40Hs.'})])),/TOTAL_MISMATCH/);
  assert.throws(()=>parseProfessionals(professionalPage([professionalRow({6:'-10Hs.'})])),/HOURS_INVALID/);
  assert.throws(()=>parseProfessionals(professionalPage([professionalRow({1:'31\/02\/2020'})])),/DATE_INVALID/);
  assert.throws(()=>parseProfessionals(professionalPage([professionalRow({2:'identificador inválido'})])),/IDENTITY_INVALID/);
  assert.throws(()=>parseProfessionals(professionalPage([professionalRow({5:'CBO inválido'})])),/ROW_INVALID/);
});

test('equipes respeitam colspan, INE, CNES e vigência',()=>{
  const [team]=parseTeams(teamPage(),'6305245');
  assert.equal(team.ine,'0000123456');assert.equal(team.name,'EQUIPE FICTÍCIA');
  assert.equal(team.activatedOn,'2020-01-01');assert.equal(team.deactivatedOn,null);
  assert.equal(team.url,CNES_ORIGIN+'/'+href);
});

test('links de equipes não permitem outra origem, unidade ou parâmetros duplicados',()=>{
  for(const link of ['https://example.org/'+href,href.replace('6305245','2126060'),href+'&Varea=0002',href.replace('VMunicipio=310670','VMunicipio=999999'),href+'#fragment']) {
    assert.throws(()=>teamUrl(link,'6305245'),/TEAM_URL_INVALID/);
  }
  assert.throws(()=>parseTeams(teamPage('https://example.org/'+href),'6305245'),/TEAM_URL_INVALID/);
});

test('membros preservam componentes de jornada e período na equipe',()=>{
  const [member]=parseTeamMembers(memberPage());
  assert.equal(member.cns,MASTER);assert.equal(member.cbo,'123456');
  assert.equal(member.hoursAmbulatory,20);assert.equal(member.hoursOther,10);
  assert.equal(member.enteredOn,'2020-02-02');assert.equal(member.leftOn,null);
});

test('equipe explicitamente sem profissionais é vazia, mas erro remoto não é',()=>{
  assert.deepEqual(parseTeamMembers('<html>Equipe não possui Profissionais</html>'),[]);
  assert.throws(()=>parseTeamMembers('<html>Serviço em manutenção</html>'),/TABLE_NOT_RECOGNIZED/);
  assert.deepEqual(parseTeams('<html>Estabelecimento não possui Equipes</html>','2126486'),[]);
  assert.throws(()=>parseTeams('<html>Erro de consulta</html>','2126486'),/TABLE_NOT_RECOGNIZED/);
});

test('associação usa CNS principal e CBO e nunca decide por nome',()=>{
  const professionals=parseProfessionals(professionalPage());
  const teams=[{ine:'0000123456',members:parseTeamMembers(memberPage())}];
  const result=reconcileTeams(professionals,teams);
  assert.equal(result.assignments.length,1);assert.equal(result.pending.length,0);
  assert.equal(result.assignments[0].professionalKey,professionals[0].sourceKey);
  const missing=reconcileTeams(professionals,[{...teams[0],members:parseTeamMembers(memberPage([['900000000000003','123456']]))}]);
  assert.equal(missing.assignments.length,0);assert.equal(missing.pending[0].reason,'PROFESSIONAL_NOT_FOUND');
});

test('mesmo CNS e CBO em vínculos distintos gera pendência, não vínculo arbitrário',()=>{
  const professionals=parseProfessionals(professionalPage([professionalRow(),professionalRow({12:'CONTRATADO'})]));
  const result=reconcileTeams(professionals,[{ine:'0000123456',members:parseTeamMembers(memberPage())}]);
  assert.equal(result.assignments.length,0);assert.equal(result.pending[0].reason,'AMBIGUOUS_PROFESSIONAL');
});

test('coleta é sequencial e exige revisão sem inventar competência ou escrever banco',async()=>{
  const calls=[];
  const result=await collectUnit({cnes:'6305245',login:'UBS AMAZONAS'},{now:()=>new Date('2026-10-17T12:00:00Z'),read:async url=>{
    calls.push(url);
    return url.includes('Mod_Profissional.asp')?professionalPage():url.includes('Mod_Equipes.asp')?teamPage():memberPage();
  }});
  assert.equal(calls.length,3);assert.ok(calls[0].includes('Mod_Profissional.asp'));assert.ok(calls[2].includes('VSeqEq'));
  assert.equal(result.requiresReview,true);assert.equal(result.sourceCompetence,null);assert.equal(result.assignments.length,1);
  const summary=JSON.stringify(summarize(result));assert.ok(!summary.includes(CNS));assert.ok(!summary.includes('PESSOA'));assert.ok(!summary.includes('fullName'));
});

test('transporte limita origem, tipo e tamanho mesmo sem Content-Length',async()=>{
  let calls=0;
  const read=createPortalReader({wait:async()=>{},fetchImpl:async()=>{calls++;return new Response('muito grande',{headers:{'content-type':'text/html'}});},maxBytes:5});
  await assert.rejects(read('https://example.org/Mod_Profissional.asp'),/URL_INVALID/);assert.equal(calls,0);
  await assert.rejects(read(CNES_ORIGIN+'/Mod_Profissional.asp'),/RESPONSE_TOO_LARGE/);assert.equal(calls,1);
  const wrongType=createPortalReader({wait:async()=>{},fetchImpl:async()=>new Response('{}',{headers:{'content-type':'application/json'}})});
  await assert.rejects(wrongType(CNES_ORIGIN+'/Mod_Profissional.asp'),/CONTENT_TYPE_INVALID/);
});

test('transporte respeita intervalo, retenta somente uma vez e não vaza corpo de erro',async()=>{
  let calls=0;const waits=[];
  const read=createPortalReader({wait:async ms=>waits.push(ms),fetchImpl:async(_url,options)=>{
    assert.equal(options.redirect,'error');assert.ok(options.signal);
    calls++;return new Response('conteúdo privado',{status:503,headers:{'content-type':'text/html'}});
  }});
  await assert.rejects(read(CNES_ORIGIN+'/Mod_Profissional.asp'),/^Error: CNES_HTTP_503$/);
  assert.equal(calls,2);assert.ok(waits.includes(1000));
  let deniedCalls=0;
  const denied=createPortalReader({wait:async()=>{},fetchImpl:async()=>{deniedCalls++;return new Response('privado',{status:403});}});
  await assert.rejects(denied(CNES_ORIGIN+'/Mod_Profissional.asp'),/CNES_HTTP_403/);assert.equal(deniedCalls,1);
});

test('texto do portal não executa HTML e suporta entidades e acentos',()=>{
  assert.equal(textContent('<script>malicioso()</script><b>Jo&#227;o&nbsp;&amp; equipe</b>'),'João & equipe');
  assert.doesNotThrow(()=>textContent('&#999999999;'));
});

test('CLI exige escolha explícita, recusa CNES desconhecido e não aceita destino livre',()=>{
  for(const args of [[],['--all','--cnes','6305245'],['--all','--cnes'],['--cnes','1234567'],['--all','--output','public']]) {
    const result=spawnSync(process.execPath,['scripts/collect-cnes.mjs',...args],{encoding:'utf8'});
    assert.equal(result.status,1);assert.equal(result.stdout,'');
  }
});
