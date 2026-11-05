import {parentPort,workerData} from 'node:worker_threads';import {loadImporter} from './import-runtime.mjs';
try{const importer=await loadImporter(workerData.requireFrom??import.meta.url);parentPort.postMessage({result:await importer.extract(workerData.input)});}catch(e){parentPort.postMessage({error:{message:e.status?e.message:'Document extraction failed',status:e.status}});}
