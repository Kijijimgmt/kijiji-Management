const {test}=require('node:test');
const assert=require('node:assert/strict');
const {groups,title,format}=require('../file-library');
const file=(id,name,ext,extra={})=>({id,name,fileName:`original.${ext}`,category:'Template',clientIds:[],...extra});
test('master formats group under one workflow document without modifying originals',()=>{
 const input=[file('word','Talent Business Plan (Word)','docx'),file('pdf','Talent Business Plan (PDF)','pdf'),file('onboard','Talent Onboarding Checklist (PDF)','pdf')];
 const before=JSON.stringify(input), result=groups(input);
 assert.equal(result.length,2);assert.equal(result[0].section,'Onboarding');assert.equal(result[1].name,'Talent Business Plan');assert.equal(result[1].variants.length,2);assert.equal(JSON.stringify(input),before);
});
test('client copies, unrelated files and same-format revisions remain separate',()=>{
 const result=groups([file('a','Talent Business Plan (Word)','docx'),file('b','Talent Business Plan (Word)','docx'),file('c','Talent Business Plan (Word)','docx',{clientIds:['client']}),file('d','Custom (Word)','docx'),file('e','Custom (PDF)','pdf')]);
 assert.equal(result.length,5);assert.equal(result.find(g=>g.id==='c').master,false);
});
test('formats stay available for standalone PDFs, guides and shared resources',()=>{
 assert.equal(format(file('a','Any','docx')),'Word');assert.equal(title(file('a','Any (PDF)','pdf')),'Any');
 const result=groups([file('a','Royalties 101 Guide (Word)','docx'),file('b','Team policy','pdf',{category:'Operations'})]);
 assert.equal(result[0].section,'Team Guides');assert.equal(result[1].section,'Shared Resources');
});
