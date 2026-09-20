-- ============================================================
-- INTEL CRM — Database schema (Supabase / Postgres)
-- Run this in the Supabase SQL editor on a fresh project.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm; -- for fuzzy dedupe matching

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
create type category_type as enum ('SME', 'Corporate', 'Education', 'Close Network', 'Business Partners');
create type discovery_status as enum ('NEW', 'REVIEW', 'QUALIFIED', 'REJECTED', 'PROMOTED', 'DUPLICATE');
create type sales_stage as enum ('New', 'Contacted', 'Qualifying', 'Meeting Booked', 'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'Not Qualified');
create type followup_type as enum ('Call', 'Email', 'Meeting', 'Demo', 'Proposal', 'Contract', 'Other');
create type followup_outcome as enum ('No answer', 'Spoke', 'Interested', 'Not interested', 'Callback requested', 'Meeting booked', 'Proposal requested', 'Won', 'Lost', 'Not qualified');
create type confidence_level as enum ('LOW', 'MEDIUM', 'HIGH');
create type verification_status as enum ('VERIFIED', 'INFERRED', 'UNKNOWN');

-- ------------------------------------------------------------
-- CORE CRM: PROSPECTS (promoted, active sales targets)
-- ------------------------------------------------------------
create table prospects (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  trading_name text,
  category category_type not null,
  industry text,
  region text,
  address text,
  website text,
  telephone text,
  general_email text,
  decision_maker_name text,
  decision_maker_title text,
  decision_maker_email text,
  decision_maker_phone text,
  source text, -- 'AI Agent' | 'CSV Import' | 'Manual'
  lead_reason text,
  current_supplier text,
  current_equipment text,
  contract_lease_info text,
  contract_renewal_date date,
  last_contact_date date,
  next_followup_date date,
  next_followup_type followup_type,
  sales_stage sales_stage not null default 'New',
  notes text,
  estimated_opportunity numeric,
  probability integer check (probability between 0 and 100),
  manually_prioritised boolean not null default false,
  discovery_id uuid references discoveries(id), -- nullable, set below via alter (circular fk fix)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- INBOX: DISCOVERIES (AI-found, not yet promoted)
-- ------------------------------------------------------------
create table discoveries (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  industry text,
  category category_type not null,
  region text,
  website text,
  address text,
  company_size_estimate text,
  decision_maker_name text,
  decision_maker_title text,
  decision_maker_contact text,
  decision_maker_verification verification_status default 'UNKNOWN',
  lead_reason text,
  trigger_signal text, -- e.g. "New branch announced" or "No verified trigger identified."
  verified_fields jsonb not null default '{}'::jsonb, -- {companyVerified, locationVerified, industryVerified, decisionMakerVerified, triggerVerified, contactVerified}
  research_completeness confidence_level default 'LOW',
  sales_relevance confidence_level default 'LOW',
  verified_facts text[] default '{}',
  inferences text[] default '{}',
  sources jsonb not null default '[]'::jsonb, -- [{url, title, dateAccessed, extractedEvidence}]
  ai_notes text,
  status discovery_status not null default 'NEW',
  agent_run_id uuid references agent_runs(id),
  date_discovered timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- fix the forward-reference from prospects -> discoveries
alter table prospects
  add constraint prospects_discovery_fk foreign key (discovery_id) references discoveries(id);

-- ------------------------------------------------------------
-- AGENT RUNS (research pipeline audit log / cost tracking)
-- ------------------------------------------------------------
create table agent_runs (
  id uuid primary key default uuid_generate_v4(),
  target_category category_type,
  target_region text,
  target_industry text,
  target_company_size text,
  requested_lead_count integer,
  status text not null default 'running', -- running | completed | failed
  searches_performed integer default 0,
  candidates_found integer default 0,
  candidates_deep_researched integer default 0,
  leads_qualified integer default 0,
  estimated_tokens_used integer,
  log jsonb not null default '[]'::jsonb, -- [{ts, message}]
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ------------------------------------------------------------
-- RESEARCH MEMORY (avoid re-researching known companies)
-- ------------------------------------------------------------
create table company_research_memory (
  id uuid primary key default uuid_generate_v4(),
  company_name_normalized text not null unique,
  website text,
  last_researched_at timestamptz not null default now(),
  research_version integer not null default 1,
  sources jsonb default '[]'::jsonb,
  findings jsonb default '{}'::jsonb
);

-- ------------------------------------------------------------
-- ACTIVITY TIMELINE (shared by prospects and discoveries)
-- ------------------------------------------------------------
create table activities (
  id uuid primary key default uuid_generate_v4(),
  prospect_id uuid references prospects(id) on delete cascade,
  discovery_id uuid references discoveries(id) on delete cascade,
  activity_type text not null, -- 'discovery_created' | 'research_completed' | 'call' | 'email' | 'meeting' | 'note' | 'stage_change' | 'promoted' | 'rejected'
  followup_type followup_type,
  outcome followup_outcome,
  notes text,
  created_at timestamptz not null default now(),
  constraint activity_has_owner check (prospect_id is not null or discovery_id is not null)
);

-- ------------------------------------------------------------
-- INDEXES for dedupe + search + queue performance
-- ------------------------------------------------------------
create index idx_prospects_company_trgm on prospects using gin (company_name gin_trgm_ops);
create index idx_prospects_website on prospects (lower(website));
create index idx_prospects_phone on prospects (telephone);
create index idx_prospects_followup on prospects (next_followup_date);
create index idx_prospects_region on prospects (region);
create index idx_prospects_category on prospects (category);

create index idx_discoveries_company_trgm on discoveries using gin (company_name gin_trgm_ops);
create index idx_discoveries_status on discoveries (status);
create index idx_discoveries_region on discoveries (region);

create index idx_activities_prospect on activities (prospect_id);
create index idx_activities_discovery on activities (discovery_id);

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_prospects_updated before update on prospects
  for each row execute procedure set_updated_at();
create trigger trg_discoveries_updated before update on discoveries
  for each row execute procedure set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security — locked down; only the service role
-- (used exclusively by server-side API routes) can read/write.
-- The anon key gets no direct table access.
-- ------------------------------------------------------------
alter table prospects enable row level security;
alter table discoveries enable row level security;
alter table agent_runs enable row level security;
alter table company_research_memory enable row level security;
alter table activities enable row level security;
-- No policies created for the anon/authenticated roles on purpose:
-- with RLS on and zero policies, PostgREST (anon key) is denied by
-- default. All access goes through server routes using the service
-- role key, which bypasses RLS.
