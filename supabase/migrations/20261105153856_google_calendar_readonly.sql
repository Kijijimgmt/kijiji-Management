-- Calendar credentials, mappings and snapshots are server-only, never browser-readable.
create table public.google_calendar_connection (
 id text primary key check (id='kijiji'), account_email text,
 refresh_cipher text, status text not null default 'not_connected',
 message text not null default '', connected_at timestamptz,
 lock_token uuid, lock_until timestamptz, last_job_at timestamptz
);
insert into public.google_calendar_connection(id) values ('kijiji');
create table public.google_calendar_oauth_states (
 state_hash text primary key, browser_hash text not null, verifier_cipher text not null,
 actor_email text not null, expires_at timestamptz not null
);
create table public.google_calendar_links (
 id uuid primary key default gen_random_uuid(), calendar_id text not null unique,
 client_id text not null, calendar_name text not null, time_zone text not null,
 color text not null check(color ~ '^#[0-9a-fA-F]{6}$'),
 enabled boolean not null default true, status text not null default 'pending',
 message text not null default '', last_attempt_at timestamptz, last_success_at timestamptz,
 window_start timestamptz, window_end timestamptz,
 events jsonb not null default '[]'::jsonb check(jsonb_typeof(events)='array'),
 created_by text not null, created_at timestamptz not null default now()
);
create index google_calendar_links_client_idx on public.google_calendar_links(client_id);
alter table public.google_calendar_connection enable row level security;
alter table public.google_calendar_oauth_states enable row level security;
alter table public.google_calendar_links enable row level security;
revoke all on public.google_calendar_connection, public.google_calendar_oauth_states, public.google_calendar_links from public, anon, authenticated;
grant all on public.google_calendar_connection, public.google_calendar_oauth_states, public.google_calendar_links to service_role;

-- Serialize jobs/mapping edits/reconnects; an expired worker cannot publish a snapshot.
create function public.claim_google_calendar_job() returns uuid language plpgsql security invoker set search_path=public as $$
declare token uuid:=gen_random_uuid();
begin
 update google_calendar_connection set lock_token=token,lock_until=now()+interval '90 seconds',last_job_at=now()
 where id='kijiji' and (lock_until is null or lock_until<now());
 if not found then return null; end if;
 return token;
end $$;
create function public.finish_google_calendar_snapshot(p_token uuid,p_link uuid,p_events jsonb,p_start timestamptz,p_end timestamptz,p_zone text)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from google_calendar_connection where id='kijiji' and lock_token=p_token and lock_until>now() for update;
 if not found then return false; end if;
 update google_calendar_links set events=p_events,window_start=p_start,window_end=p_end,time_zone=p_zone,
 status='connected',message='',last_attempt_at=now(),last_success_at=now() where id=p_link and enabled;
 return found;
end $$;
create function public.release_google_calendar_job(p_token uuid) returns void language sql security invoker set search_path=public as $$
 update google_calendar_connection set lock_token=null,lock_until=null where id='kijiji' and lock_token=p_token;
$$;
revoke all on function public.claim_google_calendar_job(), public.finish_google_calendar_snapshot(uuid,uuid,jsonb,timestamptz,timestamptz,text), public.release_google_calendar_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_google_calendar_job(), public.finish_google_calendar_snapshot(uuid,uuid,jsonb,timestamptz,timestamptz,text), public.release_google_calendar_job(uuid) to service_role;
notify pgrst,'reload schema';
-- Failure reporting is lease-checked too, so late errors cannot clear a newer snapshot.
create function public.fail_google_calendar_snapshot(p_token uuid,p_link uuid,p_denied boolean,p_message text)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from google_calendar_connection where id='kijiji' and lock_token=p_token and lock_until>now() for update;
 if not found then return false; end if;
 update google_calendar_links set status=case when p_denied then 'access_lost' else 'error' end,
 message=p_message,events=case when p_denied then '[]'::jsonb else events end where id=p_link and enabled;
 return found;
end $$;
revoke all on function public.fail_google_calendar_snapshot(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.fail_google_calendar_snapshot(uuid,uuid,boolean,text) to service_role;
notify pgrst,'reload schema';
