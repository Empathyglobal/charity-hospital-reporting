import {save,get,fail,hash} from './domain.mjs';
import {template} from './templates.mjs';
import {buildEvidence,checkDraft} from './evidence.mjs';
const clean=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))fail('Report title and period are required');return v.trim();};
export function workflow(s,action,input,documents,key){
 if(!/^[\w-]{16,80}$/.test(key??''))fail('Stable request key required',400);const fingerprint=hash({action,input}),prior=s.requests.find(x=>x.key===key);if(prior){if(prior.hash!==fingerprint)fail('Request key reused for different input',409);return prior.result;}
 let result;
 if(action==='prepare-report'||action==='attach-documents'){
  const old=action==='attach-documents'?get(s,'report',input.id):null;
  if(old?.body.origin==='preserved-original')fail('Create a separate comparison draft first. The original remains unchanged.');
  if(old&&old.version!==input.expectedVersion)fail('A newer report version exists',409);
  if(!Array.isArray(input.documentIds)||new Set(input.documentIds).size!==input.documentIds.length||input.documentIds.length>100)fail('Choose distinct uploaded documents');
  const t=template(old?.body.templateId??input.templateId);
  if(documents.length!==input.documentIds.length)fail('Selected document missing');
  for(const d of documents){const live=get(s,'document',d.id);if(live.version!==d.version)fail('A source changed; reload before attaching it',409);if(d.body.templateId!==t.id)fail('Choose files uploaded for this report type');}
  if(documents.length&&input.reportUseConfirmed!==true)fail('Confirm that the selected files are intended for this shared report and AI drafting');
  const unique=[...new Map(documents.map(d=>[d.body.sha256,d])).values()],evidence=buildEvidence(unique);
  if(JSON.stringify(evidence.facts).length>1200000)fail('Selected source text exceeds one drafting request. Split this into separate reports; originals remain saved.',413);
  const snaps=unique.map(d=>({kind:'document',id:d.id,version:d.version,updatedAt:d.updatedAt,body:{title:d.body.title,originalId:d.body.originalId,sha256:d.body.sha256,templateId:d.body.templateId,caseName:d.body.caseName,caseReference:d.body.caseReference,usedOcr:d.body.usedOcr,reportUseConfirmed:true}}));
  // Photo identities and permission are never inferred from filenames or from the shared login.
  const selectedPhotos=input.photoIds??[];if(!Array.isArray(selectedPhotos)||selectedPhotos.length>30||new Set(selectedPhotos).size!==selectedPhotos.length)fail('Choose distinct photos');
  for(const id of selectedPhotos){const p=get(s,'photo',id);if(!unique.some(d=>d.id===p.body.documentId)||!p.body.associationConfirmed||!p.body.consentConfirmed)fail('Check photo identity and report-use permission before selecting it');const copy=structuredClone(p);delete copy.body.previewBase64;snaps.push(copy);}
  const b=old?structuredClone(old.body):{title:clean(input.title??t.name+' — '+input.period,180),period:clean(input.period,100),templateId:t.id,templateVersion:2,sections:t.sections.map(x=>({...x,body:'',sourceIds:[],claims:[]})),caseName:'',caseReference:'',origin:'upload-first',workflow:'upload-first-v1'};
  if(t.id==='hospital-case-v1'){
   if(!unique.length)fail('Choose at least one case document with a confirmed case label and case reference.');
   const identities=documents.map(d=>({name:d.body.caseName?.trim(),reference:d.body.caseReference?.trim()}));
   if(identities.some(x=>!x.name||!x.reference))fail('Review each selected case document and confirm its case label and case reference before preparing this report. Existing files without this metadata must be reviewed first.');
   const {name,reference}=identities[0];
   if(identities.some(x=>x.name!==name||x.reference!==reference))fail('Selected documents have different case labels or case references. Prepare one report per confirmed case.');
   const names=documents.flatMap(d=>(d.body.fields??[]).filter(f=>f.id==='name').flatMap(f=>f.occurrences?.length?f.occurrences.map(o=>o.value):[f.value])).filter(Boolean);
   if(names.some(value=>value.trim()!==name))fail('Extracted case labels do not match the confirmed case. Review the selected documents against their originals.');
   if((input.caseName!==undefined&&(typeof input.caseName!=='string'||input.caseName.trim()!==name))||(input.caseReference!==undefined&&(typeof input.caseReference!=='string'||input.caseReference.trim()!==reference)))fail('The entered case label or case reference does not match the selected documents. Review the selected files or correct the entered identity.');
   if(old&&((old.body.caseName&&old.body.caseName!==name)||(old.body.caseReference&&old.body.caseReference!==reference)))fail('These files belong to a different case from this report. Start a separate case report.');
   if(snaps.filter(s=>s.kind==='photo').some(p=>p.body.caseName!==name||p.body.caseReference!==reference))fail('Photo case labels and case references must match the confirmed document identity.');
   b.caseName=name;b.caseReference=reference;
  }
  if(input.referenceReportId){const original=get(s,'report',input.referenceReportId);b.comparisonOf={id:original.id,version:original.version,title:original.body.title,originalSha256:original.body.originalSha256??null};}
  Object.assign(b,{snapshots:snaps,evidence,sourceHash:hash(snaps),review:null,sourceCheck:checkDraft(b.sections,evidence),reportUseConfirmed:input.reportUseConfirmed===true});
  result=save(s,'report',old?input:{},b);
 }else if(action==='check-report'){
  const row=get(s,'report',input.id);if(row.body.workflow!=='upload-first-v1')fail('This report uses the existing source workflow');const b=structuredClone(row.body);b.sourceCheck=checkDraft(b.sections,b.evidence);b.review=null;result=save(s,'report',input,b);
 }else if(action==='confirm-photos'){
  const d=get(s,'document',input.id);if(d.version!==input.expectedVersion)fail('Document changed',409);if(!Array.isArray(input.photos)||input.photos.length>30)fail('Choose imported photos');
  for(const p of input.photos){if(!d.body.photoIds.includes(p.id))fail('Photo is not part of this document');const row=get(s,'photo',p.id);if(!['pre','post','unspecified'].includes(p.phase))fail('Choose a photo stage');const b={...row.body,caseName:clean(p.caseName,180),caseReference:clean(p.caseReference,180),phase:p.phase,associationConfirmed:p.associationConfirmed===true,consentConfirmed:p.consentConfirmed===true};save(s,'photo',{id:p.id,expectedVersion:row.version},b);}
  result=d;
 }else fail('Unknown report workflow action',404);
 s.requests.push({key,hash:fingerprint,result:structuredClone(result)});return result;
}
