import {checkDraft} from './evidence.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {template} from './templates.mjs';
export const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
export const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const text=(v,max=200000,required=true)=>{if(typeof v!=='string'||v.length>max||v.includes('\0')||(required&&!v.trim()))fail('Check required text and length');return v.trim();};
export const get=(s,kind,id)=>s.entities.find(x=>x.kind===kind&&x.id===id)??fail('Record not found',404);
export function empty(){return {entities:[],revisions:[],requests:[],jobs:[],originals:[]};}
export function save(s,kind,input,body){
 const old=input.id?get(s,kind,input.id):null;if(old&&old.version!==input.expectedVersion)fail('A newer version exists. Reload before saving; your edits are still on screen.',409);
 const row={kind,id:old?.id??randomUUID(),version:(old?.version??0)+1,body,updatedAt:new Date().toISOString()};
 if(old)s.entities[s.entities.indexOf(old)]=row;else s.entities.push(row);
 s.revisions.push({...structuredClone(row),actor:'shared-hospital',declaredOperator:input.operator?text(input.operator,120):'',independentApproval:false});return row;
}
function date(v){const parsed=new Date(v+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(v??'')||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==v)fail('Valid date required');return v;}
export function diagnostics(s,report){const b=report.body,d=[];if(b.origin==='preserved-original')return [b.archiveStatus==='unfinished'?'INCOMPLETE original draft. No facts, patient/photo associations or submission approval have been inferred.':'Historical/source report retained as received. This import is not a new approval or submission.'];if(template(b.templateId).formatStatus)d.push(template(b.templateId).formatStatus);for(const sec of b.sections)if(!sec.body.trim())d.push(sec.title+': source or draft text needed');
 if(b.templateId==='hospital-case-v1')for(const sec of b.sections)if(/\[(?:\d+|TODO|MISSING|UNKNOWN)\]|^\s*(?:Not yet completed|Not recorded)\s*[.!]?$/im.test(sec.body))d.push(sec.title+': unresolved code or incomplete source material');
 if(!b.snapshots.length)d.push('Select source materials');
 for(const snap of b.snapshots){const current=s.entities.find(x=>x.id===snap.id&&x.kind===snap.kind);if(!current||current.version!==snap.version)d.push(snap.body.title+': source has changed; refresh the snapshot');if(snap.kind==='source'&&!snap.body.verified)d.push(snap.body.title+': facts not checked');if(snap.kind==='source'&&snap.body.containsPatientData&&!snap.body.consentConfirmed)d.push(snap.body.title+': report use consent not confirmed');}
 for(const p of b.snapshots.filter(x=>x.kind==='photo')){if(!p.body.associationConfirmed)d.push(p.body.title+': case/photo association not checked');if(!p.body.consentConfirmed)d.push(p.body.title+': photo report-use consent not checked');}
 if(b.templateId==='hospital-case-v1'){if(!b.caseName||!b.caseReference)d.push('Confirm the case label and case reference');}
 if(b.workflow==='upload-first-v1'){
  if(!b.sourceCheck)d.push('Run source correlation before review');
  for(const issue of b.sourceCheck?.issues??[])if(issue.severity!=='missing'&&!(issue.severity==='manual-check'&&b.review?.claimsChecked))d.push(issue.message);
  if(b.evidence?.conflicts.length&&!b.review?.conflictsReviewed)d.push('Resolve possible source conflicts against the originals');
  if(b.evidence?.warnings.length&&!b.review?.extractionChecked)d.push('Check extraction warnings, formula caches and OCR against the originals');
 }
 return d;
}
export function reportView(s,row){const problems=diagnostics(s,row);return {...row,diagnostics:problems,incomplete:problems.length>0||!row.body.review,reviewLabel:row.body.review?'Checked by a named operator using the shared login':'Awaiting human check'};}
function snapshots(s,ids,t){if(!Array.isArray(ids)||ids.length>100||new Set(ids).size!==ids.length)fail('Select up to 100 distinct sources');return ids.map(id=>{const r=s.entities.find(x=>['source','gift','photo'].includes(x.kind)&&x.id===id);if(!r||r.body.retired)fail('Selected source is unavailable');if(r.kind==='source'&&r.body.templateId!==t.id)fail('Source belongs to a different template');const copy=structuredClone(r);if(copy.kind==='photo')delete copy.body.previewBase64;return copy;});}
function checkCase(snaps,t,caseName,caseReference){if(t.id!=='hospital-case-v1'||!snaps.length)return;if(!caseName||!caseReference)fail('Enter the confirmed case label and case reference');if(snaps.some(x=>x.body.caseName!==caseName||x.body.caseReference!==caseReference))fail('Selected materials do not all match this case label and case reference');}
export function sourceFacts(snaps,t){return snaps.flatMap(r=>r.kind==='source'?[{id:r.id,sectionId:r.body.sectionId,text:r.body.text,title:r.body.title}]:r.kind==='gift'&&t.sections.some(x=>x.id==='giving')?[{id:r.id,sectionId:'giving',title:r.body.title,text:`${r.body.date}: ${r.body.amount} ${r.body.currency} received for ${r.body.fund}. Reference ${r.body.reference}.`}]:[]);}
export function command(s,action,input){
 if(action==='preserve-report'){
  const t=template(input.templateId),f=input.file;if(!f||!f.id||!/^[a-f0-9]{64}$/.test(f.sha256)||!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(f.mime))fail('Saved PDF or DOCX original required');
  if(!['unfinished','historical'].includes(input.archiveStatus))fail('Choose unfinished draft or historical/source report');
  const title=text(input.title,180),period=text(input.period,100),reference=text(input.provenance?.reference,2000);
  const existing=s.entities.find(x=>x.kind==='report'&&x.body.origin==='preserved-original'&&x.body.originalSha256===f.sha256);
  if(existing){if(existing.body.templateId!==t.id||existing.body.archiveStatus!==input.archiveStatus||existing.body.title!==title||existing.body.period!==period)fail('This exact original is already saved with different report details',409);return existing;}
  const provenance={reference,sourceDate:text(input.provenance?.sourceDate??'',100,false),sourceMessageId:text(input.provenance?.sourceMessageId??'',180,false),libraryFileId:text(input.provenance?.libraryFileId??'',180,false),libraryVersion:text(String(input.provenance?.libraryVersion??''),20,false),importedAt:new Date().toISOString(),verification:'Original bytes retained; no clinical or submission approval inferred'};
  return save(s,'report',{}, {title,period,templateId:t.id,templateVersion:2,origin:'preserved-original',archiveStatus:input.archiveStatus,originalId:f.id,originalFilename:f.filename,originalMime:f.mime,originalBytes:f.bytes,originalSha256:f.sha256,provenance,sections:[],snapshots:[],sourceHash:f.sha256,review:null});
 }
 if(['revise','refresh','review'].includes(action)&&get(s,'report',input.id).body.origin==='preserved-original')fail('Preserved originals cannot be rewritten or marked newly approved. Start a separate new report.');
 if(action==='source'){
  const t=template(input.templateId);if(!t.sections.some(x=>x.id===input.sectionId))fail('Choose a report section');
  const lineage=input.id?Object.fromEntries(Object.entries(get(s,'source',input.id).body).filter(([k])=>['documentId','originalId','caseName','caseReference','importMethod','retired'].includes(k))):{};
  return save(s,'source',input,{...lineage,title:text(input.title,180),templateId:t.id,sectionId:input.sectionId,text:text(input.text),reference:text(input.reference,500),verified:input.verified===true,containsPatientData:input.containsPatientData===true,consentConfirmed:input.consentConfirmed===true});
 }
 if(action==='gift'){
  if(input.id)get(s,'gift',input.id);
  const amount=text(input.amount,20);if(!Intl.supportedValuesOf('currency').includes(input.currency))fail('Choose a supported ISO 4217 currency');const digits=new Intl.NumberFormat('en',{style:'currency',currency:input.currency}).resolvedOptions().maximumFractionDigits;if(!/^(0|[1-9]\d{0,10})(\.\d+)?$/.test(amount)||Number(amount)<=0||(amount.split('.')[1]?.length??0)>digits)fail('Positive amount must use the currency minor units');
  const reference=text(input.reference,180);if(s.entities.some(x=>x.kind==='gift'&&x.id!==input.id&&x.body.reference===reference))fail('A donation with this reference already exists',409);
  return save(s,'gift',input,{title:text(input.title,180),date:date(input.date),amount,currency:input.currency,fund:text(input.fund,120),reference,note:text(input.note??'',2000,false),void:input.void===true});
 }
 if(action==='report'){
  const t=template(input.templateId),snaps=snapshots(s,input.sourceIds,t);if(snaps.some(x=>x.kind==='gift'&&x.body.void))fail('A void donation cannot be selected');
  const caseName=text(input.caseName??'',180,false),caseReference=text(input.caseReference??'',180,false);checkCase(snaps,t,caseName,caseReference);
  const facts=sourceFacts(snaps,t);const sections=t.sections.map(sec=>({...sec,body:facts.filter(x=>x.sectionId===sec.id).map(x=>x.text).join('\n\n'),sourceIds:facts.filter(x=>x.sectionId===sec.id).map(x=>x.id)}));
  return save(s,'report',{}, {title:text(input.title,180),period:text(input.period,100),caseName,caseReference,templateId:t.id,templateVersion:2,sections,snapshots:snaps,sourceHash:hash(snaps),review:null,origin:'source-excerpts'});
 }
 if(action==='revise'){
  const row=get(s,'report',input.id),b=structuredClone(row.body);if(!Array.isArray(input.sections)||input.sections.length!==b.sections.length)fail('All report sections required');
  b.sections=b.sections.map(sec=>{const matches=input.sections.filter(x=>x.id===sec.id);if(matches.length!==1)fail('Invalid report section');return {...sec,body:text(matches[0].body,40000,false)};});b.review=null;b.origin='human-edited';if(b.evidence)b.sourceCheck=checkDraft(b.sections,b.evidence);return save(s,'report',input,b);
 }
 if(action==='refresh'){
  if(get(s,'report',input.id).body.workflow==='upload-first-v1')fail('Use Add or change files to refresh an uploaded-source report');
  const row=get(s,'report',input.id),b=structuredClone(row.body);b.snapshots=snapshots(s,input.sourceIds,template(b.templateId));checkCase(b.snapshots,template(b.templateId),b.caseName,b.caseReference);b.sourceHash=hash(b.snapshots);b.review=null;return save(s,'report',input,b);
 }
 if(action==='review'){
  const row=get(s,'report',input.id),b=structuredClone(row.body);if(b.evidence){b.sourceCheck=checkDraft(b.sections,b.evidence);if(b.sourceCheck.issues.some(x=>x.severity==='unsupported'))fail('Resolve unsupported claims or numbers before recording a check');if(input.extractionChecked!==true||input.claimsChecked!==true)fail('Check the complete draft, source references and extraction warnings');if(b.evidence.conflicts.length&&input.conflictsReviewed!==true)fail('Confirm how the conflicting sources were resolved');}if(input.confirmed!==true)fail('Confirm the text and source check');b.review={operator:text(input.operator,120),note:text(input.note,1000),at:new Date().toISOString(),sourceHash:b.sourceHash,independent:false,claimsChecked:input.claimsChecked===true,extractionChecked:input.extractionChecked===true,conflictsReviewed:input.conflictsReviewed===true};return save(s,'report',input,b);
 }
 fail('Unknown action',404);
}
export function mutate(s,action,input,key){
 if(!/^[\w-]{16,80}$/.test(key??''))fail('Stable request key required',400);const fingerprint=hash({action,input}),previous=s.requests.find(x=>x.key===key);
 if(previous){if(previous.hash!==fingerprint)fail('Request key reused for different input',409);return previous.result;}
 const result=command(s,action,input);s.requests.push({key,hash:fingerprint,result:structuredClone(result)});return result;
}
export function applyAi(s,{id,expectedVersion,sections,jobId}){const row=get(s,'report',id);if(row.version!==expectedVersion)fail('Report changed while AI was drafting. Saved AI result remains available in job history.',409);const next=command(s,'revise',{id,expectedVersion,sections});next.body.origin='ai-draft';next.body.aiJobId=jobId;if(next.body.evidence){next.body.sections=next.body.sections.map(s=>({...s,...sections.find(x=>x.id===s.id)}));next.body.sourceCheck=checkDraft(next.body.sections,next.body.evidence);}s.revisions[s.revisions.length-1].body=structuredClone(next.body);return next;}
export function csv(rows){const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,m=>"'"+m).replaceAll('"','""')+'"';return [['Reference','Date','Donor or source','Amount','Currency','Fund','Status'],...rows.filter(r=>r.kind==='gift').map(r=>[r.body.reference,r.body.date,r.body.title,r.body.amount,r.body.currency,r.body.fund,r.body.void?'void':'recorded'])].map(r=>r.map(cell).join(',')).join('\r\n');}
