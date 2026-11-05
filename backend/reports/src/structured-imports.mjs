import {inflateRawSync} from 'node:zlib';
import {posix} from 'node:path';

const invalid=m=>{throw Object.assign(Error(m),{status:422});};
const MAX=40*1024*1024;
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
// Read OOXML without extracting paths or allowing unbounded decompression.
export function safeOfficeArchive(bytes){
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0)invalid('Invalid Office ZIP directory');
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16);
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||count!==bytes.readUInt16LE(end+8)||count>1000||!count||start+size!==end)invalid('Unsupported Office archive layout');
 let at=start,total=0;const entries=[],names=new Set(),ranges=[];
 for(let i=0;i<count;i++){
  if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)invalid('Invalid Office archive entry');
  const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),crc=bytes.readUInt32LE(at+16),compressed=bytes.readUInt32LE(at+20),expanded=bytes.readUInt32LE(at+24),n=bytes.readUInt16LE(at+28),x=bytes.readUInt16LE(at+30),c=bytes.readUInt16LE(at+32),offset=bytes.readUInt32LE(at+42),mode=bytes.readUInt32LE(at+38)>>>16;
  if(at+46+n+x+c>end)invalid('Truncated Office archive');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at+46,at+46+n));
  if(!name||/[\\:\x00-\x1f]/.test(name)||name.startsWith('/')||name.split('/').some(p=>p==='.'||p==='..')||names.has(name.toLowerCase())||(mode&0xf000)===0xa000)invalid('Unsafe or duplicate Office archive path');
  names.add(name.toLowerCase());if(flags&1||![0,8].includes(method)||expanded>8*1024*1024||(total+=expanded)>MAX||[compressed,expanded,offset].includes(0xffffffff))invalid('Unsupported or oversized Office archive');
  if(offset+30>start||bytes.readUInt32LE(offset)!==0x04034b50)invalid('Invalid Office local header');
  const ln=bytes.readUInt16LE(offset+26),lx=bytes.readUInt16LE(offset+28),data=offset+30+ln+lx;
  if(data+compressed>start||bytes.readUInt16LE(offset+6)!==flags||bytes.readUInt16LE(offset+8)!==method||!bytes.subarray(offset+30,offset+30+ln).equals(bytes.subarray(at+46,at+46+n)))invalid('Office archive header mismatch');
  if(!(flags&8)&&(bytes.readUInt32LE(offset+14)!==crc||bytes.readUInt32LE(offset+18)!==compressed||bytes.readUInt32LE(offset+22)!==expanded))invalid('Office archive size mismatch');
  if(ranges.some(([a,b])=>offset<b&&data+compressed>a))invalid('Overlapping Office archive entries');ranges.push([offset,data+compressed]);
  entries.push({name,method,crc,compressed,expanded,data});at+=46+n+x+c;
 }
 if(at!==end)invalid('Unexpected Office ZIP directory data');
 if(entries.some(e=>/vbaProject|externalLinks\//i.test(e.name)))invalid('Macros and external workbook links are not accepted');
 const files={};let actual=0;
 for(const e of entries){const packed=bytes.subarray(e.data,e.data+e.compressed),out=e.method===0?Buffer.from(packed):inflateRawSync(packed,{maxOutputLength:Math.min(e.expanded+1,8*1024*1024+1)});if(out.length!==e.expanded||crc32(out)!==e.crc||(actual+=out.length)>MAX)invalid('Office archive integrity check failed');files[e.name]={dir:e.name.endsWith('/'),async:async type=>type==='string'?new TextDecoder('utf-8',{fatal:true}).decode(out):Buffer.from(out)};}
 return {files,file:name=>files[name]??null};
}
const children=(n,name)=>(n.elements??[]).filter(x=>x.type==='element'&&(!name||x.name?.split(':').at(-1)===name));
const all=(n,name)=>[...(n.name?.split(':').at(-1)===name?[n]:[]),...(n.elements??[]).flatMap(x=>all(x,name))];
const value=n=>(n?.elements??[]).map(x=>x.type==='text'?x.text:x.type==='cdata'?x.cdata:value(x)).join('');
async function tree(archive,path,xml){const f=archive.file(path);if(!f)invalid('Missing Office part: '+path);const text=await f.async('string');if(text.length>4000000||/<!DOCTYPE|<!ENTITY/i.test(text))invalid('Unsafe or oversized Office XML');return xml.xml2js(text,{compact:false});}
function resolved(base,target){if(!target||target.startsWith('/')||/[:\\]/.test(target))invalid('Unsafe Office relationship');const p=posix.normalize(posix.join(base,target));if(!p.startsWith('xl/'))invalid('Workbook relationship escapes workbook');return p;}
export async function extractXlsx(archive,xml){
 const warnings=['Spreadsheet formulas are never calculated. Cached results may be stale and require checking against the original.'];
 const workbook=await tree(archive,'xl/workbook.xml',xml),rels=all(await tree(archive,'xl/_rels/workbook.xml.rels',xml),'Relationship');
 const date1904=['1','true'].includes(all(workbook,'workbookPr')[0]?.attributes?.date1904);
 if(rels.some(r=>r.attributes?.TargetMode==='External'))invalid('External workbook links are not accepted');
 const shared=archive.file('xl/sharedStrings.xml')?all(await tree(archive,'xl/sharedStrings.xml',xml),'si').map(n=>all(n,'t').map(value).join('')):[];
 const styles=archive.file('xl/styles.xml')?await tree(archive,'xl/styles.xml',xml):{};
 const fmts=new Map(all(styles,'numFmt').map(x=>[x.attributes.numFmtId,x.attributes.formatCode]));
 const formats=children(all(styles,'cellXfs')[0]??{},'xf').map(x=>fmts.get(x.attributes?.numFmtId)??({'9':'0%','10':'0.00%','14':'date','15':'date','16':'date','17':'date','18':'time','19':'time','20':'time','21':'time','22':'date-time','49':'@'}[x.attributes?.numFmtId]??''));
 const blocks=[];let cellCount=0;
 const sheets=all(workbook,'sheet');if(sheets.length>100)invalid('Workbook has too many sheets');
 for(const sheet of sheets){const a=sheet.attributes??{},relation=rels.find(x=>x.attributes?.Id===a['r:id']);if(!relation)invalid('Missing worksheet relationship');const p=resolved('xl',relation.attributes.Target);if(!/\/worksheet$/.test(relation.attributes.Type??'')){warnings.push(a.name+': non-worksheet content is not parsed');continue;}
  const data=await tree(archive,p,xml),seen=new Set();if(all(data,'mergeCell').length)warnings.push(a.name+': merged cells require checking; blank covered cells were not filled automatically');if(a.state&&a.state!=='visible')warnings.push(a.name+': hidden sheet is included and labelled');
  for(const row of all(data,'row')){const cells=[];for(const c of children(row,'c')){if(++cellCount>50000)invalid('Workbook contains too many cells');const ca=c.attributes??{},ref=ca.r;if(!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(ref??'')||seen.has(ref))invalid('Invalid or duplicate cell address');seen.add(ref);const type=ca.t??'n',raw=value(children(c,'v')[0]),f=children(c,'f')[0],formula=f?value(f):null,format=formats[Number(ca.s??0)]??'';let text=raw;
    if(formula&&(/\[[^\]]*\.(?:xlsx?|xlsm|csv)\]|(?:https?|file):|WEBSERVICE\s*\(|HYPERLINK\s*\(/i.test(formula)))invalid('External-link formulas are not accepted');
    if(type==='s'){if(!/^\d+$/.test(raw)||Number(raw)>=shared.length)invalid('Invalid shared string index');text=shared[Number(raw)];}else if(type==='inlineStr')text=all(c,'t').map(value).join('');else if(type==='b')text=raw==='1'?'TRUE':raw==='0'?'FALSE':raw;
    let numeric=type==='n'&&/^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(raw)?raw:null;
    const dateFormat=format==='date'||format.includes('time')||/[ymdhis]/i.test(format.replace(/"[^"]*"|\[[^\]]*\]/g,''));
    if(dateFormat&&numeric!==null){const serial=Number(raw);numeric=null;if(!Number.isFinite(serial)||serial<0||serial>2958465){text=raw+' (unsupported Excel date serial)';warnings.push(a.name+'!'+ref+': check date format against the original');}else if(!date1904&&Math.floor(serial)===60){text='1900-02-29 (Excel fictitious leap day)';warnings.push(a.name+'!'+ref+': Excel fictitious date is not a real calendar date');}else{const base=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,serial<60?31:30),iso=new Date(base+Math.round(serial*86400000)).toISOString();text=Number.isInteger(serial)?iso.slice(0,10):iso.replace('.000Z','')+' (Excel local date/time; timezone unspecified)';}}
    if(numeric!==null&&/^0+$/.test(format)&&/^[0-9]+$/.test(raw))text=raw.padStart(format.length,'0');
    if(numeric!==null&&format.includes('%')){if(/^-?\d+(?:\.\d+)?$/.test(raw)){const negative=raw.startsWith('-'),[a,b='']=raw.replace(/^-/, '').split('.'),digits=a+b.padEnd(2,'0'),scale=Math.max(0,b.length-2);text=(negative?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits).replace(/^0+(?=\d)/,'')+'%';}else{text=raw+' (fraction; percent-formatted cell)';warnings.push(a.name+'!'+ref+': inspect percentage display in original');}}
    const unit=(format.match(/"([^"]+)"/)?.[1]??(format.includes('$')?'$ (unspecified currency)':format.includes('%')?'%':''));
    if(f&&!children(c,'v').length){text='';numeric=null;warnings.push(a.name+'!'+ref+': formula has no cached result; no value was invented');}
    if(type==='e'){numeric=null;warnings.push(a.name+'!'+ref+': spreadsheet error '+raw);}
    cells.push({cell:ref,value:text,raw,type,numeric,format,unit,formula,cache:!!f,hidden:row.attributes?.hidden==='1'});
   }
   if(cells.length)blocks.push({sheet:a.name,row:Number(row.attributes?.r??cells[0].cell.match(/\d+$/)[0]),hidden:a.state&&a.state!=='visible'||row.attributes?.hidden==='1',cells,text:cells.map(c=>c.cell+' = '+c.value+(c.unit?' ['+c.unit+']':'')+(c.cache?' [cached formula]':'')).join(' | '),method:'xlsx'});
  }
 }
 return {blocks,text:blocks.map(b=>b.sheet+' row '+b.row+': '+b.text).join('\n'),warnings};
}
export function extractCsv(text){
 const rows=[];let row=[],cell='',quoted=false,closed=false;const start=text.charCodeAt(0)===0xfeff?1:0;
 for(let i=start;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}else if(c==='"'&&!cell&&!closed)quoted=true;else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}}else{if(closed)invalid('Unexpected text after a quoted CSV field');cell+=c;}}
 if(quoted)invalid('Unclosed CSV quote');if(cell||row.length||closed)rows.push([...row,cell]);if(rows.reduce((n,r)=>n+r.length,0)>50000)invalid('CSV contains too many cells');
 const columnName=index=>{let n=index+1,result='';while(n){n--;result=String.fromCharCode(65+n%26)+result;n=Math.floor(n/26);}return result;};
 const blocks=rows.map((r,i)=>({row:i+1,cells:r.map((v,j)=>({cell:columnName(j)+(i+1),column:j+1,value:v,raw:v,type:'text',numeric:/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v)?v:null,unit:'',formula:null,cache:false})),text:r.map((v,j)=>'column '+(j+1)+' = '+v).join(' | '),method:'csv'}));
 return {blocks,text:blocks.map(b=>'row '+b.row+': '+b.text).join('\n'),warnings:rows.some(r=>r.length!==rows[0]?.length)?['CSV rows have different column counts; check the original.']:[]};
}
