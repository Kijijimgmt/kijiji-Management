create table if not exists public.client_strategy_documents (
 id uuid primary key default gen_random_uuid(),
 client_id text not null references public.client_strategy_state(client_id),
 filename text not null, content_base64 text not null,
 byte_size integer not null check(byte_size > 0 and byte_size <= 3145728),
 sha256 text not null, period text not null,
 uploaded_by text not null, uploaded_at timestamptz not null default now(),
 unique(client_id,sha256)
);
alter table public.client_strategy_documents enable row level security;
revoke all on public.client_strategy_documents from public,anon,authenticated;
grant all on public.client_strategy_documents to service_role;

create or replace function public.add_strategy_document(p_client text,p_document jsonb,p_actor text)
returns uuid language plpgsql security definer set search_path=public as $$
declare existing_id uuid; new_id uuid;
begin
 insert into client_strategy_state(client_id) values(p_client) on conflict do nothing;
 perform 1 from client_strategy_state where client_id=p_client for update;
 select id into existing_id from client_strategy_documents where client_id=p_client and sha256=p_document->>'sha256';
 if existing_id is not null then return existing_id; end if;
 if (select count(*) from client_strategy_documents where client_id=p_client)>=3 then raise exception 'Three supporting PDFs are already stored for this client'; end if;
 insert into client_strategy_documents(client_id,filename,content_base64,byte_size,sha256,period,uploaded_by)
 values(p_client,p_document->>'filename',p_document->>'content_base64',(p_document->>'byte_size')::integer,p_document->>'sha256',p_document->>'period',p_actor) returning id into new_id;
 return new_id;
end $$;
revoke all on function public.add_strategy_document(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.add_strategy_document(text,jsonb,text) to service_role;

-- A draft may be refined before approval; this never creates a Current Plan.
create or replace function public.claim_client_strategy(p_client text, p_kind text, p_base uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s client_strategy_state; existing_id uuid; token uuid;
begin
 if p_kind not in ('initial','alternative','revision','client') then raise exception 'Invalid strategy kind'; end if;
 insert into client_strategy_state(client_id) values(p_client) on conflict do nothing;
 select * into s from client_strategy_state where client_id=p_client for update;
 if p_kind='initial' then
  select id into existing_id from client_strategy_versions where client_id=p_client and kind='initial' limit 1;
  if existing_id is not null then return jsonb_build_object('status','existing','id',existing_id); end if;
 else
  if s.current_id is distinct from p_base then return jsonb_build_object('status','stale'); end if;
  if s.current_id is null and (p_kind<>'revision' or not exists(select 1 from client_strategy_versions where client_id=p_client and kind='initial')) then return jsonb_build_object('status','stale'); end if;
  if p_kind='client' then
   select id into existing_id from client_strategy_versions where client_id=p_client and kind='client' and base_id=p_base limit 1;
   if existing_id is not null then return jsonb_build_object('status','existing','id',existing_id); end if;
  end if;
 end if;
 if s.lock_until > now() then return jsonb_build_object('status','busy'); end if;
 token:=gen_random_uuid();
 update client_strategy_state set lock_token=token,lock_until=now()+interval '3 minutes' where client_id=p_client;
 return jsonb_build_object('status','claimed','token',token);
end $$;
notify pgrst, 'reload schema';
