import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {access} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createImporter} from './imports.mjs';
export async function loadImporter(requireFrom=import.meta.url){
 const req=createRequire(requireFrom),zip=req('jszip'),xml=req('xml-js'),sharp=req('sharp'),canvas=req('@napi-rs/canvas');
 const pdfjs=await import(pathToFileURL(req.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
 const langPath=fileURLToPath(new URL('../assets/ocr/',import.meta.url));
 // Explicit local language path and cacheMethod:none: patient bytes never leave this process.
 const ocr=async(bytes,language)=>{if(!['eng','khm','eng+khm'].includes(language))throw Error('Unsupported OCR language');for(const lang of language.split('+'))await access(join(langPath,lang+'.traineddata'));const {createWorker}=req('tesseract.js');const worker=await createWorker(language,1,{langPath,gzip:false,cacheMethod:'none',logger:()=>{}});try{const {data}=await worker.recognize(bytes);return {text:data.text,confidence:data.confidence};}finally{await worker.terminate();}};
 const root=dirname(req.resolve('pdfjs-dist/package.json')).replaceAll('\\','/');
 return createImporter({zip,xml,sharp,canvas,pdfjs,ocr,pdfOptions:{standardFontDataUrl:root+'/standard_fonts/',cMapUrl:root+'/cmaps/',cMapPacked:true}});
}
