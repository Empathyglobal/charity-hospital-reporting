import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const numbers=s=>String(s).match(/-?\d+(?:[.,]\d+)*(?:%|\b)/g)??[];
export function buildEvidence(documents){
 const facts=[],warnings=[];
 for(const d of documents){
  warnings.push(...(d.body.warnings??[]).map(text=>({documentId:d.id,file:d.body.title,text})));
  for(const [index,b] of (d.body.blocks??[]).entries()){
   if(!b.text?.trim())continue;
   const anchor={file:d.body.title,originalId:d.body.originalId,sha256:d.body.sha256,documentId:d.id,version:d.version,...Object.fromEntries(['sheet','row','page','paragraph','line'].filter(k=>b[k]!==undefined).map(k=>[k,b[k]]))};
   // Long paragraphs/pages are split with explicit offsets, never silently truncated.
   for(let start=0;start<b.text.length;start+=4000){const text=b.text.slice(start,start+4000),location={...anchor,block:index+1,start,end:Math.min(start+4000,b.text.length)},id='e-'+digest({location,text}).slice(0,24);facts.push({id,text,anchor:location,method:b.method,requiresOriginalCheck:b.method==='ocr'||b.cells?.some(c=>c.cache)||!!b.hidden});}
  }
  // Only explicit additive count/amount columns are totaled. Identifier/date/ratio columns are excluded.
  const bySheet=Map.groupBy((d.body.blocks??[]).filter(b=>b.cells?.length),b=>b.sheet??'CSV');
  for(const [sheet,rows] of bySheet){const header=rows[0];if(rows.length<2)continue;for(let col=0;col<header.cells.length;col++){
   const label=header.cells[col].value;if(!/\b(count|amount|cost|quantity|qty|surgeries|patients|expenditure)\b/i.test(label)||/\b(id|reference|rate|average|percent|price|date)\b/i.test(label))continue;
   const data=rows.slice(1).filter(r=>!r.hidden&&!r.cells.some(c=>/\b(total|subtotal|balance|average)\b/i.test(c.value)));
   const cells=data.map(r=>r.cells.find(c=>c.cell.replace(/\d+$/,'')===header.cells[col].cell.replace(/\d+$/,'')));
   if(!cells.length||cells.some(c=>!c||c.numeric===null||c.numeric===undefined||c.cache||/^[+-]?0\d/.test(c.value)||/[Ee%]/.test(c.numeric)))continue;
   const monetary=/\b(amount|cost|expenditure)\b/i.test(label),currencies=new Set(Intl.supportedValuesOf('currency')),column=c=>c.cell.replace(/\d+$/,'');
   const headerCodes=(label.match(/\b[A-Z]{3}\b/g)??[]).filter(x=>currencies.has(x)),companions=header.cells.filter(c=>/^(currency|currency code|unit|units)$/i.test(c.value.trim()));
   const rowUnits=cells.map((cell,i)=>{const values=[...headerCodes,cell.unit,...companions.map(h=>data[i].cells.find(c=>column(c)===column(h))?.value)].filter(v=>v!==undefined&&v!==null&&String(v).trim()).map(v=>String(v).trim());if(companions.some(h=>!data[i].cells.find(c=>column(c)===column(h))?.value?.trim()))return null;const unique=new Set(values.map(v=>currencies.has(v.toUpperCase())?v.toUpperCase():v.toLowerCase()));if(unique.size>1)return null;const unit=[...unique][0]??'';return monetary&&!currencies.has(unit)?null:unit;});
   const units=new Set(rowUnits);if(rowUnits.includes(null)||units.size!==1){warnings.push({documentId:d.id,file:d.body.title,text:'No automatic sum for '+label+': currency or units are missing, mixed or ambiguous.'});continue;}
   const scale=Math.max(...cells.map(c=>c.numeric.split('.')[1]?.length??0));if(scale>4)continue;
   const integer=n=>{const negative=n.startsWith('-'),[a,b='']=n.replace(/^-/, '').split('.');return BigInt(a+b.padEnd(scale,'0'))*(negative?-1n:1n);};
   const total=cells.reduce((sum,c)=>sum+integer(c.numeric),0n),abs=(total<0n?-total:total).toString().padStart(scale+1,'0'),formatted=(total<0n?'-':'')+(scale?abs.slice(0,-scale)+'.'+abs.slice(-scale):abs),unit=[...units][0];
   const anchor={file:d.body.title,originalId:d.body.originalId,sha256:d.body.sha256,documentId:d.id,version:d.version,sheet,cells:cells.map(c=>c.cell)},text=`Calculated sum of ${label}: ${formatted}${unit?' '+unit:''}. Includes ${cells.length} numeric cells; existing totals, hidden rows and cached formulas excluded.`,id='sum-'+digest({anchor,text}).slice(0,24);
   facts.push({id,text,anchor,method:'deterministic-sum',derivation:{operation:'sum',unit,value:formatted,terms:cells.map(c=>({cell:c.cell,value:c.numeric}))},requiresOriginalCheck:true});
  }}
 }
 const conflicts=[];const metrics=new Map();
 for(const f of facts.filter(f=>f.method!=='deterministic-sum')){for(const line of f.text.split(/[\n|]/)){const match=line.trim().match(/^([A-Za-z][A-Za-z /()%-]{2,70}):\s*(-?\d+(?:\.\d+)?)\s*(USD|KHR|cases|patients|surgeries)?\s*$/i);if(!match)continue;const key=(match[1]+'|'+(match[3]??'')).toLowerCase(),entry={id:f.id,value:match[2],label:match[1]};const prior=metrics.get(key);if(prior&&prior.value!==entry.value)conflicts.push({label:entry.label,evidenceIds:[prior.id,entry.id],values:[prior.value,entry.value],message:'Possible conflicting values. Confirm scope and reporting period against both originals.'});else metrics.set(key,entry);}}
 const records=new Map();
 for(const d of documents)for(const [sheet,rows] of Map.groupBy((d.body.blocks??[]).filter(b=>b.cells?.length),b=>b.sheet??'CSV')){
  const headers=rows[0]?.cells??[],keyCell=headers.find(c=>/^(case|patient|invoice)?\s*(id|reference|number|no\.?|#)$/i.test(c.value.trim()));if(!keyCell)continue;const column=c=>c.cell.replace(/\d+$/,'');
  for(const row of rows.slice(1)){const identity=row.cells.find(c=>column(c)===column(keyCell))?.value;if(!identity)continue;const fact=facts.find(f=>f.anchor.documentId===d.id&&f.anchor.row===row.row&&(f.anchor.sheet??'CSV')===sheet);if(!fact)continue;
   for(const h of headers.filter(h=>h!==keyCell)){const c=row.cells.find(c=>column(c)===column(h));if(!c||!c.value)continue;const unit=c.unit||h.value.match(/\b(USD|KHR|cases|patients|surgeries)\b/i)?.[0]||'',key=identity+'|'+h.value.trim().toLowerCase()+'|'+unit.toLowerCase(),prior=records.get(key),entry={id:fact.id,value:c.value,documentId:d.id};if(prior&&prior.documentId!==d.id&&prior.value!==c.value)conflicts.push({label:identity+' — '+h.value,evidenceIds:[prior.id,fact.id],values:[prior.value,c.value],message:'Same record reference has different values in selected files. Check period, units and revisions.'});else records.set(key,entry);
   }
  }
 }
 return {facts,warnings,conflicts,sourceHash:digest(documents.map(d=>[d.id,d.version,d.body.sha256])),algorithm:'anchors-and-decimal-sums-v1'};
}
export function checkDraft(sections,evidence){
 const known=new Map(evidence.facts.map(f=>[f.id,f])),issues=[],claims=[];
 for(const s of sections){if(!s.body.trim()){issues.push({severity:'missing',sectionId:s.id,message:'No supported content for this section.'});continue;}
  const supplied=s.claims??[];if(!supplied.length||supplied.map(c=>c.text).join('\n\n')!==s.body){const knownNumbers=new Set(evidence.facts.flatMap(f=>numbers(f.text))),absent=numbers(s.body).filter(n=>!knownNumbers.has(n));issues.push({severity:absent.length?'unsupported':'manual-check',sectionId:s.id,message:absent.length?'Edited text contains numbers absent from selected evidence: '+absent.join(', '):'Edited wording needs a full human check against the original files; previous claim citations are not asserted for this text.'});continue;}
  for(const [index,c] of supplied.entries()){const citations=c.citations??[],valid=citations.length>0&&citations.every(x=>known.has(x.id)&&typeof x.quote==='string'&&x.quote.trim()&&known.get(x.id).text.includes(x.quote));const quoteText=citations.map(x=>x.quote).join('\n'),allowed=new Set(numbers(quoteText));const absent=numbers(c.text).filter(n=>!allowed.has(n));const status=!valid||absent.length?'unsupported':'needs-human-check';claims.push({sectionId:s.id,index,text:c.text,status,citations:citations.map(x=>({...x,anchor:known.get(x.id)?.anchor??null})),absentNumbers:absent});if(status==='unsupported')issues.push({severity:'unsupported',sectionId:s.id,claim:index,message:!valid?'Citation is missing or does not match the selected source.':'Numbers absent from cited text: '+absent.join(', ')});
  }
 }
 return {at:new Date().toISOString(),textHash:digest(sections.map(s=>[s.id,s.body])),sourceHash:evidence.sourceHash,claims,issues,conflicts:evidence.conflicts,warning:'Citation and arithmetic checks are aids. A matching quotation does not prove that the draft conclusion is correct.'};
}
