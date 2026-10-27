(() => {
  window.exportStrategy = (version, clientName, status, print = false) => {
    const escape = value => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const title = `${clientName} — Partner brief`;
    const date = new Date(version.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    const sources = (version.citations || []).filter(item => /^https:\/\//.test(item.url));
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>
      *{box-sizing:border-box}body{font:16px/1.65 Arial,sans-serif;color:#25221f;background:#fff;max-width:850px;margin:48px auto;padding:0 32px}header{border-bottom:3px solid #c87932;padding-bottom:20px;margin-bottom:28px}header p{color:#805024;font-size:13px;letter-spacing:.06em}h1{font-size:30px;line-height:1.2;margin:12px 0}h3{font-size:19px;margin:28px 0 10px;break-after:avoid}p{margin:8px 0 14px}li{margin:7px 0}a{color:#805024;overflow-wrap:anywhere}.status{font-weight:bold}footer{margin-top:36px;border-top:1px solid #ddd;padding-top:16px;font-size:12px}button{padding:10px 16px;margin-bottom:20px;cursor:pointer}@media print{body{margin:0;max-width:none;padding:0;font-size:11pt}button{display:none}a{color:inherit}header{break-inside:avoid}}@page{margin:18mm}
      </style></head><body><button onclick="window.print()">Print / Save as PDF</button><header><p>KIJIJI MANAGEMENT · TEAM STRATEGY</p><h1>${escape(title)}</h1><div class="status">${escape(status)}</div><div>${escape(date)}</div></header><main>${window.formatStrategy(version.content)}</main><footer>${sources.length?`<strong>Research sources</strong><ul>${sources.map(item=>`<li><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.title || item.url)}</a></li>`).join('')}</ul>`:''}<p>Saved copy of the team plan. Check the dashboard for the latest version.${!version.approved_at?' This draft has not been approved.':''}</p></footer></body></html>`;
    if (print) {
      const popup = window.open('', '_blank');
      if (!popup) throw new Error('Allow a new window to print or save this plan as PDF.');
      popup.opener = null;
      popup.document.write(html); popup.document.close();
      popup.focus(); popup.print();
      return;
    }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');link.href = url;
    link.download = `${clientName.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g,'-')}-plan-${version.id.slice(0,8)}.html`;
    document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
})();
