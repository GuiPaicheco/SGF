import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManualEntry} from '../supabase/functions/_shared/cnes-review.mjs';
const input=()=>({requestId:'f6000000-0000-0000-0000-000000000800',cbo:'123456',reason:'Conferência municipal fictícia',localData:{fullName:'PESSOA FICTÍCIA',registration:'manual-001',weeklyHours:32.5}});
test('cadastro manual não exige nem fabrica CNS, login ou saldo',()=>{
 const result=validateManualEntry(input());assert.equal(result.localData.registration,'MANUAL-001');
 assert.equal(result.localData.weeklyHours,32.5);assert.equal(result.localData.cns,undefined);
 for(const key of ['cpf','profileId','balance','cns'])assert.throws(()=>validateManualEntry({...input(),localData:{...input().localData,[key]:'inventado'}}));
});
test('cadastro manual recusa identificadores e dados municipais inválidos',()=>{
 for(const change of [{requestId:'inválido'},{cbo:'123'},{reason:'a'},{reason:'x'.repeat(501)},{localData:{fullName:'Sem matrícula'}},{localData:{fullName:'Teste',registration:'x',admissionDate:'2999-01-01'}},{localData:{fullName:'Teste',registration:'x',weeklyHours:169}}])assert.throws(()=>validateManualEntry({...input(),...change}));
});
