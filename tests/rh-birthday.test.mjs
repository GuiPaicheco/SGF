import test from 'node:test';import assert from 'node:assert/strict';import {birthdayInput} from '../supabase/functions/_shared/rh-calendar.mjs';
const input={entryId:'f0000000-0000-0000-0000-000000000001',version:0,month:2,day:29};
test('aniversário aceita dia/mês válido e limpeza, rejeitando datas impossíveis e autoria arbitrária',()=>{
 assert.equal(birthdayInput(input).target_day,29);assert.equal(birthdayInput({...input,month:null,day:null}).target_month,null);
 for(const change of [{month:4,day:31},{month:2,day:30},{month:13},{month:null},{version:-1},{entryId:'outro'},{month:undefined,day:undefined}])assert.throws(()=>birthdayInput({...input,...change}),/RH_INPUT_INVALID/);
 assert.equal(birthdayInput({...input,operatorId:'forjado'}).operatorId,undefined);
});
