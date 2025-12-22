-- Minimal ToS acceptance tracking table for Supabase
-- Adjust schema/roles/policies to your security model.

create table if not exists public.legal_acceptances (
  id bigserial primary key,
  user_id uuid not null,
  document text not null check (document in ('tos', 'privacy', 'cookies')),
  version text not null,
  accepted_at timestamptz not null default now()
);

create index if not exists legal_acceptances_user_doc_idx
  on public.legal_acceptances (user_id, document, version);

-- Example Row-Level Security policies (enable RLS if used)
-- alter table public.legal_acceptances enable row level security;
-- grant usage on schema public to authenticated;
-- grant select, insert on public.legal_acceptances to authenticated;
-- create policy "Users can view their own acceptances" on public.legal_acceptances
--   for select using (auth.uid() = user_id);
-- create policy "Users can insert their own acceptances" on public.legal_acceptances
--   for insert with check (auth.uid() = user_id);
