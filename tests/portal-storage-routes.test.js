const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const auth=require('../api/lib/kijiji-auth');
const {createStorage}=require('../api/lib/_portal-storage');
const clientsSource='03c5f70c-fb49-4d09-9de8-7fb8a45a04c7';
const rich=value=>({type:'rich_text',rich_text:[{plain_text:value}]});
const clients=[['11111111-1111-4111-8111-111111111111','Medusa','Joe, Erik, Maxwell'],['22222222-2222-4222-8222-222222222222','Private client','Maxwell']].map(([id,name,owner])=>({id,object:'page',properties:{Client:{type:'title',title:[{plain_text:name}]},'Primary Owner':rich(owner)}}));
function handler(identity){
 let storageCalls=0;
 const storageRequest=createStorage(async path=>{
  storageCalls++;
  if(path.startsWith('portal_storage_state'))return[{ready:true}];
  if(path.startsWith('portal_sources'))return[{payload:{properties:{}}}];
  return path.includes(clientsSource)?clients.map(payload=>({payload})):[];
 },async value=>value);
 const context={module:{exports:{}},process:{env:{PORTAL_DATA_BACKEND:'supabase'}},console:{error(){}},setTimeout,clearTimeout,URL,AbortSignal,
  fetch:()=>{throw Error('No Notion or external network access is allowed in this test.');},
  require(name){
   if(name.includes('_portal-storage'))return{enabled:()=>true,storageRequest};
   if(name.includes('kijiji-auth'))return{...auth,verifyTeamAccess:async()=>{if(!identity)throw Object.assign(new Error('Sign in'),{statusCode:401});return identity;}};
   if(name.includes('kijiji-ops'))return{assertWritesAllowed(){},logActivity:async()=>({})};
   if(name.includes('partner-notifications'))return{notifyPartners:async()=>({})};
   if(name.includes('_google-calendar'))return{readCalendar:async()=>({links:[],connection:{status:'reconnect'}})};
   if(name.includes('_team-meeting'))return{};
   throw Error('Unexpected module '+name);
  }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/notion-clients'),'utf8'),context);
 return {run:context.module.exports,calls:()=>storageCalls};
}
function response(){return{headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};}
for(const owner of ['Joe','Erik','Maxwell'])test(`${owner} retains their existing client visibility on Supabase`,async()=>{
 const {run}=handler({fullName:owner,owner,isAdmin:owner==='Maxwell',authMode:'supabase'}),r=response();
 await run({method:'GET',query:{}},r);
 assert.equal(r.statusCode,200);assert.equal(r.body.source.type,'supabase');
 assert.equal(r.body.clients.length,owner==='Maxwell'?2:1);assert.equal(r.body.clients[0].name,'Medusa');
 assert.equal(r.headers['Cache-Control'],'private, no-store');
 assert.equal(r.body.googleCalendar.connection.status,'reconnect');
});
test('unauthenticated dashboard requests cannot read staged Supabase data',async()=>{
 const {run,calls}=handler(null),r=response();await run({method:'GET',query:{}},r);assert.equal(r.statusCode,401);assert.equal(calls(),0);
});
