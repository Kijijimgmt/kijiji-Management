// Private previews stay on Kijiji/Supabase. Never send contracts to an external viewer.
const {unzipSync,strFromU8}=require('fflate');
const MAX_BYTES=3*1024*1024, MAX_XML=2*1024*1024;
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
function trustedFileUrl(value, supabaseUrl=process.env.SUPABASE_URL){
 let url;try{url=new URL(value);}catch{fail('This file does not have a valid preview link.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port)fail('This file cannot be previewed safely.');
 let sameProject=false;try{sameProject=url.origin===new URL(supabaseUrl).origin&&url.pathname.startsWith('/storage/v1/object/sign/portal-documents/');}catch{}
 const notionFile=/(^|\.)(notion\.so|notion-static\.com)$/.test(url.hostname)||/^([a-z0-9-]+\.)?s3[.-][a-z0-9.-]+\.amazonaws\.com$/.test(url.hostname);
 if(!sameProject&&!notionFile)fail('Preview is unavailable for this external file.');
 return url.href;
}
async function readFile(url,fetchFile=fetch){
 const r=await fetchFile(url,{redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok)fail('The file could not be loaded. Close the preview and try again.',502);
 if(Number(r.headers.get('content-length'))>MAX_BYTES)fail('This file is too large to preview.',413);
 const chunks=[];let length=0;const reader=r.body.getReader();
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_BYTES)fail('This file is too large to preview.',413);chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks);
}
function wordXml(bytes){
 let entries;
 try{entries=unzipSync(bytes,{filter:file=>file.name==='word/document.xml'&&file.originalSize>0&&file.originalSize<=MAX_XML});}
 catch{fail('This Word file cannot be previewed. Download the original to open it.');}
 const body=entries['word/document.xml'];
 if(!body||body.length>MAX_XML)fail('This Word file cannot be previewed. Download the original to open it.');
 const xml=strFromU8(body);
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('This Word file cannot be previewed safely.');
 return xml;
}
async function previewFile(document,fetchFile=fetch){
 const url=trustedFileUrl(document.fileUrl);
 const ext=String(document.fileName||'').split('.').pop().toLowerCase();
 const base={name:document.name,description:document.description,fileName:document.fileName,downloadUrl:url};
 if(ext==='pdf')return{...base,kind:'pdf',url};
 if(['png','jpg','jpeg'].includes(ext))return{...base,kind:'image',url};
 if(!['docx','txt','md'].includes(ext))return{...base,kind:'unavailable',message:'Preview is not available for this file type. Download it to open the original.'};
 try{
  const bytes=await readFile(url,fetchFile);
  if(ext==='docx')return{...base,kind:'word',xml:wordXml(bytes)};
  return{...base,kind:'text',text:bytes.toString('utf8')};
 }catch(error){return{...base,kind:'unavailable',message:error.message};}
}
module.exports={previewFile,trustedFileUrl,readFile,wordXml};
