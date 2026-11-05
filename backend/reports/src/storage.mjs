import {fail,get} from './domain.mjs';
import {original,retainImport} from './imports.mjs';
const parsed=x=>typeof x==='string'?JSON.parse(x):x;
export function createStorage({transaction,workspaceId}){
 const hydrate=async(q,row)=>{if(!row||!['document','photo','report'].includes(row.kind))return row;const {rows}=await q('SELECT body FROM hospital_report_details WHERE workspace_id=$1 AND id=$2 AND version=$3',[workspaceId,row.id,row.body.detailVersion??row.version]);if(rows.length)Object.assign(row.body,parsed(rows[0].body));return row;};
 const state=async(q,write,reportId)=>{const {rows}=await q('SELECT state FROM hospital_shared_report_workspaces WHERE workspace_id=$1'+(write?' FOR UPDATE':''),[workspaceId]);if(!rows.length)fail('Report workspace is not provisioned',423);const s=structuredClone(parsed(rows[0].state));if(reportId)await hydrate(q,s.entities.find(x=>x.kind==='report'&&x.id===reportId));return s;};
 async function persist(q,s){
  for(const file of s.originals??[]){const {base64,...metadata}=file;await q('INSERT INTO hospital_shared_report_originals(workspace_id,id,metadata,original) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[workspaceId,file.id,JSON.stringify(metadata),Buffer.from(base64,'base64')]);}s.originals=[];
  const compact=async r=>{if(!['document','photo','report'].includes(r.kind))return;const keys=r.kind==='document'?['text','blocks','fields']:r.kind==='report'?['evidence']:['previewBase64'];const extra={};for(const key of keys)if(key in r.body){extra[key]=r.body[key];delete r.body[key];}if(Object.keys(extra).length){if(r.body.detailVersion&&r.body.detailVersion!==r.version){const {rows}=await q('SELECT body FROM hospital_report_details WHERE workspace_id=$1 AND id=$2 AND version=$3',[workspaceId,r.id,r.body.detailVersion]);if(rows.length)Object.assign(extra,{...parsed(rows[0].body),...extra});}await q('INSERT INTO hospital_report_details(workspace_id,id,version,body) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[workspaceId,r.id,r.version,JSON.stringify(extra)]);r.body.detailVersion=r.version;}};
  for(const r of s.entities)await compact(r);for(const r of s.revisions)await compact(r);for(const request of s.requests)if(request.result?.kind&&request.result.body)await compact(request.result);
  for(const job of s.jobs)if(job.result?.kind&&job.result.body)await compact(job.result);
  const encoded=JSON.stringify(s);if(Buffer.byteLength(encoded)>100*1024*1024)fail('Metadata storage is full. Saved originals remain safe.',507);
  await q('UPDATE hospital_shared_report_workspaces SET state=$2 WHERE workspace_id=$1',[workspaceId,encoded]);
 }
 const readOriginal=async(q,id)=>{const {rows}=await q('SELECT metadata,original FROM hospital_shared_report_originals WHERE workspace_id=$1 AND id=$2',[workspaceId,id]);if(!rows.length)fail('Original not found',404);return original({originals:[{...parsed(rows[0].metadata),id,base64:Buffer.from(rows[0].original).toString('base64')}]},id);};
 return {workspaceId,
 async transact(write,fn,{reportId}={}){return transaction(write,async q=>{const s=await state(q,write,reportId),result=structuredClone(await fn(s));if(write)await persist(q,s);return result;});},
 async original(id){return transaction(false,q=>readOriginal(q,id));},
 async detail(kind,id){return transaction(false,async q=>hydrate(q,get(await state(q,false),kind,id)));},
 async pipeline(fn){return transaction(true,q=>fn({q,workspaceId,original:id=>readOriginal(q,id),retain:async(extracted,key)=>{const s=await state(q,true),r=structuredClone(retainImport(s,extracted,key));await persist(q,s);return r;}}));}
 };
}
