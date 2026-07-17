-- Kijiji Management Group lead capture table.
-- Run this in the Supabase SQL editor once the project is created.
-- Keep the service_role key out of frontend code. The website should only use
-- the public anon/publishable key with this insert-only RLS policy.

create extension if not exists pgcrypto;

create table if not exists public.strategy_session_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  full_name text not null,
  email text not null,
  phone text,
  social_handle text,
  client_type text,
  current_stage text,
  services_needed text[] not null default '{}',
  biggest_bottleneck text,
  preferred_contact text,
  budget_readiness text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  page_url text,
  user_agent text,
  referrer text
);

alter table public.strategy_session_leads enable row level security;

drop policy if exists "Public can submit strategy session leads" on public.strategy_session_leads;
create policy "Public can submit strategy session leads"
on public.strategy_session_leads
for insert
to anon
with check (
  full_name is not null
  and email is not null
  and position('@' in email) > 1
);

-- If your Data API settings require explicit grants for SQL-created tables,
-- run these after creating the table:
grant insert on public.strategy_session_leads to anon;
grant all on public.strategy_session_leads to service_role;
