// Synthetic-only, in-memory local preview. Never deploy this server.
import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openLocal} from '../backend/reports/src/local-repository.mjs';
import {createRoutes} from '../backend/reports/src/routes.mjs';
import {createUploads} from '../backend/reports/src/uploads.mjs';
import {loadImporter} from '../backend/reports/src/import-runtime.mjs';
import {mutate} from '../backend/reports/src/domain.mjs';

const port=4197,origin=`http://127.0.0.1:${port}`,root=fileURLToPath(new URL('../static/',import.meta.url)).replace(/\/$/,''),repo=openLocal(':memory:'),importer=await loadImporter(import.meta.url);
const uploads=createUploads({repo,extract:input=>importer.extract(input)});
await repo.transact(true,s=>mutate(s,'source',{title:'Synthetic example only',templateId:'hospital-periodic-v1',sectionId:'summary',text:'The example outreach completed 2 visits.',reference:'Synthetic fixture, not patient data',verified:true},randomUUID()));
const config={enabled:true,sharedAccessApproved:true,approvalReference:'IN-MEMORY-SYNTHETIC-DEMO',ai:{enabled:false}};
const auth={require:async()=>{},checkOrigin:r=>{if(r.headers.get('origin')!==origin)throw Object.assign(Error('Local origin required'),{status:403});},login:async()=>'',logout:async()=>''};
const ai={generate:async()=>{throw Object.assign(Error('AI is disabled in this synthetic demo'),{status:423});}};
const route=createRoutes({repo,auth,config,ai,uploads,docxLoader:()=>import('docx')});
const server=http.createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end('Local host required');return;}
 const url=new URL(req.url,origin);let size=0,chunks=[];
 if(req.method==='POST'){if(req.headers.origin!==origin){res.writeHead(403);res.end('Local origin required');return;}for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}}
 if(url.pathname.startsWith('/reports/api/')){const result=await route(new Request(url,{method:req.method,headers:req.headers,body:req.method==='POST'?Buffer.concat(chunks):undefined}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;}
 if(url.pathname==='/reports/process-background'&&req.method==='POST'){const {id}=JSON.parse(Buffer.concat(chunks));res.writeHead(202);res.end();void (async()=>{for(let steps=0;steps<25;steps++){const job=await uploads.runStep(id);if(!job||job.stale||['completed','failed'].includes(job.status))break;}})().catch(()=>{});return;}
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 const p=resolve(root,'.'+(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));if(!p.startsWith(root+sep)||!existsSync(p)){res.writeHead(404);res.end();return;}
 const type=p.endsWith('.mjs')?'text/javascript':p.endsWith('.css')?'text/css':'text/html';let body=readFileSync(p);
 if(type==='text/html')body=Buffer.from(body.toString().replace('<body>','<body><p role="alert" style="padding:1rem;background:#fff0d5"><strong>Synthetic demo only.</strong> No real records. No authentication. Data disappears when this process stops. AI is disabled.</p>'));
 res.writeHead(200,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);
}catch{res.writeHead(500);res.end('Synthetic preview request failed');}});
server.listen(port,'127.0.0.1',()=>console.log(`Synthetic demo: ${origin}/reports/ (Ctrl+C to stop)`));
process.on('SIGINT',()=>server.close(()=>{repo.close();process.exit(0);}));
