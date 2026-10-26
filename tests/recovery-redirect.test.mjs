import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=readFileSync(new URL('../supabase/functions/_shared/recovery-redirect.ts',import.meta.url),'utf8').replace('export function','function');
const {redirect}=vm.runInNewContext(stripTypeScriptTypes(source)+';({redirect:recoveryRedirect})',{URL});
test('recuperação usa o domínio oficial e normaliza barra final',()=>{
  assert.equal(redirect(), 'https://sgf-homologacao.vercel.app/');
  assert.equal(redirect('https://sgf-homologacao.vercel.app'),'https://sgf-homologacao.vercel.app/');
});
test('recuperação bloqueia origem falsa, usuário, query, fragmento e protocolo inseguro',()=>{
  for(const value of ['https://sgfbetim.vercel.app/','https://sgf-homologacao.vercel.app.attacker.test/','https://attacker.test/','https://user@sgf-homologacao.vercel.app/',
    'https://sgf-homologacao.vercel.app/?redirect=https://attacker.test','https://sgf-homologacao.vercel.app/#token','http://sgf-homologacao.vercel.app/',{},'/'])
    assert.throws(()=>redirect(value),/RECOVERY_REDIRECT_INVALID/);
});
test('retorno adicional depende de configuração explícita no servidor',()=>{
  assert.throws(()=>redirect('http://localhost:8080/'));
  assert.equal(redirect('http://localhost:8080/','http://localhost:8080/'),'http://localhost:8080/');
});
