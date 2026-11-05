-- Explicit opt-in for adding events. Existing connections/mappings stay view-only.
alter table public.google_calendar_connection add column scopes text[] not null default '{}';
alter table public.google_calendar_links add column allow_create boolean not null default false;
create function public.cache_created_google_event(p_token uuid,p_link uuid,p_event jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from google_calendar_connection where id='kijiji' and lock_token=p_token and lock_until>now() for update;
 if not found then return false; end if;
 update google_calendar_links set events=(select coalesce(jsonb_agg(v),'[]'::jsonb) from jsonb_array_elements(events) v where v->>'id'<>p_event->>'id') || jsonb_build_array(p_event)
 where id=p_link and enabled and allow_create;
 return found;
end $$;
revoke all on function public.cache_created_google_event(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cache_created_google_event(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
