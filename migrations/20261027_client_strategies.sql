-- Run once in the connected Supabase SQL editor. Server-only storage and RPC.
create table if not exists public.client_strategy_state (
  client_id text primary key,
  current_id uuid,
  lock_token uuid,
  lock_until timestamptz
);
create table if not exists public.client_strategy_versions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.client_strategy_state(client_id),
  submission_id text not null,
  source_hash text not null,
  source_snapshot jsonb not null,
  kind text not null check (kind in ('initial','alternative','revision','client')),
  base_id uuid references public.client_strategy_versions(id),
  content text not null,
  citations jsonb not null default '[]',
  created_at timestamptz not null default now(),
  created_by text not null,
  approved_at timestamptz,
  approved_by text
);
create index if not exists client_strategy_versions_client on public.client_strategy_versions(client_id,created_at desc);
alter table public.client_strategy_state enable row level security;
alter table public.client_strategy_versions enable row level security;
revoke all on public.client_strategy_state, public.client_strategy_versions from anon, authenticated;
grant all on public.client_strategy_state, public.client_strategy_versions to service_role;

-- The database row lock makes acquisition atomic across requests and server instances.
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
    if s.current_id is null or s.current_id is distinct from p_base then return jsonb_build_object('status','stale'); end if;
    if p_kind='client' then
      select id into existing_id from client_strategy_versions where client_id=p_client and kind='client' and base_id=p_base limit 1;
      if existing_id is not null then return jsonb_build_object('status','existing','id',existing_id); end if;
    end if;
  end if;
  if s.lock_until > now() then return jsonb_build_object('status','busy'); end if;
  token := gen_random_uuid();
  update client_strategy_state set lock_token=token, lock_until=now()+interval '3 minutes' where client_id=p_client;
  return jsonb_build_object('status','claimed','token',token);
end $$;

create or replace function public.finish_client_strategy(p_client text,p_token uuid,p_entry jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare s client_strategy_state; new_id uuid;
begin
  select * into s from client_strategy_state where client_id=p_client for update;
  if not found or s.lock_token is distinct from p_token or s.lock_until <= now() then raise exception 'Generation expired; refresh before trying again'; end if;
  if p_entry->>'kind' <> 'initial' and s.current_id is distinct from (p_entry->>'base_id')::uuid then raise exception 'Current plan changed; refresh'; end if;
  insert into client_strategy_versions(client_id,submission_id,source_hash,source_snapshot,kind,base_id,content,citations,created_by)
  values(p_client,p_entry->>'submission_id',p_entry->>'source_hash',p_entry->'source_snapshot',p_entry->>'kind',(p_entry->>'base_id')::uuid,p_entry->>'content',p_entry->'citations',p_entry->>'created_by') returning id into new_id;
  update client_strategy_state set lock_token=null,lock_until=null where client_id=p_client;
  return new_id;
end $$;

create or replace function public.release_client_strategy(p_client text,p_token uuid)
returns void language sql security definer set search_path = public as $$
  update client_strategy_state set lock_token=null,lock_until=null where client_id=p_client and lock_token=p_token;
$$;

create or replace function public.approve_client_strategy(p_client text,p_version uuid,p_expected uuid,p_actor text)
returns void language plpgsql security definer set search_path = public as $$
declare s client_strategy_state; v client_strategy_versions;
begin
  select * into s from client_strategy_state where client_id=p_client for update;
  if not found then raise exception 'Strategy not found'; end if;
  if s.current_id is distinct from p_expected then raise exception 'Current plan changed; refresh before approving'; end if;
  if s.lock_until > now() then raise exception 'Wait for the strategy being generated'; end if;
  select * into v from client_strategy_versions where id=p_version and client_id=p_client and kind <> 'client';
  if not found then raise exception 'Strategy not found'; end if;
  if v.approved_at is not null then raise exception 'This version has already been approved'; end if;
  if v.base_id is distinct from s.current_id then raise exception 'Proposal is based on an older plan; propose a new update'; end if;
  update client_strategy_versions set approved_at=now(), approved_by=p_actor where id=p_version;
  update client_strategy_state set current_id=p_version where client_id=p_client;
end $$;
revoke all on function public.claim_client_strategy(text,text,uuid), public.finish_client_strategy(text,uuid,jsonb), public.release_client_strategy(text,uuid), public.approve_client_strategy(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_client_strategy(text,text,uuid), public.finish_client_strategy(text,uuid,jsonb), public.release_client_strategy(text,uuid), public.approve_client_strategy(text,uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
