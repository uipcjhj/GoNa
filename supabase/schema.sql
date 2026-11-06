-- Global Opportunity Radar — Supabase (PostgreSQL) schema
-- Supabase Dashboard > SQL Editor 에 붙여넣고 RUN 하세요.
-- 각 테이블은 문서형(jsonb) 구조이며, sort_at 컬럼으로 기간 조회/정렬을 수행합니다.

create table if not exists public.articles (
  id text primary key,
  data jsonb not null,
  sort_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists articles_sort_at_idx on public.articles (sort_at desc);
create index if not exists articles_status_idx on public.articles ((data->>'status'));
create index if not exists articles_opportunity_idx on public.articles ((data->>'opportunityId'));

create table if not exists public.opportunities (
  id text primary key,
  data jsonb not null,
  sort_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists opportunities_sort_at_idx on public.opportunities (sort_at desc);

create table if not exists public.jobs (
  id text primary key,
  data jsonb not null,
  sort_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_sort_at_idx on public.jobs (sort_at desc);

create table if not exists public.settings (
  id text primary key,
  data jsonb not null,
  sort_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 보안: Row Level Security 활성화. 서버(service_role 키)만 접근하며
-- 브라우저(anon 키)에서는 어떤 행도 읽거나 쓸 수 없습니다.
alter table public.articles enable row level security;
alter table public.opportunities enable row level security;
alter table public.jobs enable row level security;
alter table public.settings enable row level security;

-- 주간 업계동향 보고서 선정 상태 (주간별 1행)
create table if not exists public.reports (
  id text primary key,
  data jsonb not null,
  sort_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reports_sort_at_idx on public.reports (sort_at desc);
alter table public.reports enable row level security;
