#!/usr/bin/env node
// Run only on a trusted machine with server credentials supplied in environment.
// export -> inspect -> import -> verify. Never enables the live backend.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {backend,rest,uuid}=require('../api/lib/_portal-storage');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources=[
 ['clients','NOTION_CLIENT_ROSTER_DATA_SOURCE_ID','03c5f70c-fb49-4d09-9de8-7fb8a45a04c7'],
 ['actions','NOTION_ACTIONS_DATA_SOURCE_ID','662c1c0d-d255-4fe9-8260-5dc4f293b051'],
 ['opportunities','NOTION_OPPORTUNITIES_DATA_SOURCE_ID','8548a9d4-1ffe-4787-90fc-3eb0a0085531'],
 ['events','NOTION_EVENTS_DATA_SOURCE_ID','4bf7373c-c744-4fe3-854e-ff0470954497'],
 ['documents','NOTION_DOCUMENTS_DATA_SOURCE_ID','8ba38a00-a408-44c9-befe-293359292f75'],
 ['briefs','NOTION_INDUSTRY_BRIEFS_DATA_SOURCE_ID','17891f32-2874-492d-a6f6-67bdcefd4333'],
 ...(process.env.NOTION_ACTIVITY_LOG_DATA_SOURCE_ID?[['activity','NOTION_ACTIVITY_LOG_DATA_SOURCE_ID','']]:[]),
].map(([kind,key,fallback])=>({kind,id:uuid((process.env[key]||fallback).replace(/^collection:\/\//,''))}));
async function notion(endpoint,body) {
 const key=process.env.NOTION_TOKEN||process.env.NOTION_API_KEY;
 if(!key)throw Error('Supply NOTION_TOKEN on the trusted machine; never put it in chat.');
 // A modest pace avoids Notion's average request limit. Retry only 429/5xx.
 for(let attempt=0;attempt<4;attempt++) {
  await new Promise(r=>setTimeout(r,350));
  const response=await fetch('https://api.notion.com/v1'+endpoint,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Notion-Version':process.env.NOTION_VERSION||'2026-03-11','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(response.ok)return response.json();
  if((response.status===429||response.status>=500)&&attempt<3){await new Promise(r=>setTimeout(r,Math.min(30000,Number(response.headers.get('retry-after')||2)*1000)));continue;}
  const details=await response.json().catch(()=>({}));throw Error(`Notion export blocked (${response.status}): ${details.message||'Check integration access.'}`);
 }
}
async function collect(endpoint,body,post=false){
 const all=[];let cursor;
 do {const page=post?await notion(endpoint,{...body,page_size:100,...(cursor?{start_cursor:cursor}:{})}):await notion(endpoint+`${endpoint.includes('?')?'&':'?'}page_size=100${cursor?'&start_cursor='+encodeURIComponent(cursor):''}`);all.push(...(page.results||[]));if(page.has_more&&!page.next_cursor)throw Error('Incomplete Notion pagination.');cursor=page.has_more?page.next_cursor:null;}while(cursor);
 return all;
}
function fileHost(url){return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&/(^|\.)(amazonaws\.com|notion\.so|notion-static\.com)$/.test(url.hostname);}
async function downloadFile(url,dest){
 let parsed=new URL(url);
 for(let hop=0;hop<4;hop++) {
  if(!fileHost(parsed))throw Error('An uploaded Notion file uses an unexpected download host; review before proceeding.');
  const r=await fetch(parsed,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if([301,302,303,307,308].includes(r.status)){parsed=new URL(r.headers.get('location'),parsed);continue;}
  if(!r.ok)throw Error(`A Notion attachment could not be downloaded (${r.status}); restart export for fresh links.`);
  const chunks=[];let size=0;
  for await(const part of r.body){size+=part.length;if(size>3*1024*1024)throw Error('An existing attachment exceeds the current 3 MB upload limit. Increase the migration storage limit deliberately before continuing.');chunks.push(part);}
  const bytes=Buffer.concat(chunks);if(!bytes.length)throw Error('An attachment was empty.');
  const sha256=hash(bytes),filename=sha256+'.bin';await fs.writeFile(path.join(dest,'files',filename),bytes,{mode:0o600});
  return {filename,sha256,bytes:bytes.length,contentType:r.headers.get('content-type')||'application/octet-stream'};
 }
 throw Error('Attachment redirect limit exceeded.');
}
async function exportData(dir){
 // Refuse to mix a new export with a previous partial export.
 await fs.mkdir(dir,{recursive:false,mode:0o700});await fs.mkdir(path.join(dir,'files'),{mode:0o700});
 const result={format:1,createdAt:new Date().toISOString(),complete:false,sources:[],records:[],blocks:[],files:[],externalUrls:[]};
 const urls=new Map();
 async function discover(value){
  if(!value||typeof value!=='object')return;
  if(value.type==='file'&&value.file?.url&&!urls.has(value.file.url)){
   const file=await downloadFile(value.file.url,dir);file.sourceUrl=value.file.url;urls.set(value.file.url,file);result.files.push(file);
  }
  if(value.type==='external'&&value.external?.url)result.externalUrls.push(value.external.url);
  for(const child of Object.values(value))if(child&&typeof child==='object')await discover(child);
 }
 async function children(parentId){
  const blocks=await collect(`/blocks/${parentId}/children`);
  for(const b of blocks){await discover(b);result.blocks.push({id:uuid(b.id),parent_id:uuid(parentId),payload:b,position:result.blocks.length+1});if(b.has_children)await children(b.id);}
 }
 for(const source of sources){
  const payload=await notion(`/data_sources/${source.id}`);result.sources.push({...source,payload});
  const pages=await collect(`/data_sources/${source.id}/query`,{},true);
  for(const page of pages){
   if(page.object!=='page')throw Error('Unexpected source object; export is incomplete.');
   for(const [key,p] of Object.entries(page.properties||{}))if(p.has_more){
    const parts=await collect(`/pages/${page.id}/properties/${encodeURIComponent(p.id)}`);
    if(!['relation','title','rich_text'].includes(p.type))throw Error(`Property ${key} requires a custom export reader before transfer.`);
    p[p.type]=parts.flatMap(x=>Array.isArray(x[p.type])?x[p.type]:x[p.type]?[x[p.type]]:[]);p.has_more=false;
   }
   await discover(page);result.records.push({id:uuid(page.id),source_id:source.id,payload:page,archived:Boolean(page.archived||page.in_trash)});await children(page.id);
  }
  console.log(`Exported ${source.kind}: ${pages.length} records.`);
 }
 result.complete=true;result.externalUrls=[...new Set(result.externalUrls)];
 await fs.writeFile(path.join(dir,'export.json'),JSON.stringify(result,null,2),{mode:0o600});
 console.log('Complete backup saved. It contains private records and attachment URLs; keep it out of Git and public folders.');
}
async function readBackup(dir){
 const data=JSON.parse(await fs.readFile(path.join(dir,'export.json'),'utf8'));
 if(data.format!==1||!data.complete)throw Error('Only complete version 1 exports can be transferred.');
 for(const s of sources)if(!data.sources.some(x=>uuid(x.id)===s.id))throw Error(`Missing ${s.kind} source.`);
 for(const key of ['sources','records','blocks']){const ids=data[key].map(x=>uuid(x.id));if(new Set(ids).size!==ids.length)throw Error(`Duplicate IDs in ${key}.`);}
 for(const f of data.files){if(!/^[a-f0-9]{64}\.bin$/.test(f.filename))throw Error('Invalid backup file path.');const b=await fs.readFile(path.join(dir,'files',f.filename));if(hash(b)!==f.sha256||b.length!==f.bytes)throw Error('Attachment checksum mismatch.');}
 return data;
}
function convert(value,files){
 if(!value||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(v=>convert(v,files));
 if(value.type==='file'&&value.file?.url){const f=files.find(f=>f.sourceUrl===value.file.url);if(!f)throw Error('Missing file bytes in backup.');return {name:value.name||f.filename,type:'portal_file',portal_file:{path:'imports/'+f.filename}};}
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,convert(v,files)]));
}
function expected(data){return {
 sources:data.sources.map(s=>({...s,payload:convert(s.payload,data.files)})),
 records:data.records.map(r=>({...r,payload:convert(r.payload,data.files)})),
 blocks:data.blocks.map(b=>({...b,payload:convert(b.payload,data.files)})),
};}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
const digest=value=>hash(JSON.stringify(canonical(value)));
async function importedState(){const state=await rest('portal_storage_state?id=eq.true&select=ready');if(state?.[0]?.ready)throw Error('Storage is already marked ready. Refusing to overwrite or reverify a live database.');}
async function importData(dir){
 const data=await readBackup(dir);await importedState();const target=expected(data);
 for(const f of data.files)await backend(`storage/v1/object/portal-documents/imports/${f.filename}`,{method:'POST',headers:{'Content-Type':f.contentType,'x-upsert':'true'},body:await fs.readFile(path.join(dir,'files',f.filename))});
 for(const kind of ['sources','records','blocks'])for(let i=0;i<target[kind].length;i+=50)await backend(`rest/v1/portal_${kind}?on_conflict=id`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(target[kind].slice(i,i+50))});
 console.log('Imported into staging tables. Live backend is unchanged. Run verify next.');
}
async function all(table){const rows=[];for(let offset=0;;){const batch=await rest(`${table}?select=*&order=id.asc&limit=500&offset=${offset}`);rows.push(...batch);if(batch.length<500)return rows;offset+=batch.length;}}
async function verify(dir){
 const data=await readBackup(dir);await importedState();const target=expected(data),report={verifiedAt:new Date().toISOString(),counts:{},files:0,unresolvedRelations:[],computedProperties:[],externalUrls:data.externalUrls};
 for(const kind of ['sources','records','blocks']){
  const actual=await all('portal_'+kind);if(actual.length!==target[kind].length)throw Error(`Count mismatch for ${kind}.`);
  const index=new Map(actual.map(r=>[r.id,r]));
  for(const row of target[kind])for(const key of Object.keys(row))if(digest(index.get(row.id)?.[key])!==digest(row[key]))throw Error(`Content mismatch for ${kind} ${row.id} field ${key}.`);
  report.counts[kind]=actual.length;
 }
 for(const f of data.files){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response=await fetch(`${process.env.SUPABASE_URL.replace(/\/$/,'')}/storage/v1/object/authenticated/portal-documents/imports/${f.filename}`,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000)});
  if(!response.ok||hash(Buffer.from(await response.arrayBuffer()))!==f.sha256)throw Error('Stored attachment verification failed.');report.files++;
 }
 const ids=new Set(data.records.map(r=>r.id));
 for(const record of data.records)for(const [name,p] of Object.entries(record.payload.properties||{})){
  for(const rel of p.relation||[])if(!ids.has(uuid(rel.id)))report.unresolvedRelations.push({record:record.id,property:name,target:rel.id});
  if(['formula','rollup'].includes(p.type))report.computedProperties.push({record:record.id,property:name,type:p.type});
 }
 report.readyForReview=!(report.unresolvedRelations.length||report.computedProperties.length);
 await fs.writeFile(path.join(dir,'verification.json'),JSON.stringify(report,null,2),{mode:0o600});
 await rest('portal_storage_state?id=eq.true',{verified_at:report.verifiedAt,verification:report},'PATCH');
 console.log(JSON.stringify({...report,externalUrls:report.externalUrls.length},null,2));
 console.log('Data verified; readiness remains OFF. Review relations/computed fields, freeze Notion writes, and test dashboard workflows before cutover.');
}
async function main(){const [command,directory]=process.argv.slice(2);if(!directory||!['export','inspect','import','verify'].includes(command))throw Error('Usage: node scripts/migrate-portal-storage.cjs export|inspect|import|verify /absolute/private/backup-directory');const dir=path.resolve(directory);const repo=path.resolve(__dirname,'..');if(dir===repo||dir.startsWith(repo+path.sep))throw Error('Keep private migration backups outside the website project directory.');if(command==='export')return exportData(dir);if(command==='import')return importData(dir);if(command==='verify')return verify(dir);const data=await readBackup(dir);console.log(JSON.stringify({sources:data.sources.map(s=>s.kind),records:data.records.length,blocks:data.blocks.length,files:data.files.length,externalUrls:data.externalUrls.length},null,2));}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={canonical,digest,convert,fileHost,expected};
