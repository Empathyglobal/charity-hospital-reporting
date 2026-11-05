import {createJobHandlers} from '../src/job-handlers.mjs';
// Include the worker's dependency graph in NFT bundles. Native libraries remain lazy.
import '../src/import-runtime.mjs';
import config from './config.json' with {type:'json'};import {createPgRepository} from '../src/repository.mjs';import {createSharedAuth} from './auth.mjs';import {createUploads} from '../src/uploads.mjs';import {boundedExtractor} from '../src/extract-bounded.mjs';
let runtime;
export const approved=context=>context?.deploy?.context==='production'&&config.enabled&&config.sharedAccessApproved&&!!config.approvalReference;
export async function load(){if(runtime)return runtime;const {getDatabase}=await import('@netlify/database'),pool=getDatabase().pool,repo=createPgRepository({pool,workspaceId:config.workspaceId}),keyReader=name=>['HOSPITAL_REPORT_AI_KEY','HOSPITAL_REPORT_PASSWORD_HASH'].includes(name)?Netlify.env.get(name):undefined;runtime={repo,keyReader,auth:createSharedAuth({pool,config,keyReader}),uploads:createUploads({repo,extract:boundedExtractor()})};return runtime;}
export async function background(request,context){if(!approved(context))return;return createJobHandlers(await load()).background(request);}
export async function scheduled(request,context){if(!approved(context))return;return createJobHandlers(await load()).scheduled();}
