export const legacyReportTypes = Object.freeze({});
export const reportTypeOf = row=>legacyReportTypes[row.id]??row.body?.templateId;
export const isTestRecord=row=>row.body?.testOnly===true||/^(?:SYNTHETIC ACCEPTANCE|SYNTHETIC VOID TEST|synthetic-)/i.test(row.body?.title??row.filename??'');
export function reportsOfType(entities,type,{includeTests=false}={}){return entities.filter(x=>(includeTests||!isTestRecord(x))&&x.kind==='report'&&reportTypeOf(x)===type).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))||b.version-a.version);}
export function currentDraftId(entities,type,remembered,includeTests=false){const rows=reportsOfType(entities,type,{includeTests}).filter(x=>x.body.archiveStatus!=='historical');return rows.some(x=>x.id===remembered)?remembered:(rows[0]?.id??'');}
