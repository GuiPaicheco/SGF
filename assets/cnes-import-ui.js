(function(root){
  'use strict';
  async function mount({app,request,esc,isCurrent}) {
    let units=[],unit='',page=0,list={entries:[],total:0},collection=null,preview=null,selected=null,error='',notice='',busy=false,legacyCandidates=[],reviewDraft=null;
    const value=(row,key)=>row.local_data?.[key]??row.source_data?.[key]??'';
    const label=key=>({fullName:'Nome completo',registration:'Matrícula municipal',municipalPosition:'Cargo municipal',weeklyHours:'Carga semanal (horas)',teamLabel:'Equipe conferida',admissionDate:'Admissão municipal',employmentType:'Vínculo municipal'})[key]||key;
    async function run(action){
      if(busy||!isCurrent()) return;
      busy=true;error='';notice='';render();
      try{await action();}catch(e){if(isCurrent()) error=e.message;}
      finally{busy=false;if(isCurrent()){render();app.focus({preventScroll:true});}}
    }
    async function load(){const result=await request({action:'list',cnes:unit,page});if(isCurrent()) list=result;}
    function render(){
      if(!isCurrent()) return;
      app.innerHTML=`<section class="card" aria-busy="${busy}"><p class="eyebrow">Administração</p><h2>Conferência CNES</h2>
        <p class="lead">Importe a coleta para o cadastro CNES em conferência. Correções municipais e histórico anterior são preservados. Isso não cria conta, matrícula, direito ou saldo automaticamente.</p>
        <p><button class="button button-secondary" data-go="catalogs">Voltar aos cadastros</button></p>
        ${error?`<p class="notice notice-danger" role="alert">${esc(error)}</p>`:''}${notice?`<p class="notice" role="status">${esc(notice)}</p>`:''}
        <div class="field"><label for="cnes-unit">Unidade</label><select class="control" id="cnes-unit" ${busy?'disabled':''}>${units.map(item=>`<option value="${esc(item.code)}" ${item.code===unit?'selected':''}>${esc(item.code)} · ${esc(item.name)}</option>`).join('')}</select></div>
        <form id="cnes-file-form"><div class="field"><label for="cnes-file">Arquivo de coleta JSON (até 4 MB)</label><input class="control" id="cnes-file" type="file" accept=".json,application/json" required ${busy?'disabled':''}><small>Gerado pelo coletor com --save-review. O arquivo contém dados pessoais; não publique ou compartilhe indiscriminadamente.</small></div><button class="button button-secondary" ${busy?'disabled':''}>Conferir arquivo</button></form>
        ${preview?`<section aria-labelledby="cnes-preview-title"><h3 id="cnes-preview-title">Prévia da carga · CNES ${esc(preview.cnes)}</h3><p>${preview.counts.added} inclusões · ${preview.counts.changed} alterações · ${preview.counts.unchanged} iguais · ${preview.counts.absent} ausentes preservados · ${preview.counts.pendingTeamMembers} associações de equipe pendentes.</p>
          <p>Ausentes não serão excluídos. Alterações da fonte não substituem campos municipais conferidos. Novos dados e mudanças ficam pendentes de conferência.</p>
          <div class="table-wrap"><table><thead><tr><th>Funcionário</th><th>CBO</th><th>Ação</th><th>Campos municipais preservados</th></tr></thead><tbody>${preview.changes.map(row=>`<tr><td>${esc(row.fullName)}</td><td>${esc(row.cbo)}</td><td>${row.action==='added'?'Inclusão':'Alteração'}</td><td>${esc(row.preservedLocalFields.map(label).join(', ')||'—')}</td></tr>`).join('')}</tbody></table></div>${preview.changesTruncated?'<p>Mostradas as primeiras 50 diferenças; os totais abrangem a carga completa.</p>':''}
          <form id="cnes-apply-form"><label><input type="checkbox" required ${busy?'disabled':''}> Conferi esta prévia e desejo incorporar a carga ao cadastro CNES.</label><div class="actions"><button class="button button-primary" ${busy?'disabled':''}>Incorporar carga</button></div></form></section>`:''}
        <h3>Cadastros CNES da unidade</h3><p>${list.total} registros. Dados do CNES e ajustes municipais permanecem separados.</p>
        <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Matrícula</th><th>Cargo</th><th>CBO</th><th>Horas semanais</th><th>Equipe</th><th>Conferência</th><th></th></tr></thead><tbody>${list.entries.map(row=>`<tr><td>${esc(value(row,'fullName'))}</td><td>${esc(value(row,'registration')||'Pendente')}</td><td>${esc(value(row,'municipalPosition')||'Pendente')}</td><td>${esc(row.source_data.cbo)}</td><td>${esc(value(row,'weeklyHours'))}</td><td>${esc(value(row,'teamLabel')||row.source_data.teams?.map(team=>team.name).join(', ')||'Pendente')}</td><td>${row.review_status==='reviewed'?'Conferido':'Pendente'}</td><td><button type="button" class="button button-secondary" data-cnes-edit="${esc(row.id)}" ${busy?'disabled':''}>Conferir</button></td></tr>`).join('')||'<tr><td colspan="8">Nenhum cadastro incorporado nesta unidade.</td></tr>'}</tbody></table></div>
        <div class="actions"><button class="button button-secondary" id="cnes-prev" ${busy||!page?'disabled':''}>Anterior</button><span>Página ${page+1}</span><button class="button button-secondary" id="cnes-next" ${busy||(page+1)*50>=list.total?'disabled':''}>Próxima</button></div>
        ${selected?`<form id="cnes-review-form"><h3>Conferir dados municipais</h3><p>CBO: ${esc(selected.source_data.cbo)} · Ocupação CNES: ${esc(selected.source_data.occupation)}. Campos municipais vazios permanecem pendentes; não copie automaticamente o CBO como cargo.</p><div class="form-grid">${['fullName','registration','municipalPosition','weeklyHours','teamLabel','admissionDate','employmentType'].map(key=>`<div class="field"><label for="cnes-local-${key}">${label(key)}</label><input class="control" id="cnes-local-${key}" name="${key}" type="${key==='weeklyHours'?'number':key==='admissionDate'?'date':'text'}" ${key==='weeklyHours'?'min="0" max="168" step="0.01"':'maxlength="180"'} value="${esc(reviewDraft?.[key]??selected.local_data?.[key]??'')}" ${busy?'disabled':''}></div>`).join('')}</div><p>Deixe vazio para usar a fonte onde houver correspondência. Conferência não valida automaticamente direito a afastamento.</p><button type="button" class="button button-secondary" id="cnes-find-legacy" ${busy?'disabled':''}>Buscar cadastro anterior pela matrícula</button><div class="field"><label for="cnes-legacy">Associação ao cadastro anterior (confirmação manual)</label><select class="control" id="cnes-legacy" name="legacyServidor" ${busy?'disabled':''}><option value="">Sem associação</option>${selected.servidor_id&&!legacyCandidates.some(item=>item.id===selected.servidor_id)?`<option selected value="${esc(selected.servidor_id)}">Associação anterior preservada</option>`:''}${legacyCandidates.map(item=>`<option value="${esc(item.id)}" ${item.id===(reviewDraft?.legacyServidor??selected.servidor_id)?'selected':''}>${esc(item.full_name)} · ${esc(item.registration)}</option>`).join('')}</select><small>A busca usa matrícula exata e unidade, sem união automática por nome. A associação não altera dados ou saldos do cadastro anterior.</small></div><button class="button button-primary" ${busy?'disabled':''}>Salvar conferência</button></form>`:''}
      </section>`;
      app.querySelector('#cnes-unit').onchange=event=>{unit=event.target.value;page=0;selected=null;collection=null;preview=null;run(load);};
      app.querySelector('#cnes-prev').onclick=()=>{page--;run(load);};
      app.querySelector('#cnes-next').onclick=()=>{page++;run(load);};
      app.querySelector('#cnes-file-form').onsubmit=event=>{
        event.preventDefault();const file=app.querySelector('#cnes-file').files[0];
        run(async()=>{
          collection=null;preview=null;
          if(!file||file.size>4_000_000) throw Error('Escolha um JSON de coleta com até 4 MB.');
          let parsed;try{parsed=JSON.parse(await file.text());}catch{throw Error('Arquivo JSON inválido.');}
          if(!isCurrent()) return;
          if(parsed.cnes!==unit) throw Error('O CNES do arquivo não corresponde à unidade selecionada.');
          const result=await request({action:'preview',collection:parsed});
          if(isCurrent()){collection=parsed;preview=result;}
        });
      };
      const apply=app.querySelector('#cnes-apply-form');
      if(apply) apply.onsubmit=event=>{event.preventDefault();run(async()=>{
        const result=await request({action:'apply',collection,revision:preview.revision,digest:preview.digest,confirmed:true});
        if(!isCurrent()) return;
        collection=null;preview=null;page=0;selected=null;
        notice=result.status==='already_applied'?'Esta carga já foi incorporada; nenhum registro foi duplicado.':'Carga incorporada. Confira os dados municipais abaixo.';
        await load();
      });};
      app.querySelectorAll('[data-cnes-edit]').forEach(button=>button.onclick=()=>{selected=list.entries.find(row=>row.id===button.dataset.cnesEdit);reviewDraft=null;legacyCandidates=[];render();app.querySelector('#cnes-review-form')?.scrollIntoView({block:'start'});});
      const finder=app.querySelector('#cnes-find-legacy');
      if(finder) finder.onclick=()=>{reviewDraft=Object.fromEntries(new FormData(app.querySelector('#cnes-review-form')));run(async()=>{
        if(!reviewDraft.registration?.trim()) throw Error('Informe a matrícula municipal para buscar o cadastro anterior.');
        const result=await request({action:'legacy-candidates',cnes:unit,registration:reviewDraft.registration});
        if(isCurrent()){legacyCandidates=result.candidates;notice=legacyCandidates.length?'Confira e selecione o cadastro anterior.':'Nenhum cadastro anterior com esta matrícula na unidade.';}
      });};
      const review=app.querySelector('#cnes-review-form');
      if(review) review.onsubmit=event=>{
        event.preventDefault();const formData=new FormData(event.target);reviewDraft=Object.fromEntries(formData);const legacyServidor=formData.get('legacyServidor')||null;const localData=Object.fromEntries([...formData].filter(([key])=>key!=='legacyServidor'));
        if(localData.weeklyHours!=='') localData.weeklyHours=Number(localData.weeklyHours);
        run(async()=>{await request({action:'review',entryId:selected.id,version:selected.version,localData,legacyServidor});if(!isCurrent()) return;selected=null;preview=null;collection=null;notice='Conferência salva. Direitos e saldos não foram alterados.';await load();});
      };
    }
    app.innerHTML='<section class="card" aria-busy="true"><p>Carregando unidades para conferência…</p></section>';
    try {
      const result=await request({action:'units'});if(!isCurrent()) return;
      units=result.units;unit=units[0]?.code||'';
      if(!unit) throw Error('Nenhuma unidade do catálogo está disponível.');
      await load();if(isCurrent()){render();app.focus({preventScroll:true});}
    }catch(e){if(isCurrent()) app.innerHTML=`<section class="card"><h2>Conferência CNES</h2><p class="notice notice-danger" role="alert">${esc(e.message)}</p><button class="button button-secondary" data-go="catalogs">Voltar aos cadastros</button></section>`;}
  }
  root.SGFCnesImport={mount};
})(globalThis);
