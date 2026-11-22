(() => {
  const display = value => String(value || '').replaceAll('\u2014', '-');
  function create({dialog, getHeaders}) {
    let request, returnFocus, sequence = 0;
    const title=dialog.querySelector('[data-preview-title]');
    const description=dialog.querySelector('[data-preview-description]');
    const content=dialog.querySelector('[data-preview-content]');
    const download=dialog.querySelector('[data-preview-download]');
    const note=dialog.querySelector('[data-preview-note]');
    const message=text=>{content.replaceChildren();const p=document.createElement('p');p.className='document-preview-message';p.textContent=text;content.append(p);};
    function reset(){sequence++;request?.abort();request=null;content.replaceChildren();download.removeAttribute('href');download.hidden=true;returnFocus?.focus();}
    dialog.addEventListener('close',reset);
    dialog.querySelectorAll('[data-close-preview]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
    function wordPreview(xml){
      const doc=new DOMParser().parseFromString(xml,'application/xml');
      if(doc.querySelector('parsererror'))throw Error('This Word file cannot be previewed. Download it to open the original.');
      const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const paper=document.createElement('article');paper.className='document-preview-paper';
      for(const paragraph of doc.getElementsByTagNameNS(ns,'p')){
        const pieces=[];
        for(const el of paragraph.getElementsByTagName('*')){
          if(el.namespaceURI!==ns)continue;
          if(el.localName==='t')pieces.push(el.textContent);
          if(el.localName==='tab')pieces.push('\t');
          if(el.localName==='br')pieces.push('\n');
        }
        const text=pieces.join('');if(!text.trim())continue;
        const p=document.createElement('p');p.textContent=(paragraph.getElementsByTagNameNS(ns,'numPr').length?'• ':'')+text;paper.append(p);
      }
      if(!paper.children.length)throw Error('No readable text was found. Download the original to view images or other content.');
      return paper;
    }
    async function open(file,trigger){
      request?.abort();request=new AbortController();const signal=request.signal, current=++sequence;returnFocus=trigger;
      title.textContent=display(file.name);description.textContent=display(file.description);note.textContent='';download.hidden=true;download.removeAttribute('href');message('Loading preview…');
      if(!dialog.open)dialog.showModal();dialog.querySelector('[data-close-preview]')?.focus();
      try{
        const response=await fetch(`/api/notion-documents?view=preview&id=${encodeURIComponent(file.id)}`,{headers:getHeaders(),cache:'no-store',signal});
        const result=await response.json();if(current!==sequence||!dialog.open)return;
        if(!response.ok)throw Error(result.message||'Preview could not be loaded. Close it and try again.');
        const url=new URL(result.downloadUrl);if(url.protocol!=='https:')throw Error('This download link is unavailable.');
        download.href=url.href;download.hidden=false;content.replaceChildren();
        if(result.kind==='pdf'){
          const frame=document.createElement('iframe');frame.title=`Preview of ${display(result.name)}`;frame.src=url.href+'#view=FitH';frame.referrerPolicy='no-referrer';frame.setAttribute('sandbox','allow-scripts allow-same-origin');content.append(frame);
          note.textContent='PDF preview. If your browser cannot display it, use Download.';
        }else if(result.kind==='image'){
          const img=document.createElement('img');img.alt=display(result.name);img.src=url.href;img.referrerPolicy='no-referrer';img.addEventListener('error',()=>{if(current===sequence)message('The image could not be displayed. Use Download to open the original.');});content.append(img);
        }else if(result.kind==='word'){
          note.textContent='Word text preview. Download the original to see the full layout and images.';content.append(wordPreview(result.xml));
        }else if(result.kind==='text'){
          const pre=document.createElement('pre');pre.className='document-preview-paper';pre.textContent=result.text;content.append(pre);
        }else message(result.message||'Preview is not available for this file type. Download it to open the original.');
      }catch(error){if(error.name!=='AbortError'&&current===sequence&&dialog.open)message(display(error.message));}
    }
    return {open,clear(){if(dialog.open)dialog.close();else reset();}};
  }
  window.KijijiDocumentPreview={create};
})();
