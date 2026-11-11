const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function handler(fetch, verify=async()=>({email:'joe@kijijimgmt.com'})) {
 const context={module:{exports:{}},require:()=>({verifyTeamAccess:verify}),process:{env:{NOTION_TOKEN:'test'}},fetch,Response,FormData,AbortSignal,URL,Buffer,Blob,console:{error(){}},Set};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/notion-documents'),'utf8'),context);
 return context.module.exports;
}
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=JSON.parse(v)}}}
test('file listing follows pagination and responds with uncached authenticated data',async()=>{
 let calls=0;
 const run=handler(async(url,opts)=>{
  const input=JSON.parse(opts.body);calls++;
  if(calls===2)assert.equal(input.start_cursor,'next');
  return new Response(JSON.stringify({results:[{object:'page',id:'file'+calls,properties:{Document:{title:[{plain_text:'Contract '+calls}]}}}],has_more:calls===1,next_cursor:calls===1?'next':null}));
 });
 const r=response();await run({method:'GET'},r);assert.equal(calls,2);assert.equal(r.body.documents.length,2);assert.equal(r.headers['Cache-Control'],'private, no-store');
});
test('a failed file page returns an error rather than a partial or empty success',async()=>{
 let calls=0;const run=handler(async()=>++calls===1?new Response(JSON.stringify({results:[],has_more:true,next_cursor:'next'})):new Response('{}',{status:404}));
 const r=response();await run({method:'GET'},r);assert.equal(r.statusCode,503);assert.match(r.body.message,/Share the Kijiji Document Library/);assert.equal(r.body.documents,undefined);
});
test('unauthorized file requests never reach Notion',async()=>{
 let called=false;const run=handler(async()=>{called=true},async()=>{throw Object.assign(new Error('Sign in'),{statusCode:401})});
 const r=response();await run({method:'GET'},r);assert.equal(r.statusCode,401);assert.equal(called,false);
});
