import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCollection,planImport,validateLocalData} from '../supabase/functions/_shared/cnes-review.mjs';

const person=(overrides={})=>({fullName:'FUNCIONÁRIO FICTÍCIO',cns:'900000000000001',principalCns:null,cbo:'123456',occupation:'OCUPAÇÃO FICTÍCIA',
  weeklyHours:40,hoursOther:0,hoursAmbulatory:40,hoursHospital:0,relationship:'VINCULO EMPREGATICIO',relationshipType:'ESTATUTARIO',
  relationshipSubtype:'PROPRIO',status:'Ativo',sourceEntryDate:'2020-01-01',deactivationCompetence:null,...overrides});
const collection=(professionals=[person()],teams=[])=>({schemaVersion:1,source:'CNES_PUBLIC_HTML',requiresReview:true,cnes:'6305245',
  collectedAt:'2026-10-17T12:00:00Z',sourceCompetence:null,professionals,teams});
const normalize=input=>normalizeCollection(input,['6305245']);

test('identidade é estável com mudança de nome/jornada e hash do conteúdo muda',async()=>{
  const first=await normalize(collection()),second=await normalize(collection([person({fullName:'OUTRO NOME',weeklyHours:30,hoursAmbulatory:30})]));
  assert.equal(first.items[0].sourceId,second.items[0].sourceId);
  assert.notEqual(first.items[0].sourceHash,second.items[0].sourceHash);assert.notEqual(first.digest,second.digest);
  assert.equal(first.items[0].sourceData.registration,undefined);assert.equal(first.items[0].sourceData.municipalPosition,undefined);
});

test('ordem e data da consulta não criam outra carga idêntica',async()=>{
  const a=person(),b=person({cns:'900000000000002',cbo:'654321'});
  const first=await normalize(collection([a,b])),second=await normalize({...collection([b,a]),collectedAt:'2026-10-16T12:00:00Z'});
  assert.equal(first.digest,second.digest);
});

test('linhas duplicadas idênticas são deduplicadas e identidades conflitantes são recusadas',async()=>{
  assert.equal((await normalize(collection([person(),person()]))).items.length,1);
  await assert.rejects(normalize(collection([person(),person({fullName:'OUTRA PESSOA'})])),/AMBIGUOUS_SOURCE_IDENTITY/);
});

test('ignora atribuição forjada no arquivo e recalcula associação CNS+CBO',async()=>{
  const member={cns:'900000000000001',cbo:'123456',enteredOn:'2020-02-01',leftOn:null,hoursOther:0,hoursHospital:0,hoursAmbulatory:40};
  const team={ine:'0000123456',name:'EQUIPE FICTÍCIA',type:'ESF',activatedOn:'2020-01-01',deactivatedOn:null,members:[member]};
  const input={...collection([person()],[team]),assignments:[{professionalKey:'forjado',ine:'9999999999'}]};
  const normalized=await normalize(input);
  assert.equal(normalized.items[0].sourceData.teams[0].ine,'0000123456');assert.equal(normalized.pendingTeamMembers,0);
  team.members=[{...member,cns:'900000000000009'}];
  const unmatched=await normalize(input);assert.equal(unmatched.items[0].sourceData.teams.length,0);assert.equal(unmatched.pendingTeamMembers,1);
});

test('prévia separa novos, alterados, iguais e ausentes sem propor exclusão',async()=>{
  const normalized=await normalize(collection([person(),person({cns:'900000000000002'}),person({cns:'900000000000003'})]));
  const [first,second]=normalized.items;
  const existing=[{source_id:first.sourceId,source_hash:first.sourceHash,source_data:first.sourceData,local_data:{}},
    {source_id:second.sourceId,source_hash:'antigo',source_data:{...second.sourceData,fullName:'NOME ANTIGO'},local_data:{fullName:'NOME MUNICIPAL',registration:'M1'}},
    {source_id:'ausente',source_hash:'antigo',local_data:{}}];
  const result=planImport(normalized,{revision:7,entries:existing});
  assert.deepEqual(result.counts,{added:1,changed:1,unchanged:1,absent:1,pendingTeamMembers:0});
  const changed=result.changes.find(row=>row.action==='changed');assert.equal(changed.fullName,'NOME MUNICIPAL');
  assert.deepEqual(changed.preservedLocalFields,['fullName','registration']);assert.deepEqual(changed.fields,['fullName']);
  assert.equal(result.revision,7);assert.ok(!JSON.stringify(result.changes).includes('900000000000'));
});

test('prévia limita detalhes a 50 sem truncar totais',async()=>{
  const input=collection(Array.from({length:65},(_,i)=>person({cns:String(900000000000000n+BigInt(i))})));
  const result=planImport(await normalize(input),{revision:0,entries:[]});
  assert.equal(result.counts.added,65);assert.equal(result.changes.length,50);assert.equal(result.changesTruncated,true);
});

test('entrada adulterada, unidade desconhecida e dados inválidos são recusados',async()=>{
  for(const input of [null,{...collection(),cnes:'9999999'},{...collection(),professionals:[]},
    collection([person({cns:'CPF'})]),collection([person({weeklyHours:50})]),collection([person({sourceEntryDate:'2026-02-30'})]),
    collection([person({fullName:'x'.repeat(181)})]),{...collection(),collectedAt:'2099-01-01T00:00:00Z'},
    {...collection(),professionals:Array(5001).fill(person())}]) await assert.rejects(normalize(input),/COLLECTION_INVALID/);
});

test('campos municipais não aceitam campos privilegiados nem inventam dados ausentes',()=>{
  assert.deepEqual(validateLocalData({registration:' abc-123 ',municipalPosition:'Cargo',weeklyHours:30.5,admissionDate:'2020-02-29'}),
    {registration:'ABC-123',municipalPosition:'Cargo',weeklyHours:30.5,admissionDate:'2020-02-29'});
  assert.deepEqual(validateLocalData({registration:'',municipalPosition:null}),{});
  for(const bad of [{roles:['administrador']},{weeklyHours:-1},{weeklyHours:Infinity},{admissionDate:'2020-02-30'},{fullName:'a\nscript'}]) assert.throws(()=>validateLocalData(bad),/COLLECTION_INVALID/);
});

