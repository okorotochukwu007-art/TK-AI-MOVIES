# AETHERIA — Netflix-Style AI Movie & Series Streaming Platform

AETHERIA is a premium, dark-cinema streaming platform dedicated to AI-generated movies, billionaire romances, CEO dramas, and episodic AI series. It combines an automated YouTube discovery and curation pipeline, a Supabase-backed relational catalogue, an authorized embedded video theatre with resume-playback tracking, and a comprehensive administrator control center.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Below is the summary of your confirmed architectural and product choices from Phase 1. Review the plan and click **Proceed** when you are ready to build.

- **Confirmed Decision 1 — Supabase Backend Architecture**: The platform will be powered by **Supabase (`@supabase/supabase-js` + PostgreSQL)** for the movie catalogue, episodic series hierarchy, discovery logs, admin settings, user authentication, watchlists, and watch history. To ensure the application runs immediately inside Google AI Studio even before you paste your `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into the Secrets panel, the backend includes a resilient **Supabase Repository Adapter** that automatically connects to your live Supabase PostgreSQL instance when credentials are present and mirrors state locally with a one-click SQL schema initializer in the Admin Dashboard.
- **Confirmed Decision 2 — Hybrid YouTube Discovery Engine**: Combines **YouTube Data API v3** (`search.list`, `videos.list`, `playlistItems.list`) with **zero-quota YouTube Channel Atom/RSS feeds** and **oEmbed verification**, paired with server-side **Gemini (`gemini-3.8-flash`)** to classify stories into your 12 categories and link multi-part uploads into Seasons and Episodes.
- **Confirmed Decision 3 — Auto-Publish with Admin Override Queue**: Newly discovered AI movies that pass all eligibility checks (public status, authorized embedding, minimum runtime, and AI narrative relevance) are automatically published to the catalogue, while borderline or flagged items enter the Admin Approval Queue for manual review.
- **Confirmed Decision 4 — Visual Identity ("AETHERIA")**: Deep Obsidian (`#050505`) and Midnight Charcoal (`#0E1015`) surfaces paired with Crimson (`#E11D48`) and Warm Gold (`#F59E0B`) focal accents, crisp geometric display typography (`Outfit`), legible body copy (`Plus Jakarta Sans`), and tabular monospace numerals (`JetBrains Mono`).

---

## 1. Overview & Core Concept

- **What It Does**: Automatically discovers, verifies, categorizes, and streams full-length AI-generated films and multi-episode series from YouTube inside a cohesive cinema interface.
- **Target Audience / Persona**: Viewers seeking serialized AI storytelling—billionaire romance, contract marriage dramas, werewolf and fantasy sagas, and AI animated features—without sifting through random short clips on general video platforms; and platform administrators curating a self-updating streaming catalogue.
- **Key Value**: Transforms scattered AI creator uploads into an organized, episodic streaming experience with persistent watch progress, automatic dead-video pruning, copyright-compliant authorized embeds, and quota-efficient scheduled updates.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Cinema Discovery & Browsing**:
   - Users land on a full-bleed Featured AI Movie Hero Banner displaying the title, synopsis, unboxed metadata (`Billionaire Romance · 2026 · 48m · Channel Credits`), and primary actions (`Watch Now`, `Add to Watchlist`, `More Info`).
   - Below the fold, users browse curated horizontal rails: *Continue Watching* (with exact timestamp progress bars), *Trending AI Movies*, *Recently Added* (updated by the discovery scheduler), *Popular Billionaire Romance*, *Newly Released Episodes*, and a dedicated *Category Filter Bar* covering all 12 genres.
2. **Movie & Series Details + Authorized Theatre Player**:
   - Clicking any poster opens the **Movie & Series Details Modal / View** showing full synopsis, creator attribution with channel link, release date, video duration, and—for episodic content—a **Season & Episode Selector**.
   - Clicking **Play** launches the integrated **Authorized YouTube IFrame Player**. The player records playback position every 5 seconds so users can resume where they stopped, automatically advances to the next episode when a series episode finishes, and listens for YouTube embed error codes (`100`, `101`, `150`) to immediately flag unplayable or embed-restricted videos.
3. **Personal Watchlist & Continue Watching**:
   - Users can sign in via Supabase Auth (or guest session synced to Supabase upon login) to save titles to **My Watchlist** and maintain their **Continue Watching** history across sessions.
4. **Admin Dashboard & Discovery Control Center**:
   - Administrators switch into the **Admin Workspace** to monitor the last successful discovery run, view the next scheduled run countdown, inspect API quota/error logs, adjust scheduler frequency (`Every 6 hours`, `Every 12 hours`, `Every 24 hours`), toggle automatic publishing, approve or reject discovered movies, manually import any YouTube movie/playlist URL, edit metadata, organize episodes into seasons, and manage source channels/search queries.

### Visual Identity & Theme

- **Aesthetic Direction**: High-craft dark cinema showreel and editorial streaming theatre paired with a high-density, single-elevation SaaS operator console for the Admin Dashboard.
- **Color Palette & 60-30-10 Distribution**:
  - **60% Dominant Neutral Canvas**: Deep Obsidian (`#050505`) primary viewport background and Midnight Slate (`#0B0D12`) section fields.
  - **30% Structural Surfaces & Framing**: Charcoal surface cards (`#12151E`), subtle `1px solid rgba(255, 255, 255, 0.08)` hairline borders, measured bottom-up media scrims (`from-[#050505] via-[#050505]/70 to-transparent`), and muted silver metadata (`#94A3B8`).
  - **10% Focal Accent Budget**: Cinema Crimson (`#E11D48`) for primary playback CTAs and active states; Warm Amber Gold (`#F59E0B`) for series episode markers and admin warning states; Emerald (`#10B981`) strictly for verified semantic states in the Admin Console.
- **Typography & Hierarchy (2+1 Font Rule)**:
  - **Display / Hero / Titles**: `Outfit` (600 SemiBold / 700 Bold, tight tracking, `text-wrap: balance` to prevent orphan words).
  - **UI & Editorial Synopsis Prose**: `Plus Jakarta Sans` (400 Regular / 500 Medium, 15px–16px body measure 65ch).
  - **Timestamps, Durations & Admin Metrics**: `JetBrains Mono` with `font-variant-numeric: tabular-nums` for video runtimes (`42:18`), episode codes (`S01 · E04`), and scheduler logs.
- **Component Styling & Anti-Slop Discipline**:
  - **Top Bar Contract**: Strict 3-zone header separated by `gap-8`: Zone 1 single-line wordmark (`AETHERIA`), Zone 2 five single-line navigation links (`Home`, `Series`, `Categories`, `My Watchlist`, `Admin Console`), and Zone 3 primary account/search action.
  - **Zero-Pill Metadata**: All movie metadata (`CEO Love Stories · 1h 12m · 2026`) is rendered as clean unboxed text with `·` separators—never cluttered pill badge sandwiches.
  - **Single-Elevation Depth**: Poster cards use clean 16:9 and 2:3 aspect ratios with subtle hairline borders and smooth `cubic-bezier(0.16, 1, 0.3, 1)` hover scale (`150ms`), with resilient CSS/SVG fallback artwork if an external thumbnail fails to load.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Supabase Backend with Dual-Layer Persistence & SQL Schema Generator**
  - *Chosen Approach*: Use `@supabase/supabase-js` on the Express backend (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and frontend (`SUPABASE_ANON_KEY`) as the primary relational store, backed by a synchronized local JSON/memory persistence fallback and an in-app **Supabase SQL Schema & Connection Inspector**.
  - *Why*: Respects your preference for Supabase while guaranteeing the app works out-of-the-box on first boot in Google AI Studio. As soon as you add your Supabase project URL and keys in the AI Studio Secrets panel and run the provided SQL migration in your Supabase SQL Editor, all reads and writes flow directly through your Supabase PostgreSQL tables.
  - *Alternatives Considered*: Requiring external Supabase keys before rendering any UI (rejected because it causes a blank/broken screen prior to secret configuration).
- **Decision 2: Quota-Aware Hybrid YouTube Discovery Pipeline**
  - *Chosen Approach*: Combine 0-unit YouTube Channel Atom/RSS feeds (`youtube.com/feeds/videos.xml?channel_id=...`) + 1-unit batched `videos.list` lookups (up to 50 video IDs per call) + rotated 100-unit `search.list` genre queries, enriched by server-side Gemini (`gemini-3.8-flash`) structured JSON classification.
  - *Why*: Standard `search.list` calls cost 100 units each against YouTube's 10,000-unit daily quota. By monitoring AI movie channels via RSS/playlist uploads and batching `videos.list` calls in groups of 50, the platform can check hundreds of videos per day using less than 5% of the free quota—and can even discover real YouTube AI movies before a `YOUTUBE_API_KEY` is configured.
- **Decision 3: Multi-Trigger Scheduled Discovery System**
  - *Chosen Approach*: Implement (1) an in-process background timer respecting the admin interval (`6h`, `12h`, `24h`), (2) a stale-if-due check on server requests so container scale-to-zero never skips a due window, and (3) an authenticated webhook endpoint (`POST /api/cron/discover`) compatible with Supabase `pg_cron` (`pg_net`) or Google Cloud Scheduler.
  - *Why*: Provides honest, verifiable scheduled execution with real database run logs (`started_at`, `completed_at`, `videos_discovered`, `videos_added`, `videos_flagged`, `error_details`).

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        AETHERIA STREAMING FRONTEND (React 19)                │
│                                                                              │
│  ┌────────────────────┐  ┌─────────────────────────┐  ┌───────────────────┐  │
│  │  Top Navigation    │  │  Streaming Theatre UI   │  │   Admin Console   │  │
│  │  (3-Zone Contract) │  │  • Hero Feature Banner  │  │  • Approval Queue │  │
│  │  • Brand Wordmark  │  │  • 12 Genre Rails       │  │  • Manual Import  │  │
│  │  • 5 Nav Links     │  │  • Continue Watching    │  │  • Series Builder │  │
│  │  • Search & Auth   │  │  • My Watchlist         │  │  • Sources & Cron │  │
│  └─────────┬──────────┘  └────────────┬────────────┘  └─────────┬─────────┘  │
│            │                          │                         │            │
│            ▼                          ▼                         ▼            │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │        Authorized YouTube IFrame Player & Movie Details Modal          │  │
│  │  • Real-Time Timestamp Sync  • Season/Episode Picker  • Embed Guard    │  │
│  └────────────────────────────────────┬───────────────────────────────────┘  │
└───────────────────────────────────────┼──────────────────────────────────────┘
                                        │ REST API (/api/*)
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     EXPRESS BACKEND GATEWAY & SCHEDULER                      │
│                                                                              │
│  ┌──────────────────────────┐  ┌───────────────────────┐  ┌───────────────┐  │
│  │   Discovery & Health     │  │   Gemini AI Curator   │  │ Cron Engine & │  │
│  │   • YouTube Data API v3  │  │   (gemini-3.8-flash)  │  │ /api/cron/*   │  │
│  │   • Channel RSS & oEmbed │  │   • 12-Genre Tagging  │  │ • 6h/12h/24h  │  │
│  │   • Embed & Status Check │  │   • Episode Grouping  │  │ • Health Sync │  │
│  └────────────┬─────────────┘  └───────────┬───────────┘  └───────┬───────┘  │
│               └────────────────────────────┼──────────────────────┘          │
│                                            ▼                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │              SUPABASE POSTGRESQL REPOSITORY & AUTH LAYER               │  │
│  │   Tables: movies | series | episodes | discovery_sources |             │  │
│  │           discovery_runs | admin_settings | watch_history | watchlist  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Supabase Relational Entities

1. **`movies` (Catalogue Items)**:
   - `id` (UUID), `youtube_video_id` (unique text), `title`, `synopsis`, `thumbnail_url`, `backdrop_url`, `primary_category` (one of the 12 core genres), `secondary_categories` (text array), `channel_title`, `channel_id`, `published_at`, `duration_seconds`, `duration_formatted`, `view_count`, `like_count`, `is_embeddable` (boolean), `playback_status` (`active` | `unavailable` | `embed_restricted` | `private`), `approval_status` (`approved` | `pending` | `rejected`), `is_featured` (boolean), `series_id` (nullable UUID), `season_number` (int), `episode_number` (int), `discovered_via` (`youtube_api` | `rss_feed` | `manual`), `created_at`, `updated_at`.
2. **`series` (Episodic AI Film Collections)**:
   - `id` (UUID), `title`, `synopsis`, `thumbnail_url`, `primary_category`, `channel_title`, `total_seasons`, `total_episodes`, `status` (`ongoing` | `complete`), `created_at`.
3. **`discovery_sources` (Curated Channels & Search Queries)**:
   - `id` (UUID), `source_type` (`search_query` | `youtube_channel`), `value` (query string or channel ID), `target_category`, `is_active` (boolean), `last_checked_at`.
4. **`discovery_runs` (Audit & Error Logs)**:
   - `id` (UUID), `trigger_type` (`scheduled` | `manual` | `webhook`), `status` (`running` | `completed` | `failed`), `started_at`, `completed_at`, `videos_scanned`, `movies_added`, `episodes_linked`, `unavailable_hidden`, `quota_cost_estimate`, `error_log` (JSONB array of failed queries or API errors).
5. **`admin_settings` (Singleton Platform Configuration)**:
   - `id`, `schedule_interval_hours` (`6` | `12` | `24`), `auto_publish_enabled` (boolean), `min_duration_seconds` (default `240`), `require_embeddable` (boolean), `last_successful_run_at`, `next_scheduled_run_at`, `admin_emails` (includes `okorotochukwu007@gmail.com`).
6. **`user_watchlist` & `user_watch_history`**:
   - Tracks `user_id`, `movie_id`, `progress_seconds`, `duration_seconds`, `completed` (boolean), and `last_watched_at`.

### Interactive Component & State Mapping

- **Homepage & Category Filtering**:
  - Clicking any of the 12 categories (*Billionaire Romance*, *CEO Love Stories*, *Contract Marriage*, *Secret Marriage*, *Revenge Romance*, *Emotional Love Stories*, *Fantasy Romance*, *Werewolf Romance*, *AI Animated Movies*, *Trending AI Movies*, *Newly Released Movies*, *Complete AI Movie Series*) filters the main catalogue grid and updates the featured spotlight.
  - Real-time search bar filters across titles, synopses, creators, and genres with instant debounced results.
- **Authorized Video Player & Copyright Compliance**:
  - Uses the official YouTube IFrame API (`enablejsapi=1`, `origin` set to app URL).
  - Periodically dispatches `POST /api/history/progress` with `{ movieId, progressSeconds, durationSeconds }` to update the *Continue Watching* rail.
  - If the YouTube player emits error `101` or `150` (creator disabled embedding) or `100` (video removed/private), the player immediately calls `POST /api/movies/:id/report-playback-error`, updates the movie's status in Supabase, and displays a clean compliance notice with an authorized link to watch directly on the creator's YouTube channel.
- **Admin Dashboard Workflows**:
  - **Manual YouTube Import**: Paste any YouTube URL or Video ID -> calls `POST /api/admin/youtube-lookup` (fetches real title, channel, thumbnail, duration, and embed status via YouTube Data API v3 or oEmbed fallback + Gemini category suggestion) -> Admin edits fields or assigns to a Series/Season/Episode -> saves to Supabase.
  - **Discovery Run & Health Check Trigger**: Clicking *"Run Discovery Now"* or *"Verify Catalogue Health"* triggers `POST /api/admin/discover/run` or `POST /api/admin/catalogue/verify`, streaming live progress and recording a new row in `discovery_runs`.
  - **Approval Queue & Series Organizer**: One-click `Approve`, `Reject`, `Feature on Hero`, or `Assign to Series (Season X, Episode Y)` with instant optimistic UI updates.
