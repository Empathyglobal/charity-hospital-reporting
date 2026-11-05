import config from './config.json' with {type:'json'};
import {approved,load} from './runtime.mjs';import {createRoutes} from '../src/routes.mjs';import {createAI} from '../src/ai.mjs';
let handler;export default async function reports(request,context){if(!approved(context))return new Response(JSON.stringify({error:'Shared report activation is held'}),{status:423,headers:{'content-type':'application/json','cache-control':'no-store'}});if(!handler){const {repo,auth,uploads,keyReader}=await load();handler=createRoutes({repo,auth,uploads,config,ai:createAI({repo,config:config.ai,keyReader}),docxLoader:()=>import('docx')});}return handler(request,context);}
export const configRoute={path:'/reports/api/*'};
