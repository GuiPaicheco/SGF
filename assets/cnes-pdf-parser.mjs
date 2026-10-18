const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const day=s=>{const m=clean(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:null;};
const fail=message=>{throw Error(message);};
const canonical=s=>clean(s).replace(/EMPREGATICI O/g,'EMPREGATICIO');
function cell(items,left,right){return clean(items.filter(x=>x.x>=left&&x.x<right).sort((a,b)=>a.y-b.y||a.x-b.x).map(x=>x.s).join(' '));}
export function parseCnesPages(pages,{competence=null,now=new Date().toISOString()}={}){
 if(!pages.length||pages.length>50)fail('PDF fora do limite de 50 páginas.');
 const full=pages.map(p=>{const lines=[];for(const item of [...p.items].sort((a,b)=>a.y-b.y||a.x-b.x)){let line=lines.find(l=>Math.abs(l.y-item.y)<2);if(!line){line={y:item.y,items:[]};lines.push(line);}line.items.push(item);}return lines.map(l=>l.items.sort((a,b)=>a.x-b.x).map(x=>x.s).join(' ')).join('\n');}).join('\n'),cnes=full.match(/CNES:\s*(\d{7})/)?.[1];
 if(!cnes)fail('Não foi possível identificar o CNES do PDF.');
 const codes=[...new Set([...full.matchAll(/CNES:\s*(\d{7})/g)].map(m=>m[1]))];if(codes.length!==1)fail('O PDF contém mais de um estabelecimento.');
 const dateAfter=label=>day(full.match(new RegExp(label+'\\s*(\\d{2}/\\d{2}/\\d{4})'))?.[1]);
 const metadata={issuedOn:dateAfter('Data:'),localUpdatedOn:dateAfter('Atualização na base local:'),nationalUpdatedOn:dateAfter('Última atualização Nacional:')};
 const professionals=[],teams=[],warnings=[];let currentTeam=null,teamMode=false;
 for(const page of pages){
  if(Math.abs(page.width/page.height-1.88)>.08)fail('Layout de PDF não reconhecido. Use a ficha completa do estabelecimento CNES.');
  const items=page.items.map(x=>({...x,x:x.x*940/page.width,y:x.y*500/page.height}));
  const section=items.find(x=>x.s==='Equipes');
  const professionalHeader=items.find(x=>x.s==='Descrição');
  if(professionalHeader){
   const anchors=items.filter(x=>x.x>=136&&x.x<236&&/^\d{15}$/.test(x.s)&&x.y>professionalHeader.y&&x.y<(section?.y??450)).sort((a,b)=>a.y-b.y);
   for(let i=0;i<anchors.length;i++){
    const anchor=anchors[i],lo=i?(anchors[i-1].y+anchor.y)/2:professionalHeader.y+7,hi=anchors[i+1]?(anchor.y+anchors[i+1].y)/2:(section?.y??450);
    const row=items.filter(x=>x.y>lo&&x.y<hi),number=(l,r)=>Number(cell(row,l,r));
    const raw={fullName:cell(row,16,136),cns:anchor.s,cbo:cell(row,307,377),occupation:cell(row,377,514),
     relationship:canonical(cell(row,546,606)),relationshipType:canonical(cell(row,606,665)),relationshipSubtype:canonical(cell(row,665,724)),
     weeklyHours:number(886,926),hoursOther:number(766,806),hoursAmbulatory:number(806,846),hoursHospital:number(846,886),
     sourceEntryDate:day(cell(row,236,307)),principalCns:null,status:'ativo',deactivationCompetence:null};
    if(!/^\d{6}$/.test(raw.cbo)||!raw.fullName||!raw.occupation||![raw.weeklyHours,raw.hoursOther,raw.hoursAmbulatory,raw.hoursHospital].every(Number.isFinite))fail('Uma linha de profissionais não pôde ser interpretada. Importação bloqueada.');
    professionals.push(raw);
   }
   if(!anchors.length)fail('Tabela de profissionais sem linhas reconhecidas.');
  }
  if(section)teamMode=true;
  if(!teamMode)continue;
  const headers=items.filter(x=>/^Equipe:\s*\d{10}/.test(x.s)).sort((a,b)=>a.y-b.y);
  const segments=[...headers.map(h=>({header:h,start:h.y,end:headers.find(x=>x.y>h.y)?.y??450}))];
  if(currentTeam&&(!headers.length||headers[0].y>50))segments.unshift({start:0,end:headers[0]?.y??450,header:null});
  for(const segment of segments){
   if(segment.header){
    const m=segment.header.s.match(/^Equipe:\s*(\d{10})\s*-\s*(\d+)\s*-\s*(.+)$/);if(!m)fail('Cabeçalho de equipe não reconhecido.');
    const nameItem=items.filter(x=>x.y<segment.header.y&&x.y>segment.header.y-50&&x.x>=190&&x.x<350).sort((a,b)=>b.y-a.y)[0];
    const activated=items.find(x=>x.y<segment.header.y&&x.y>segment.header.y-50&&x.x>540&&x.x<680&&day(x.s));
    currentTeam={ine:m[1],name:clean(nameItem?.s)||clean(m[3]),type:clean(m[3]),activatedOn:day(activated?.s),deactivatedOn:null,members:[]};teams.push(currentTeam);
   }
   if(!currentTeam)continue;
   const anchors=items.filter(x=>x.y>segment.start&&x.y<segment.end&&x.x>=240&&x.x<310&&/^\d{6}$/.test(x.s)).sort((a,b)=>a.y-b.y);
   for(let i=0;i<anchors.length;i++){
    const anchor=anchors[i],headerY=Math.max(segment.start,...items.filter(x=>x.s==='CBO'&&x.y>segment.start&&x.y<anchor.y).map(x=>x.y+5)),lo=i?(anchors[i-1].y+anchor.y)/2:headerY,hi=anchors[i+1]?(anchor.y+anchors[i+1].y)/2:segment.end;
    const row=items.filter(x=>x.y>lo&&x.y<hi),cns=cell(row,151,240).replace(/\s/g,'');
    if(!/^\d{15}$/.test(cns))fail('CNS da equipe não pôde ser interpretado. Importação bloqueada.');
    currentTeam.members.push({cns,cbo:anchor.s,hoursHospital:Number(cell(row,468,550)),hoursAmbulatory:Number(cell(row,550,650)),hoursOther:Number(cell(row,650,750)),enteredOn:day(cell(row,750,850)),leftOn:day(cell(row,850,925))});
   }
  }
 }
 if(!professionals.length)fail('Nenhum profissional reconhecido no PDF.');
 const identities=new Set(professionals.map(p=>p.cns+':'+p.cbo));
 for(const t of teams)for(const m of t.members)if(!identities.has(m.cns+':'+m.cbo))warnings.push('Integrante de equipe sem correspondência na tabela de profissionais.');
 return {schemaVersion:1,source:'CNES_PDF',requiresReview:true,cnes,collectedAt:now,sourceCompetence:competence,metadata,professionals,teams,warnings};
}
export async function readCnesPdf(file){
 if(!file||file.size>15_000_000)fail('Escolha um PDF de até 15 MB.');
 const pdf=await import('./vendor/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
 const task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,disableFontFace:true});
 let document;
 try{document=await task.promise;if(document.numPages>50)fail('PDF fora do limite de 50 páginas.');const pages=[];
  for(let i=1;i<=document.numPages;i++){const page=await document.getPage(i),viewport=page.getViewport({scale:1}),text=await page.getTextContent();pages.push({width:viewport.width,height:viewport.height,items:text.items.filter(x=>x.str?.trim()).map(x=>{const m=pdf.Util.transform(viewport.transform,x.transform);return{s:x.str,x:m[4],y:m[5]};})});}
  return parseCnesPages(pages);
 }finally{await task.destroy();}
}
