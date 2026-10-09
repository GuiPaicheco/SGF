import {readFile} from 'node:fs/promises';
// SQL sem conexão. Por padrão ROLLBACK; persistência exige flag e consentimento SQL explícitos.
export async function demoSql(persist=false){
 const fixture=await readFile(new URL('../tests/block-three-rehearsal.sql',import.meta.url),'utf8');
 const end=fixture.indexOf('do $$');if(end<0)throw Error('Fundação de demonstração ausente.');
 const foundation=fixture.slice(0,end).replaceAll('f3000000','d7000000').replaceAll('BLOCK3','SGF-DEMO07').replaceAll('block3-','demo07-').replaceAll('TESTE Bloco 03','DEMO 07');
 const extra=await readFile(new URL('../tests/demo-seven-data.sql',import.meta.url),'utf8');
 return `${foundation}\n${persist?"do $$ begin if current_setting('sgf.demo_enabled',true) is distinct from 'yes' then raise exception 'DEMO_EXPLICIT_CONSENT_REQUIRED';end if;end $$;":''}\n${extra}\n${persist?'COMMIT':'ROLLBACK'};\n`;
}
if(process.argv[1] && new URL(import.meta.url).pathname.endsWith('/'+process.argv[1].replaceAll('\\','/').split('/').at(-1))){
 const args=process.argv.slice(2);if(args.some(a=>a!=='--persist-demo'))throw Error('Opção desconhecida.');
 process.stdout.write(await demoSql(args.includes('--persist-demo')));
}
