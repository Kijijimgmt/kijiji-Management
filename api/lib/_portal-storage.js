// Notion-shaped compatibility boundary. Preserving record IDs and property shapes
// keeps existing client links, task attachments, strategies and calendars intact.
// Database and Storage access is SERVER ONLY, after the caller authorizes access.
const { randomUUID } = require('node:crypto');
const enabled = () => process.env.PORTAL_DATA_BACKEND === 'supabase';
const fail = (message, statusCode = 503) => { throw Object.assign(new Error(message), { statusCode, code: 'portal_storage_error' }); };
const uuid = (value) => {
  const s = String(value || '').replaceAll('-', '');
  if (!/^[a-f0-9]{32}$/i.test(s)) fail('Invalid record identifier.',400);
  return s.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5').toLowerCase();
};
async function backend(path, options = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Dashboard storage has not been configured.');
  const response = await fetch(`${url.replace(/\/$/,'')}/${path}`, {
    ...options, signal: AbortSignal.timeout(15000),
    headers: { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json', Prefer:'return=representation', ...options.headers },
  });
  if (!response.ok) fail(`Dashboard storage request failed (${response.status}).`);
  if (response.status === 204) return null;
  const raw = await response.text(); return raw ? JSON.parse(raw) : null;
}
const rest = (path, body, method = body ? 'POST':'GET') => backend(`rest/v1/${path}`, { method, ...(body ? {body:JSON.stringify(body)}:{}) });
const scalar = (p) => p?.select?.name ?? p?.status?.name ?? p?.date?.start ?? p?.number ?? p?.checkbox ?? p?.url ?? p?.created_time ?? p?.last_edited_time ?? (p?.title || p?.rich_text || []).map(x=>x.plain_text || x.text?.content || '').join('');
function matches(page, filter) {
  if (!filter) return true;
  if (filter.and) return filter.and.every(f=>matches(page,f));
  if (filter.or) return filter.or.some(f=>matches(page,f));
  const property = page.properties?.[filter.property];
  const type = Object.keys(filter).find(k=>k!=='property');
  if (!['select','status','rich_text','title','date','checkbox','number','relation'].includes(type)) fail('Unsupported storage filter.',400);
  const condition = filter[type], value = scalar(property);
  return Object.entries(condition).every(([op,target])=>{
    if(op==='equals') return value===target;
    if(op==='does_not_equal') return value!==target;
    if(op==='contains') return type==='relation' ? property?.relation?.some(r=>uuid(r.id)===uuid(target)) : String(value).includes(target);
    if(op==='is_empty') return target === (value==='' || value==null || (type==='relation' && !property?.relation?.length));
    if(op==='is_not_empty') return target !== (value==='' || value==null || (type==='relation' && !property?.relation?.length));
    if(op==='on_or_after') return String(value)>=target;
    if(op==='on_or_before') return String(value)<=target;
    if(op==='before') return String(value)<target;
    if(op==='after') return String(value)>target;
    fail('Unsupported storage filter operation.',400);
  });
}
function normalizeProperties(properties, schema = {}) {
  return Object.fromEntries(Object.entries(properties || {}).map(([key,p])=>{
    const type = p.type || schema[key]?.type || Object.keys(p).find(k=>!['id','name'].includes(k));
    const next = {...p,type};
    if(['title','rich_text'].includes(type)) next[type]=(p[type] || []).map(x=>({...x,plain_text:x.plain_text ?? x.text?.content ?? ''}));
    return [key,next];
  }));
}
async function signFile(path) {
  if (!/^[a-zA-Z0-9_./ -]+$/.test(path) || path.includes('..')) fail('Invalid file path.',400);
  const result = await backend(`storage/v1/object/sign/portal-documents/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',body:JSON.stringify({expiresIn:900})});
  const signed = result.signedURL || result.signedUrl;
  if (!signed) fail('The file download could not be prepared.');
  const origin = process.env.SUPABASE_URL.replace(/\/$/,'');
  const relative = signed.replace(/^\/storage\/v1\//, '').replace(/^\/+/, '');
  const url = new URL(relative, `${origin}/storage/v1/`);
  if (url.origin !== new URL(origin).origin || !url.pathname.startsWith('/storage/v1/')) fail('Invalid file download response.');
  return url.href;
}
async function materialize(value) {
  if (Array.isArray(value)) return Promise.all(value.map(materialize));
  if (!value || typeof value!=='object') return value;
  // Only durable object paths are stored; signed URLs are generated on demand.
  if (value.type==='portal_file' && value.portal_file?.path) return {
    name:value.name,type:'file',file:{url:await signFile(value.portal_file.path),expiry_time:new Date(Date.now()+900000).toISOString()}
  };
  return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await materialize(v)])));
}
function createStorage(request = rest, hydrate = materialize) {
  async function ready() {
    const rows=await request('portal_storage_state?id=eq.true&select=ready');
    if (!rows?.[0]?.ready) fail('The Supabase data migration is not verified yet. Ask Max to finish the transfer.');
  }
  async function source(id) {
    const rows=await request(`portal_sources?id=eq.${uuid(id)}&select=payload`);
    if(!rows?.[0]) fail('This dashboard collection has not been transferred.',404);
    return rows[0].payload;
  }
  async function listAll(table, query) {
    const rows=[]; let offset=0;
    while(true) {
      const batch=await request(`${table}?${query}&limit=500&offset=${offset}`);
      rows.push(...batch); if(batch.length<500) return rows; offset+=batch.length;
    }
  }
  return async function storageRequest(path, options={}) {
    await ready();
    const parsed = new URL(path,'https://storage.invalid');
    const parts=parsed.pathname.split('/').filter(Boolean), method=options.method || 'GET';
    const body=typeof options.body==='string'?JSON.parse(options.body):options.body || {};
    if(parts[0]==='data_sources' && parts.length===2 && method==='GET') return source(parts[1]);
    if(parts[0]==='data_sources' && parts[2]==='query' && method==='POST') {
      await source(parts[1]);
      let rows=(await listAll('portal_records',`source_id=eq.${uuid(parts[1])}&archived=eq.false&select=payload&order=id.asc`)).map(r=>r.payload).filter(p=>matches(p,body.filter));
      for(const sort of [...(body.sorts || [])].reverse()) rows.sort((a,b)=>{
        const x=String(sort.timestamp ? a[sort.timestamp] || '' : scalar(a.properties?.[sort.property]));
        const y=String(sort.timestamp ? b[sort.timestamp] || '' : scalar(b.properties?.[sort.property]));
        return x.localeCompare(y)*(sort.direction==='descending'?-1:1);
      });
      let start=0;
      if(body.start_cursor) { const index=rows.findIndex(r=>r.id===body.start_cursor); if(index<0) fail('The list changed; refresh and try again.',409); start=index+1; }
      const size=Math.min(100,Math.max(1,Number(body.page_size)||100)), slice=rows.slice(start,start+size), more=start+size<rows.length;
      return {results:await hydrate(slice),has_more:more,next_cursor:more?slice.at(-1).id:null};
    }
    if(parts[0]==='pages' && parts.length===1 && method==='POST') {
      const sourceId=uuid(body.parent?.data_source_id), schema=await source(sourceId), id=randomUUID(), now=new Date().toISOString();
      const payload={object:'page',id,url:'',created_time:now,last_edited_time:now,archived:false,in_trash:false,parent:{type:'data_source_id',data_source_id:sourceId},properties:normalizeProperties(body.properties,schema.properties)};
      const rows=await request('portal_records',{id,source_id:sourceId,payload},'POST');
      return hydrate(rows[0].payload);
    }
    if(parts[0]==='pages' && parts.length===2) {
      const id=uuid(parts[1]);
      if(method==='GET') {
        const rows=await request(`portal_records?id=eq.${id}&select=payload`);
        if(!rows?.[0]) fail('Record not found.',404); return hydrate(rows[0].payload);
      }
      if(method==='PATCH') {
        const patch={};
        if(body.properties) {
          const rows=await request(`portal_records?id=eq.${id}&select=source_id`);
          if(!rows?.[0]) fail('Record not found.',404);
          patch.properties=normalizeProperties(body.properties,(await source(rows[0].source_id)).properties);
        }
        for(const k of ['archived','in_trash']) if(k in body) patch[k]=Boolean(body[k]);
        const rows=await request('rpc/portal_patch_record',{record_id:id,patch},'POST');
        if(!rows?.[0]) fail('Record not found.',404); return hydrate(rows[0].payload);
      }
    }
    if(parts[0]==='blocks' && parts[2]==='children') {
      const id=uuid(parts[1]);
      if(method==='GET') {
        const rows=await listAll('portal_blocks',`parent_id=eq.${id}&select=payload&order=position.asc,id.asc`);
        const cursor=parsed.searchParams.get('start_cursor'); let start=0;
        if(cursor) {const index=rows.findIndex(r=>r.payload.id===cursor); if(index<0) fail('Invalid block cursor.',400); start=index+1;}
        const size=Math.min(100,Math.max(1,Number(parsed.searchParams.get('page_size'))||100)), slice=rows.slice(start,start+size), more=start+size<rows.length;
        return {results:await hydrate(slice.map(r=>r.payload)),has_more:more,next_cursor:more?slice.at(-1).payload.id:null};
      }
      if(method==='PATCH') {
        // A valid parent is required; never create orphaned workspace entries.
        const parent=await request(`portal_records?id=eq.${id}&archived=eq.false&select=id`);
        if(!parent?.length) fail('Client record not found.',404);
        if(!Array.isArray(body.children) || !body.children.length || body.children.length>100) fail('Invalid workspace entries.',400);
        const rows=body.children.map(b=>{const blockId=randomUUID();return {id:blockId,parent_id:id,payload:{...b,id:blockId,object:'block',created_time:new Date().toISOString()}};});
        const saved=await request('portal_blocks',rows,'POST'); return {results:await hydrate(saved.map(r=>r.payload)),has_more:false,next_cursor:null};
      }
    }
    fail('Unsupported dashboard storage operation.',400);
  };
}
const storageRequest=createStorage();
async function uploadFile(bytes, filename, contentType) {
  const path=`uploads/${randomUUID()}/${filename.replace(/[^a-zA-Z0-9_. -]/g,'_')}`;
  await backend(`storage/v1/object/portal-documents/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{'Content-Type':contentType},body:bytes});
  return {name:filename,type:'portal_file',portal_file:{path}};
}
async function removeFile(file) {
  return backend('storage/v1/object/portal-documents',{method:'DELETE',body:JSON.stringify({prefixes:[file.portal_file.path]})});
}
module.exports={enabled,storageRequest,createStorage,rest,backend,uploadFile,removeFile,normalizeProperties,matches,uuid,signFile};
