(() => {
  const escape = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const titles = ['Goal','Starting point','Risks to resolve','Market opportunity','Action plan','Ownership','Resources','Decisions needed','Tests & alternatives','What changed'];
  function inline(text) {
    return escape(text).replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
  }
  function format(text) {
    let html='', list=false;
    const closeList=()=>{if(list){html+='</ul>';list=false;}};
    for(const raw of String(text||'').split('\n')) {
      const line=raw.trim();if(!line)continue;
      const plain=line.replace(/^#{1,4}\s*/,'').replace(/^\*\*|\*\*$/g,'').replace(/:$/,'');
      const numbered=plain.match(/^(10|[1-9])\.\s+(.+)$/);
      const heading=numbered&&(line.startsWith('**')||line.startsWith('#')||/^(Goal|Starting|Risks|Market|Action|Ownership|Resources|Decisions|Tests|What|Existing|Gaps|Current|First|Team|Questions|Changes)\b/i.test(numbered[2]));
      if(heading||/^#{1,4}\s/.test(line)||(/^\*\*[^*]+\*\*:?$/.test(line)&&line.length<160)){closeList();html+=`<h3>${escape(heading?titles[Number(numbered[1])-1]:plain)}</h3>`;}
      else if(/^[-•]\s/.test(line)){if(!list){html+='<ul>';list=true;}html+=`<li>${inline(line.replace(/^[-•]\s/,''))}</li>`;}
      else{closeList();html+=`<p>${inline(line)}</p>`;}
    }
    closeList();return html;
  }
  if(typeof module!=='undefined')module.exports={format};else window.formatStrategy=format;
})();
