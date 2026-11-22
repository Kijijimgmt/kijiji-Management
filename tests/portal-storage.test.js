const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStorage,matches,normalizeProperties,uuid}=require('../api/lib/_portal-storage');
const {convert,fileHost,digest}=require('../scripts/migrate-portal-storage.cjs');
const source='03c5f70c-fb49-4d09-9de8-7fb8a45a04c7';
const id='11111111-1111-4111-8111-111111111111';
const schema={id:source,properties:{Client:{type:'title'},Status:{type:'select'}}};
const record={id,object:'page',properties:{Client:{type:'title',title:[{plain_text:'Medusa'}]},Status:{type:'select',select:{name:'Active'}}}};
test('not-ready storage fails closed without reading records or making writes',async()=>{
 let calls=0;const storage=createStorage(async p=>{calls++;assert.match(p,/portal_storage_state/);return[{ready:false}];});
 await assert.rejects(storage('/pages',{method:'POST',body:'{}'}),/not verified/);assert.equal(calls,1);
});
test('migrated records keep IDs and support the existing document archive filter',async()=>{
 const storage=createStorage(async p=>{
  if(p.startsWith('portal_storage_state'))return[{ready:true}];
  if(p.startsWith('portal_sources'))return[{payload:schema}];
  return [{payload:record},{payload:{id:'2',properties:{Status:{select:{name:'Archived'}}}}}];
 },async x=>x);
 const page=await storage(`/data_sources/${source}/query`,{method:'POST',body:JSON.stringify({filter:{property:'Status',select:{does_not_equal:'Archived'}}})});
 assert.equal(page.results.length,1);assert.equal(page.results[0].id,id);assert.equal(page.has_more,false);
});
test('query reads beyond Supabase response limits without silently dropping records',async()=>{
 let batches=0;
 const storage=createStorage(async p=>{
  if(p.startsWith('portal_storage_state'))return[{ready:true}];
  if(p.startsWith('portal_sources'))return[{payload:schema}];
  const offset=Number(new URL(p,'https://example.com').searchParams.get('offset'));batches++;
  return Array.from({length:offset===0?500:1},(_,i)=>({payload:{id:String(offset+i),properties:{}}}));
 },async x=>x);
 const page=await storage(`/data_sources/${source}/query`,{method:'POST',body:JSON.stringify({start_cursor:'499'})});
 assert.equal(batches,2);assert.equal(page.results.length,1);assert.equal(page.results[0].id,'500');
});
test('create normalizes title text for existing readers and preserves parent source',async()=>{
 let saved;
 const storage=createStorage(async(p,body)=>{
  if(p.startsWith('portal_storage_state'))return[{ready:true}];
  if(p.startsWith('portal_sources'))return[{payload:schema}];
  saved=body;return[body];
 },async x=>x);
 const page=await storage('/pages',{method:'POST',body:JSON.stringify({parent:{data_source_id:source},properties:{Client:{title:[{text:{content:'Medusa'}}]}}})});
 assert.equal(page.properties.Client.type,'title');assert.equal(page.properties.Client.title[0].plain_text,'Medusa');assert.equal(saved.source_id,source);assert.equal(page.url,'');
});
test('update uses atomic property merge instead of replacing the whole record',async()=>{
 let patch;
 const storage=createStorage(async(p,body)=>{
  if(p.startsWith('portal_storage_state'))return[{ready:true}];
  if(p.startsWith('portal_sources'))return[{payload:schema}];
  if(p.startsWith('portal_records'))return[{source_id:source}];
  assert.equal(p,'rpc/portal_patch_record');patch=body;return[{payload:record}];
 },async x=>x);
 await storage(`/pages/${id}`,{method:'PATCH',body:JSON.stringify({properties:{Status:{select:{name:'Active'}}},in_trash:false})});
 assert.equal(patch.record_id,id);assert.deepEqual(Object.keys(patch.patch.properties),['Status']);
});
test('workspace append preserves authors and supports plain_text fallback on read',async()=>{
 const storage=createStorage(async(p,body)=>{
  if(p.startsWith('portal_storage_state'))return[{ready:true}];
  if(p.startsWith('portal_records'))return[{id}];
  return body;
 },async x=>x);
 const saved=await storage(`/blocks/${id}/children`,{method:'PATCH',body:JSON.stringify({children:[{type:'code',code:{caption:[{text:{content:'marker'}}],rich_text:[{text:{content:'{"author":"Joe"}'}}]}}]})});
 assert.equal(saved.results[0].code.rich_text[0].text.content,'{"author":"Joe"}');assert.ok(saved.results[0].id);
});
test('unsupported filters fail rather than returning broadened results',()=>{
 assert.throws(()=>matches(record,{property:'Status',select:{unknown:'Active'}}),/Unsupported/);
 assert.throws(()=>uuid('x&select=secret'),/Invalid/);
});
test('migration replaces expiring attachment URLs with durable private object paths',()=>{
 const original={name:'contract.pdf',type:'file',file:{url:'https://notion.so/file',expiry_time:'expired'}};
 const target=convert(original,[{sourceUrl:'https://notion.so/file',filename:'abcd.bin'}]);
 assert.deepEqual(target,{name:'contract.pdf',type:'portal_file',portal_file:{path:'imports/abcd.bin'}});
 assert.throws(()=>convert(original,[]),/Missing file/);assert.equal(original.type,'file');
 assert.equal(fileHost(new URL('https://169.254.169.254/file')),false);
 assert.equal(fileHost(new URL('https://notion.so.evil.test/file')),false);
 assert.equal(fileHost(new URL('https://prod-files.s3.us-west-2.amazonaws.com/file')),true);
});
test('verification hashes do not depend on JSON object key order',()=>{
 assert.equal(digest({a:1,b:{c:2,d:3}}),digest({b:{d:3,c:2},a:1}));
});
test('signed downloads retain the storage API prefix and use short expiry',async()=>{
 const {signFile}=require('../api/lib/_portal-storage');
 const oldFetch=global.fetch, oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_URL='https://project.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='server-test';
 global.fetch=async(url,options)=>{assert.equal(JSON.parse(options.body).expiresIn,900);return new Response(JSON.stringify({signedURL:'/object/sign/portal-documents/imports/file.pdf?token=test'}));};
 try {assert.equal(await signFile('imports/file.pdf'),'https://project.supabase.co/storage/v1/object/sign/portal-documents/imports/file.pdf?token=test');}
 finally{global.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});
