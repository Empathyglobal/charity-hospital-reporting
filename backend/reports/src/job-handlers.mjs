import {fail} from './domain.mjs';
export function createJobHandlers({auth,uploads,now=()=>Date.now()}){return {
 async background(request){if(request.method!=='POST')fail('POST required',405);auth.checkOrigin(request);await auth.require(request);const reader=request.body?.getReader();if(!reader)fail('Job required',400);let parts=[],size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>500){await reader.cancel();fail('Job request too large',413);}parts.push(value);}let input;try{input=JSON.parse(Buffer.concat(parts).toString());}catch{fail('Invalid job',400);}if(!/^[\w-]{1,80}$/.test(input.id??''))fail('Invalid job',400);const deadline=now()+12*60*1000;for(let steps=0;steps<25&&now()<deadline;steps++){const result=await uploads.runStep(input.id);if(!result||result.stale||['completed','failed'].includes(result.status))break;}},
 async scheduled(){return uploads.runStep();}
};}
