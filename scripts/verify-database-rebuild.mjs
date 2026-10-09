// Executar exclusivamente no job isolado de CI. Não aceita URL/credencial externa.
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {demoSql} from './prepare-demo.mjs';
if(process.env.CI!=='true'||process.env.SGF_ISOLATED_DATABASE!=='yes')throw Error('Ensaio restrito ao banco Docker isolado de CI.');
const container='supabase_db_sgf',target='sgf_restore_b7';
function command(args,input){
 const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:8*1024*1024});
 if(r.status!==0)throw Error(`Falha no ensaio ${args[0]}: ${r.stderr}`);return r.stdout.trim();
}
assert.ok(command(['ps','--format','{{.Names}}']).split('\n').includes(container),'Container local esperado ausente.');
const sql=(db,query)=>command(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-At','-U','supabase_admin','-d',db],query);
assert.equal(sql('postgres',`select count(*) from pg_database where datname='${target}';`),'0','Destino já existe: não apagar/reutilizar banco.');
sql('postgres',"set sgf.demo_enabled='yes';\n"+await demoSql(true));
// Fingerprint de todas as tabelas da aplicação/Auth, dentro de snapshot consistente.
const fingerprint=`begin isolation level repeatable read read only;
create temporary table sgf_fingerprints(name text,digest text);
do $$ declare t record;d text;begin
for t in select schemaname,tablename from pg_tables where schemaname in ('public','auth','private','storage','supabase_migrations') order by 1,2 loop
 execute format('select md5(coalesce(string_agg(row_value,'''' order by row_value),'''')) from (select to_jsonb(x)::text row_value from %I.%I x) v',t.schemaname,t.tablename) into d;
 insert into sgf_fingerprints values(t.schemaname||'.'||t.tablename,d);
end loop;end $$;
select name||'='||digest from sgf_fingerprints order by name;
select 'rls='||md5(coalesce(string_agg(schemaname||tablename||policyname||coalesce(qual,'')||coalesce(with_check,''),'|' order by schemaname,tablename,policyname),'')) from pg_policies where schemaname in ('public','private');
select 'functions='||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private');
rollback;`;
const before=sql('postgres',fingerprint);
command(['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--format=custom','--file=/tmp/sgf-block7.dump']);
sql('postgres',`create database ${target} template template0;`);
command(['exec',container,'pg_restore','-U','supabase_admin','--exit-on-error','--single-transaction','--dbname='+target,'/tmp/sgf-block7.dump']);
assert.equal(sql(target,fingerprint),before,'Dados, RLS ou funções divergem após restauração.');
console.log('PASS: cadeia integral aplicada em banco vazio; demonstração restaurada em banco novo, com dados/RLS/funções iguais.');
// O runner e seu container são descartáveis. Não exportar dump/credenciais como artifacts.
