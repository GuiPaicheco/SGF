(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date=value=>String(value).split('-').reverse().join('/');
  function panel(request,role){
    if(role!=='administrador' || !request.context_bond_id || ['cancelada','concluida'].includes(request.status)) return '';
    return `<details class="work-panel" id="request-revision"><summary>Reprogramar ou redistribuir com nova análise</summary>
      <p>Operação global do Administrador. Mantém a quantidade e a contagem de dias de cada parcela. Para mudar apenas a distribuição, mantenha os inícios atuais.</p>
      <p>O pedido anterior será cancelado, sairá do calendário confirmado e terá eventual débito estornado. Suas decisões e datas continuarão no histórico. Um novo protocolo exigirá análise de todas as unidades e nova inclusão no calendário.</p>
      <div class="form-grid">${(request.periods||[]).map((p,i)=>`<div class="field"><label for="revision-start-${i}">Novo início da parcela ${i+1}</label><input class="control" type="date" id="revision-start-${i}" data-revision-start value="${esc(p.start_date)}" required><small>${esc(p.days)} dias · ${esc(p.counting_mode||'Contagem antiga não informada')}</small></div>`).join('')}</div>
      <button class="button button-secondary" type="button" data-revision-plan>Simular novo período e distribuição</button><div id="revision-plan" aria-live="polite"></div></details>`;
  }
  function planView(plan,request){
    const current=new Map((request.responsibilities||[]).map(day=>[day.responsibility_date,day.bond_unit_id]));
    return `<h4>Confira o novo período</h4><div class="summary">${plan.periods.map(p=>`<div class="summary-row"><span>Parcela ${esc(p.sequence)} · ${esc(p.days)} dias</span><strong>${esc(date(p.start_date))} a ${esc(date(p.end_date))} · retorno ${esc(date(p.return_date))}</strong></div>`).join('')}</div>
      <h4>CNES responsável por cada dia</h4><div class="form-grid">${plan.days.map((day,i)=>{
        const selected=day.candidates.some(c=>c.id===current.get(day.date))?current.get(day.date):day.candidates.length===1?day.candidates[0].id:'';
        return `<div class="field"><label for="revision-day-${i}">${esc(date(day.date))}</label><select class="control" id="revision-day-${i}" data-revision-date="${esc(day.date)}" required><option value="">Selecione o CNES</option>${day.candidates.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc([c.name,c.location].filter(Boolean).join(' · '))}</option>`).join('')}</select></div>`;
      }).join('')}</div><div class="field"><label for="revision-reason">Justificativa da reprogramação/redistribuição</label><textarea class="control" id="revision-reason" minlength="3" maxlength="2000" rows="3" required></textarea></div>
      <label><input type="checkbox" id="revision-confirm" required> Confirmo a substituição: o pedido anterior sairá do calendário e o novo aguardará todas as decisões.</label>
      <div class="actions"><button class="button button-primary" type="button" data-revision-commit>Substituir pedido e abrir nova análise</button></div>`;
  }
  root.SGFRequestRevision={panel,planView};
})(globalThis);
