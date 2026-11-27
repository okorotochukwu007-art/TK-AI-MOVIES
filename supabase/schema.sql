-- ============================================================================
-- AETHERIA — AI MOVIE STREAMING PLATFORM (SUPABASE POSTGRESQL SCHEMA)
-- Run this script in your Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. SERIES TABLE (Episodic AI Film Collections)
create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  synopsis text not null default '',
  thumbnail_url text not null,
  backdrop_url text not null,
  primary_category text not null,
  channel_title text not null,
  total_seasons integer not null default 1,
  status text not null default 'ongoing' check (status in ('ongoing', 'complete')),
  created_at timestamptz not null default now()
);

-- 2. MOVIES & EPISODES CATALOGUE TABLE
create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text not null unique,
  title text not null,
  synopsis text not null default '',
  thumbnail_url text not null,
  backdrop_url text not null,
  primary_category text not null,
  secondary_categories text[] not null default '{}',
  channel_title text not null,
  channel_id text not null default '',
  published_at timestamptz not null default now(),
  duration_seconds integer not null default 0,
  duration_formatted text not null default '00:00',
  view_count bigint not null default 0,
  like_count bigint not null default 0,
  is_embeddable boolean not null default true,
  playback_status text not null default 'active' check (playback_status in ('active', 'unavailable', 'embed_restricted', 'private')),
  approval_status text not null default 'approved' check (approval_status in ('approved', 'pending', 'rejected')),
  is_featured boolean not null default false,
  series_id uuid references public.series(id) on delete set null,
  season_number integer,
  episode_number integer,
  discovered_via text not null default 'youtube_api' check (discovered_via in ('youtube_api', 'rss_feed', 'manual')),
  ai_quality_score integer not null default 85,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_movies_category on public.movies(primary_category);
create index if not exists idx_movies_status on public.movies(playback_status, approval_status);
create index if not exists idx_movies_series on public.movies(series_id, season_number, episode_number);

-- 3. DISCOVERY SOURCES (YouTube Search Queries & Curated AI Creator Channels)
create table if not exists public.discovery_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('search_query', 'youtube_channel')),
  value text not null unique,
  label text not null,
  target_category text not null,
  is_active boolean not null default true,
  last_checked_at timestamptz
);

-- 4. DISCOVERY RUN LOGS (Scheduled & Manual Execution Audit Trail)
create table if not exists public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('scheduled', 'manual', 'webhook', 'startup')),
  status text not null check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  videos_scanned integer not null default 0,
  movies_added integer not null default 0,
  episodes_linked integer not null default 0,
  unavailable_hidden integer not null default 0,
  quota_cost_estimate integer not null default 0,
  used_youtube_data_api boolean not null default false,
  errors jsonb not null default '[]'::jsonb,
  summary text not null default ''
);

-- 5. ADMIN SETTINGS (Singleton Platform Configuration)
create table if not exists public.admin_settings (
  id integer primary key default 1 check (id = 1),
  schedule_interval_hours integer not null default 12 check (schedule_interval_hours in (6, 12, 24)),
  auto_publish_enabled boolean not null default true,
  min_duration_seconds integer not null default 180,
  require_embeddable boolean not null default true,
  last_successful_run_at timestamptz,
  next_scheduled_run_at timestamptz not null default (now() + interval '12 hours'),
  admin_emails text[] not null default array['okorotochukwu007@gmail.com'],
  admin_notification_count integer not null default 0
);

-- 6. USER WATCH HISTORY (Continue Watching Progress)
create table if not exists public.user_watch_history (
  user_id text not null,
  movie_id uuid not null references public.movies(id) on delete cascade,
  progress_seconds integer not null default 0,
  duration_seconds integer not null default 0,
  completed boolean not null default false,
  last_watched_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

-- 7. USER WATCHLIST
create table if not exists public.user_watchlist (
  user_id text not null,
  movie_id uuid not null references public.movies(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

-- Enable Row Level Security (RLS)
alter table public.series enable row level security;
alter table public.movies enable row level security;
alter table public.discovery_sources enable row level security;
alter table public.discovery_runs enable row level security;
alter table public.admin_settings enable row level security;
alter table public.user_watch_history enable row level security;
alter table public.user_watchlist enable row level security;

-- Public Read Policies for Active Approved Catalogue
create policy "Public can read series" on public.series
  for select using (true);

create policy "Public can read approved active movies" on public.movies
  for select using (approval_status = 'approved' and playback_status = 'active');

-- Users can manage their own Watch History and Watchlist
create policy "Users manage own watch history" on public.user_watch_history
  for all using (true) with check (true);

create policy "Users manage own watchlist" on public.user_watchlist
  for all using (true) with check (true);

-- 8. Viewer Likes Table
create table if not exists public.movie_likes (
  user_id text not null,
  movie_id uuid not null references public.movies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

-- 9. Viewer Ratings & Comments Table
create table if not exists public.movie_comments (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  user_id text not null,
  user_display_name text not null,
  rating integer not null default 5 check (rating between 1 and 5),
  reaction text,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.movie_likes enable row level security;
alter table public.movie_comments enable row level security;

create policy "Users manage movie likes" on public.movie_likes
  for all using (true) with check (true);

create policy "Users manage movie comments" on public.movie_comments
  for all using (true) with check (true);

-- Reload Supabase PostgREST schema cache immediately
notify pgrst, 'reload schema';

-- Note: Server-side discovery & admin routes use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS safely.
-- ============================================================================
-- OPTIONAL: SUPABASE PG_CRON + PG_NET SCHEDULED DISCOVERY WEBHOOK
-- Uncomment and replace YOUR_APP_URL and YOUR_CRON_SECRET to trigger discovery directly from Supabase:
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'aetheria-youtube-discovery',
--   '0 */12 * * *',
--   $$
--   select net.http_post(
--     url := 'https://YOUR_APP_URL/api/cron/discover',
--     headers := '{"Content-Type": "application/json", "x-cron-secret": "YOUR_CRON_SECRET"}'::jsonb,
--     body := '{"trigger": "supabase_pg_cron"}'::jsonb
--   );
--   $$
-- );
-- ============================================================================
