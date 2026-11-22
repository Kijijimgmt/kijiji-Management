/* Shared file organization rules. Originals remain separate stored files. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KijijiFileLibrary=api;})(typeof window==='object'?window:globalThis,()=>{
 const sections=['Onboarding','Brand & Strategy','Planning & Execution','Rights & Finance','Team Guides'];
 const families=[
  ['Talent Onboarding Checklist',0],['Talent Discovery Questionnaire',0],['Talent Contact Directory',0],
  ['Brand Identity Questionnaire',1],['Digital Presence Audit',1],['Competitive and Market Analysis',1],
  ['Talent Business Plan',2],['90-Day Talent Development Plan',2],['Project and Campaign Plan',2],['Revenue Opportunities Worksheet',2],
  ['Rights and Business Audit',3],['Kijiji Invoice Template',3],['Royalties 101 Guide',4],['Phase 2 Library Guide',4]
 ];
 const title=file=>String(file.name||file.fileName||'Untitled document').replace(/\s*\((?:PDF|Word|Editable Word)\)\s*$/i,'').trim();
 const format=file=>({docx:'Word',doc:'Word',pdf:'PDF',xlsx:'Excel',xls:'Excel',pptx:'PowerPoint',ppt:'PowerPoint',jpg:'JPG',jpeg:'JPG',png:'PNG',txt:'Text',md:'Markdown'}[String(file.fileName||'').split('.').pop().toLowerCase()]||'File');
 const master=file=>file.category==='Template'&&!file.clientIds?.length;
 function groups(files){
  const result=[];
  for(const file of files){
   const name=title(file),family=families.findIndex(([label])=>label.toLowerCase()===name.toLowerCase());
   const section=master(file)?(family<0?'Other Templates':sections[families[family][1]]):(!file.clientIds?.length?'Shared Resources':'Files');
   // Only combine recognized master variants. Revisions of the same format stay visible.
   const match=master(file)&&family>=0?result.find(g=>g.master&&g.name===name&&g.variants.every(v=>format(v)!==format(file))):null;
   if(match)match.variants.push(file);else result.push({id:file.id,name,section,master:master(file),order:family<0?999:family,variants:[file]});
  }
  return result.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name));
 }
 return{sections,title,format,master,groups};
});
