export const jurisdictions=['municipal','estadual','federal','institucional'];
export function validCalendarInput(item){
 const date=item.event_date;
 return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)
  &&date>='1900-01-01'&&date<='2100-12-31'&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date
  &&typeof item.name==='string'&&item.name.trim().length>0&&item.name.length<=200
  &&['feriado','ponto_facultativo'].includes(item.type)&&jurisdictions.includes(item.jurisdiction)
  &&typeof item.source_url==='string'&&item.source_url.length<=2000&&/^https?:\/\/[^\s]+$/.test(item.source_url)
  &&['general','units'].includes(item.scope)&&Array.isArray(item.unit_ids)&&item.unit_ids.length<=100;
}
