const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function builders(){
 const c={module:{exports:{}},process:{env:{}},require(name){if(name.includes('_portal-storage'))return{enabled:()=>true};return{};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/notion-clients'),'utf8')+'\nmodule.exports.testBuilders={clientProperties,actionProperties,opportunityProperties,eventProperties,mapPageToEvent};',c);
 return c.module.exports.testBuilders;
}
const schema=fields=>Object.fromEntries(Object.entries(fields).map(([k,type])=>[k,{type}]));
test('task notes and client text do not overwrite dependencies when a schema field is missing',()=>{
 const b=builders(),props=b.actionProperties({title:'Review contract',status:'Open',dependency:'Client signature',notes:'Notes',clientName:'Medusa'},schema({Action:'title',Status:'select','Depends On':'rich_text'}));
 assert.equal(props['Depends On'].rich_text[0].text.content,'Client signature');assert.equal(props.Notes,undefined);assert.equal(Object.keys(props).length,3);
});
test('client next-action date writes separately from last-touch date',()=>{
 const b=builders(),props=b.clientProperties({name:'Sample',lastTouch:'2026-11-01',dueDate:'2026-11-30',progress:0},schema({Client:'title','Last Touch':'date','Next Action Date':'date'}));
 assert.equal(props['Last Touch'].date.start,'2026-11-01');assert.equal(props['Next Action Date'].date.start,'2026-11-30');
});
test('opportunity follow-up date uses the existing imported field',()=>{
 const b=builders(),props=b.opportunityProperties({name:'Sample',dueDate:'2026-11-30'},schema({Opportunity:'title','Next Follow-up':'date','Submitted At':'date'}));
 assert.equal(props['Next Follow-up'].date.start,'2026-11-30');assert.equal(props['Submitted At'],undefined);
});
test('event notes write into the same field that the calendar reads',()=>{
 const b=builders(),props=b.eventProperties({name:'Industry: Example',type:'Event',notes:'Kijiji shared industry date\nSource'},schema({'Event / Release':'title',Type:'select','Next Step':'rich_text',Blocker:'rich_text'}));
 assert.equal(props['Next Step'].rich_text[0].text.content,'Kijiji shared industry date\nSource');assert.equal(props.Blocker,undefined);
});
