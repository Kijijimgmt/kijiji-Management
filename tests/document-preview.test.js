const {test}=require('node:test');
const assert=require('node:assert/strict');
const {zipSync,strToU8}=require('fflate');
const {trustedFileUrl,wordXml,previewFile,readFile}=require('../api/lib/_document-preview');
process.env.SUPABASE_URL='https://project.supabase.co';
const url='https://project.supabase.co/storage/v1/object/sign/portal-documents/templates/file.docx?token=short';
const file={name:'Invoice',description:'Master',fileName:'invoice.docx',fileUrl:url};
test('private preview rejects arbitrary URLs, credentials, ports and unrelated Supabase projects',()=>{
 assert.equal(trustedFileUrl(url),url);
 for(const u of ['http://localhost/private','https://169.254.169.254/file','https://project.supabase.co.evil.test/file','https://other.supabase.co/storage/v1/object/sign/private','https://user:pass@project.supabase.co/storage/v1/object/sign/portal-documents/a','https://project.supabase.co:8443/storage/v1/object/sign/portal-documents/a'])assert.throws(()=>trustedFileUrl(u));
});
test('Word preview extracts only the bounded document XML, leaving other ZIP files untouched',()=>{
 const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>INVOICE &amp; terms</w:t></w:r></w:p></w:document>';
 const bytes=zipSync({'word/document.xml':strToU8(xml),'word/media/unused':new Uint8Array(1024*1024)});
 assert.equal(wordXml(bytes),xml);
 assert.throws(()=>wordXml(zipSync({'word/document.xml':strToU8('<!DOCTYPE x><x/>')})),/safely/);
 assert.throws(()=>wordXml(zipSync({'word/document.xml':new Uint8Array(2*1024*1024+1)})),/cannot be previewed/);
});
test('PDF preview uses fresh private storage URL without sending files to a third-party viewer',async()=>{
 const r=await previewFile({...file,fileName:'contract.pdf'},()=>{throw Error('PDF bytes should use the browser viewer');});
 assert.equal(r.kind,'pdf');assert.equal(r.url,url);assert.equal(r.downloadUrl,url);
});
test('Word preview returns text source without exposing scripts as rendered HTML',async()=>{
 const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p></w:document>';
 const r=await previewFile(file,async(u,opts)=>{assert.equal(opts.redirect,'error');return new Response(zipSync({'word/document.xml':strToU8(xml)}));});
 assert.equal(r.kind,'word');assert.equal(r.xml,xml);assert.equal(r.html,undefined);
});
test('unsupported and corrupt documents keep the fresh original download available',async()=>{
 const legacy=await previewFile({...file,fileName:'old.doc'});assert.equal(legacy.kind,'unavailable');assert.equal(legacy.downloadUrl,url);
 const corrupt=await previewFile(file,async()=>new Response('not a Word archive'));assert.equal(corrupt.kind,'unavailable');assert.equal(corrupt.downloadUrl,url);
});
test('preview byte reader enforces the real streamed size as well as content-length',async()=>{
 await assert.rejects(readFile(url,async()=>new Response('x',{headers:{'content-length':String(4*1024*1024)}})),/too large/);
 await assert.rejects(readFile(url,async()=>new Response(new Uint8Array(3*1024*1024+1))),/too large/);
});
