const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validatePdf,importPdf}=require('../api/lib/_strategy-evidence');
const {format}=require('../strategy-format');
test('supporting PDFs have a bounded size, verified header and stable hash',()=>{
 const p={filename:'deck.pdf',base64:Buffer.from('%PDF-1.7\ntest').toString('base64')};
 const a=validatePdf(p);assert.equal(a.sha256,validatePdf(p).sha256);assert.equal(a.period,'Not supplied');
 assert.throws(()=>validatePdf({...p,filename:'x.html'}));
 assert.throws(()=>validatePdf({...p,base64:Buffer.from('<html>').toString('base64')}));
 assert.throws(()=>validatePdf({...p,base64:'A'.repeat(4194308)}));
});
test('Jotform import rejects unrelated, local, credentialed and deceptive URLs',async()=>{
 for(const url of ['http://jotform.com/x.pdf','https://localhost/x.pdf','https://jotform.com.evil.test/x.pdf','https://user:password@jotform.com/x.pdf']) await assert.rejects(importPdf({attachments:[{url,filename:'x.pdf'}]},0));
});
test('partner brief renders headings and lists, never uploaded HTML or unsafe links',()=>{
 const html=format('**1. What the client wants:**\n\nA goal.\n\n- **Owner:** Team\n<script>alert(1)</script>\n[bad](javascript:alert)\n[Source](https://example.com)');
 assert.match(html,/<h3>Goal<\/h3>/);assert.match(html,/<li><strong>Owner:<\/strong> Team<\/li>/);
 assert(!html.includes('<script>'));assert(!html.includes('href="javascript:'));assert(html.includes('href="https://example.com"'));
});
