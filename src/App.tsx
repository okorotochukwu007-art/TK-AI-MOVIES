/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import {
  Bell,
  Bookmark,
  Check,
  ChevronRight,
  Clock,
  Download,
  Film,
  FolderOpen,
  HardDrive,
  Heart,
  Info,
  Layers,
  Lock,
  Play,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  User,
  WifiOff,
  X,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { CinemaPosterImage } from './components/CinemaPosterImage.tsx';
import { CinemaSmartSearch } from './components/CinemaSmartSearch.tsx';
import {
  computeTitleSimilarity,
  detectMovieCategoryIntent,
  findTypoCorrection,
  isTokenMatch,
  normalizeSearchText,
  rankInAppMoviesForQuery,
} from './utils/smartMovieSearch.ts';
import {
  buildCategorySeoPayload,
  buildMoviePath,
  buildMovieSeoPayload,
  cleanPublicCategoryLabel,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_SITE_ORIGIN,
  DEFAULT_TITLE,
  extractMovieIdentifierFromUrl,
  findMovieByIdentifier,
  findSeoCategoryPageByPath,
  findSeoCategoryPageByView,
  SEO_CATEGORY_PAGES,
  SITE_NAME,
} from './server/seoMetadata.ts';
import {
  DeviceDownloadedMovieItem,
  DownloadMovieModal,
  getDeviceDownloadedMovies,
  removeMovieFromDeviceVault,
} from './components/DownloadMovieModal.tsx';
import {
  getNewReleaseMovies,
  NotificationsPopover,
} from './components/NotificationsPopover.tsx';
import {
  LuxurySplashScreen,
  OfflineIndicator,
  PWAInstallBanner,
  PWAInstallModal,
} from './components/PWAInstallModal.tsx';
import { OfflineCinemaPlayerModal } from './components/OfflineCinemaPlayerModal.tsx';
import { ShareMovieModal } from './components/ShareMovieModal.tsx';
import { SeriesDetailModal } from './components/SeriesDetailModal.tsx';
import { SupabaseAuthModal } from './components/SupabaseAuthModal.tsx';
import { YouTubeTheatreModal } from './components/YouTubeTheatreModal.tsx';
import { JustDropped2026Hub } from './components/JustDropped2026Hub.tsx';
import { usePWAInstall } from './hooks/usePWAInstall.ts';
import { resolveMovieSource } from './utils/videoSource.ts';
import {
  LocalWatchEntry,
  clearLocalWatchEntries,
  formatRemainingTimeLabel,
  loadLocalWatchEntries,
  mergeWatchHistoryWithServer,
  removeLocalWatchEntry,
  saveLocalWatchEntries,
  upsertLocalWatchEntry,
} from './utils/watchHistoryStorage.ts';
import {
  INITIAL_MOVIES,
  INITIAL_SERIES,
  INITIAL_SETTINGS,
} from './server/seedCatalogue.ts';
import {
  AdminSettings,
  MOVIE_CATEGORIES,
  MovieCategory,
  MovieEngagementSummary,
  MovieItem,
  MovieSeries,
  SeriesGenreBucket,
  SupabaseConnectionDiagnostics,
  VideoSourcePlatform,
  WatchlistItem,
  WatchProgressItem,
} from './types/cinema.ts';

type NavView =
  | 'home'
  | 'nigerian'
  | 'series'
  | 'categories'
  | 'saved'
  | 'watchlist'
  | 'admin';
type SortOption = 'popularity' | 'most_loved' | 'release_date' | 'recently_added';
type CategoryDisplayMode = 'grouped' | 'grid';
type NigerianSubGenre =
  | 'all'
  | 'lagos_billionaire'
  | 'royal_folktale'
  | 'maid_prince'
  | 'emotional_marriage';

const CORE_STORY_GENRES: MovieCategory[] = [
  'New Movies',
  '2026 Series Movies',
  'Action Movies',
  'Contract Marriage',
  'Secret Marriage',
  'Billionaire Romance',
  'CEO Love Stories',
  'Revenge Romance',
  'Emotional Love Stories',
  'Fantasy Romance',
  'Werewolf Romance',
  'AI Animated Movies',
  'Complete AI Movie Series',
];

const HOME_EXCLUDED_AI_CATEGORIES = new Set<string>([
  'AI Animated Movies',
  'Complete AI Movie Series',
  'Trending AI Movies',
  'Werewolf Romance',
  'Contract Marriage',
  'Secret Marriage',
  'Billionaire Romance',
  'CEO Love Stories',
  'Revenge Romance',
  'Emotional Love Stories',
  'Fantasy Romance',
]);

const HOME_AI_CONTENT_REGEX =
  /\b(ai|ai-generated|ai generated|ai movie|ai film|ai love|ai drama|ai series|ai animated|animated film|animation|cartoon|folktale|tales by|story hub|short drama|full short drama|vertical drama|bl full drama|bl drama|werewolf|lycan|alpha king|fated mate|blood moon|luna|contract marriage|contract wife|marriage of convenience|arranged marriage|secret billionaire|disguised billionaire|billionaire ceo|billionaire boss|billionaire family|billionaire heiress|billionaire ex|billionaire prince|billionaire's|billionaire’s|a billionaire|saved a billionaire|poor maid|poor cook|poor girl|poor waitress|poor farmer|village girl|ceo husband|mafia don|mafia billionaire|falling for my boss|dragon king|dragon general|gameclips|warcraft|kuku tv|hindi explanation|hindi dubbed|shortdramabuzz|everafter drama|dramamuse|drama encore|binge tales|drama awan|dreamframe|cinema stories by tee|pyar drama|ccap hindi|explain with me|cjm drama|flareflow|noradrama|sweetstar|zephyr drama|peachshine|empress shorts|many drama|revenge wife drama|drama donald|smith drama|nov drama|hvn drama|whisperwonderworks|greyhaven tales|vesper court|thistlewood drama|neanderthal stories|in bilmi|prime movie studio|nanny|pregnant|mistress|divorce|remarried|dumped|stepmother|orphan|heiress|spoiling her|begs to win|marries the billionaire|married a stranger|married the wrong|lovey-dovey)\b/i;

const HOME_NON_LATIN_SPAM_REGEX =
  /[\u0900-\u097F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/;

function isHome2026RealMovie(m: MovieItem): boolean {
  if (HOME_EXCLUDED_AI_CATEGORIES.has(m.primaryCategory)) return false;
  if (
    Array.isArray(m.secondaryCategories) &&
    m.secondaryCategories.some(
      (c) =>
        c === 'AI Animated Movies' ||
        c === 'Complete AI Movie Series' ||
        c === 'Trending AI Movies'
    )
  ) {
    return false;
  }
  if (m.seriesId !== null || m.episodeNumber !== null) return false;

  const combinedText = `${m.title || ''} ${m.channelTitle || ''} ${
    m.synopsis || ''
  } ${m.hookTag || ''}`;
  if (HOME_AI_CONTENT_REGEX.test(combinedText)) return false;
  if (HOME_NON_LATIN_SPAM_REGEX.test(m.title || '')) return false;

  const is2026 =
    (m.releaseDate || '').startsWith('2026') ||
    (m.publishedAt || '').startsWith('2026') ||
    /\b2026\b/.test(`${m.title || ''} ${m.hookTag || ''}`);
  if (!is2026) return false;

  // Exclude movies explicitly stamped with an older pre-2026 year unless 2026 is also present
  const hasExplicitOldYear = /\b(19\d{2}|201\d|202[0-5])\b/.test(
    `${m.title || ''} ${m.releaseDate || ''}`
  );
  const hasExplicit2026InTitleOrDate =
    (m.releaseDate || '').startsWith('2026') ||
    /\b2026\b/.test(`${m.title || ''} ${m.hookTag || ''}`);
  if (hasExplicitOldYear && !hasExplicit2026InTitleOrDate) return false;

  return true;
}

const GENRE_METADATA: Record<
  MovieCategory,
  { kicker: string; description: string }
> = {
  'New Movies': {
    kicker: '300+ 2026 American Blockbusters · Top Hollywood Actors · Record Impressions',
    description:
      '300+ newly released 2026 American full-length movies starring popular Hollywood actors with massive viewer impressions, record-breaking engagement, and non-stop cinema thrills.',
  },
  '2026 Series Movies': {
    kicker: '2026 Multi-Episode Series · Nollywood, K-Drama, Crime, Action & Sci-Fi',
    description:
      'Binge-ready 2026 limited series and multi-part movie sagas grouped cleanly by season and episode with seamless next-episode autoplay.',
  },
  'Action Movies': {
    kicker: 'High-Octane Combat · Sci-Fi Thrillers · Tactical Showdowns',
    description:
      'Complete-screen 16:9 widescreen action movies featuring high-stakes heists, cybernetic warfare, martial arts combat, and special-forces operations.',
  },
  'Contract Marriage': {
    kicker: 'Arranged Vows · Paper Brides · Fake Love Turned Real',
    description:
      'High-stakes marriage contracts, mistaken brides, and convenience vows that ignite into undeniable devotion.',
  },
  'Secret Marriage': {
    kicker: 'Hidden Identities · Undercover Husbands · Secret Heirs',
    description:
      'Flash marriages to disguised billionaires, hidden fathers, and love stories where true power is revealed when least expected.',
  },
  'Billionaire Romance': {
    kicker: 'Luxury Dynasties · Sovereign Tycoons · Royal Heirs',
    description:
      'Opulent Nigerian and international billionaire love stories spanning Lagos penthouses, private estates, and royal courts.',
  },
  'CEO Love Stories': {
    kicker: 'Boardroom Tension · Executive Devotion · Office Sparks',
    description:
      'Commanding CEOs, brilliant underdogs, and corporate power struggles transformed by unexpected romance.',
  },
  'Revenge Romance': {
    kicker: 'Betrayal & Rebirth · Second Chances · Karmic Reckoning',
    description:
      'Shattered vows, past-life rebirths, and triumphant comebacks where betrayed hearts claim their power and true love.',
  },
  'Emotional Love Stories': {
    kicker: 'Heartbreak & Healing · Maid & Orphan Journeys · Deep Devotion',
    description:
      'Soul-stirring romantic dramas of sacrifice, family trials, pre-wedding tears, and unconditional love.',
  },
  'Fantasy Romance': {
    kicker: 'Enchanted Kingdoms · Ancient Spirits · Mythic Destiny',
    description:
      'Otherworldly realms, royal folktales, dragon keepers, and sacred promises across time.',
  },
  'Werewolf Romance': {
    kicker: 'Fated Mates · Alpha Royals · Moonlit Packs',
    description:
      'Supernatural alpha heirs, exiled mates, and forbidden loyalty beneath the blood moon.',
  },
  'AI Animated Movies': {
    kicker: 'Stylized 3D Cinema · Visual Poetry · Animated Features',
    description:
      'Breathtaking full-length animated feature films crafted with rich visual artistry.',
  },
  'Trending AI Movies': {
    kicker: 'Most Watched 2026 Blockbusters Across TK STORYWORLD',
    description:
      'Top-performing 2026 full-length movies ranked by global viewer watch counts and recent impressions.',
  },
  'Newly Released Movies': {
    kicker: 'Fresh 2026 Premieres & Latest Blockbusters',
    description:
      'The newest 2026 full-length movies and high-impression features added to the streaming catalogue.',
  },
  'Complete AI Movie Series': {
    kicker: 'Multi-Episode Sagas · Season & Episode Continuity',
    description:
      'Serialized blockbuster dramas organized sequentially by season and episode.',
  },
};

export default function App() {
  const [activeView, setActiveView] = useState<NavView>(() => {
    if (typeof window !== 'undefined') {
      const catPage = findSeoCategoryPageByPath(window.location.pathname);
      if (catPage) return catPage.view;
    }
    return 'home';
  });
  const [nigerianSubGenre, setNigerianSubGenre] =
    useState<NigerianSubGenre>('all');
  const [movies, setMovies] = useState<MovieItem[]>(() => [...INITIAL_MOVIES]);
  const [series, setSeries] = useState<MovieSeries[]>(() => [...INITIAL_SERIES]);
  const [localWatchEntries, setLocalWatchEntries] = useState<LocalWatchEntry[]>(() => {
    try {
      const savedEmail = localStorage.getItem('tk_storyworld_user_session_v1');
      const initialUid = (savedEmail || 'guest-viewer').toLowerCase().trim();
      return loadLocalWatchEntries(initialUid);
    } catch {
      return [];
    }
  });
  const [watchHistory, setWatchHistory] = useState<WatchProgressItem[]>(() => {
    try {
      const savedEmail = localStorage.getItem('tk_storyworld_user_session_v1');
      const initialUid = (savedEmail || 'guest-viewer').toLowerCase().trim();
      return loadLocalWatchEntries(initialUid).map((e) => e.progress);
    } catch {
      return [];
    }
  });
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [engagementMap, setEngagementMap] = useState<
    Record<string, MovieEngagementSummary>
  >({});
  const [settings, setSettings] = useState<AdminSettings | null>(
    () => INITIAL_SETTINGS
  );
  const [diagnostics, setDiagnostics] =
    useState<SupabaseConnectionDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [addictionMood, setAddictionMood] = useState<string>('all');

  // Real Supabase Auth Client & Session State + Persistent Viewer Session Fallback
  const supabaseClientRef = useRef<SupabaseClient | null>(null);
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(
    null
  );
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [localUserEmail, setLocalUserEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem('tk_storyworld_user_session_v1') || null;
    } catch {
      return null;
    }
  });
  const [showSearchAndAccountModal, setShowSearchAndAccountModal] =
    useState(false);

  // Category & Search filtering state
  const [selectedCategory, setSelectedCategory] = useState<
    MovieCategory | 'All Categories'
  >(() => {
    if (typeof window !== 'undefined') {
      const catPage = findSeoCategoryPageByPath(window.location.pathname);
      if (catPage && catPage.view === 'categories') {
        return catPage.categoryKey as MovieCategory | 'All Categories';
      }
    }
    return 'All Categories';
  });
  const [categoryDisplayMode, setCategoryDisplayMode] =
    useState<CategoryDisplayMode>('grouped');
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const smartSearchInputRef = useRef<HTMLInputElement | null>(null);

  // Active Movie Player / Details Modal state
  const [activeModalMovie, setActiveModalMovie] = useState<{
    movie: MovieItem;
    autoPlay: boolean;
  } | null>(null);
  const [activePlayerQueue, setActivePlayerQueue] = useState<MovieItem[]>([]);
  const [activeSeriesModal, setActiveSeriesModal] = useState<MovieSeries | null>(null);
  const [seriesGenreFilter, setSeriesGenreFilter] = useState<'all' | SeriesGenreBucket>('all');
  const [pendingMovieAfterAuth, setPendingMovieAfterAuth] = useState<{
    movie: MovieItem;
    autoPlay: boolean;
  } | null>(null);

  // Viral Share Movie Modal, Device Download Modal & Deep-Link Invitation State
  const [shareModalMovie, setShareModalMovie] = useState<MovieItem | null>(
    null
  );
  const [downloadModalMovie, setDownloadModalMovie] =
    useState<MovieItem | null>(null);
  const [deviceDownloads, setDeviceDownloads] = useState<
    DeviceDownloadedMovieItem[]
  >(() => getDeviceDownloadedMovies());
  const [savedQualityFilter, setSavedQualityFilter] = useState<
    'all' | '1080p FHD' | '720p HD' | '480p Fast'
  >('all');
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [sharedInviteMovie, setSharedInviteMovie] = useState<MovieItem | null>(
    null
  );
  const handledDeepLinkRef = useRef<string | null>(null);
  const savedScrollYRef = useRef<number>(0);

  // 100% Offline Zero-Data Native Cinema Player State
  const [offlinePlayerMovie, setOfflinePlayerMovie] = useState<MovieItem | null>(null);
  const [offlineInitialFile, setOfflineInitialFile] = useState<File | null>(null);
  const generalOfflineFileInputRef = useRef<HTMLInputElement>(null);

  const openOfflinePlayer = useCallback((movie: MovieItem, file?: File | null) => {
    setOfflinePlayerMovie(movie);
    setOfflineInitialFile(file || null);
  }, []);

  // Notification Bell (New Releases in Last 48h & Coming Soon) State
  const [showNotifications, setShowNotifications] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>(
    () => {
      try {
        const raw = localStorage.getItem('tk_storyworld_seen_notifications_v1');
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
  );

  // Progressive Web App (PWA) Install & Luxury Splash Screen State
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    isStandalone,
    isOnline,
    promptInstall,
  } = usePWAInstall();
  const [showPWAInstallModal, setShowPWAInstallModal] = useState(false);
  // Instant zero-delay load when clicking the website link
  const [showSplashScreen, setShowSplashScreen] = useState<boolean>(false);

  const isUserSignedIn = useMemo(() => {
    return Boolean(authSession?.user?.email || localUserEmail);
  }, [authSession, localUserEmail]);

  const currentUserEmail = useMemo(() => {
    return authSession?.user?.email || localUserEmail || 'guest-viewer';
  }, [authSession, localUserEmail]);

  const userId = useMemo(
    () => currentUserEmail.toLowerCase().trim() || 'guest-viewer',
    [currentUserEmail]
  );

  // Sync locally persisted Continue Watching whenever viewer profile switches
  useEffect(() => {
    const entries = loadLocalWatchEntries(userId);
    setLocalWatchEntries(entries);
    setWatchHistory(entries.map((e) => e.progress));
  }, [userId]);

  const isAdminAuthenticated = useMemo(() => {
    const email = (authSession?.user?.email || localUserEmail || '')
      .trim()
      .toLowerCase();
    if (!email) return false;
    if (email === 'okorotochukwu007@gmail.com') return true;
    return Boolean(
      settings?.adminEmails?.some((a) => a.trim().toLowerCase() === email)
    );
  }, [authSession, localUserEmail, settings]);

  const loadBootstrapData = useCallback(async () => {
    const initSupabaseIfNeeded = async (url?: string, anonKey?: string) => {
      const targetUrl =
        url ||
        (import.meta as any).env?.VITE_SUPABASE_URL ||
        '';
      const targetKey =
        anonKey ||
        (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
        '';
      if (
        !supabaseClientRef.current &&
        targetUrl &&
        targetKey &&
        !targetUrl.includes('your-project-id') &&
        !targetKey.includes('your-supabase')
      ) {
        try {
          const normalizedUrl = targetUrl.startsWith('http')
            ? targetUrl
            : `https://${targetUrl}.supabase.co`;
          const sb = createClient(normalizedUrl, targetKey);
          supabaseClientRef.current = sb;
          setSupabaseClient(sb);

          const { data: sessionData } = await sb.auth.getSession();
          setAuthSession(sessionData?.session || null);
          if (sessionData?.session?.user?.email) {
            fetch('/api/auth/record-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: sessionData.session.user.email,
                clientInfo: 'App Client Session Resume',
              }),
            }).catch(() => {});
          }

          sb.auth.onAuthStateChange((event, nextSession) => {
            setAuthSession(nextSession || null);
            if (
              (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
              nextSession?.user?.email
            ) {
              fetch('/api/auth/record-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: nextSession.user.email,
                  clientInfo: `Supabase Auth ${event}`,
                }),
              }).catch(() => {});
            }
          });
        } catch (err) {
          console.error('Supabase Auth client initialization error:', err);
        }
      }
      return supabaseClientRef.current;
    };

    try {
      const res = await fetch(
        `/api/bootstrap?userId=${encodeURIComponent(userId)}`
      );
      const contentType = res.headers.get('content-type') || '';

      const outdatedAiRegex =
        /\bai\b|ai-generated|ai generated|folktale|tales by|story hub|short film|blender|cartoon|animation short|fan-made|sintel|tears of steel|sprite fright|cosmos laundromat|coffee run|wing it/i;
      const initialByVid = new Map<string, MovieItem>();
      for (const m of INITIAL_MOVIES) {
        initialByVid.set(m.youtubeVideoId, m);
      }

      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data.movies) && data.movies.length > 0) {
          const combined: MovieItem[] = data.movies
            .filter(
              (m: MovieItem) =>
                (m.durationSeconds || 0) >= 2400 &&
                !outdatedAiRegex.test(
                  `${m.title} ${m.channelTitle} ${m.synopsis}`
                )
            )
            .map(
              (m: MovieItem) => initialByVid.get(m.youtubeVideoId) || m
            );
          const existingIds = new Set(
            combined.map((m: MovieItem) => m.youtubeVideoId)
          );
          for (const m of INITIAL_MOVIES) {
            if (!existingIds.has(m.youtubeVideoId)) {
              combined.push(m);
              existingIds.add(m.youtubeVideoId);
            }
          }
          setMovies(combined);
        } else {
          setMovies([...INITIAL_MOVIES]);
        }
        setSeries(
          Array.isArray(data.series) && data.series.length > 0
            ? data.series
            : [...INITIAL_SERIES]
        );
        const serverHistory: WatchProgressItem[] = Array.isArray(data.watchHistory)
          ? data.watchHistory
          : [];
        const loadedCatalog =
          Array.isArray(data.movies) && data.movies.length > 0
            ? (data.movies as MovieItem[])
            : INITIAL_MOVIES;
        const currentLocal = loadLocalWatchEntries(userId);
        const mergedEntries = mergeWatchHistoryWithServer(
          currentLocal,
          serverHistory,
          loadedCatalog
        );
        saveLocalWatchEntries(userId, mergedEntries);
        setLocalWatchEntries(mergedEntries);
        setWatchHistory(mergedEntries.map((e) => e.progress));
        setWatchlist(data.watchlist || []);
        setEngagementMap(data.engagementMap || {});
        setSettings(data.settings || INITIAL_SETTINGS);
        setDiagnostics(data.diagnostics || null);

        await initSupabaseIfNeeded(
          data.clientSupabaseConfig?.url,
          data.clientSupabaseConfig?.anonKey
        );
        return;
      }

      // Fallback when deployed as static site (Cloudflare Pages) or if /api/bootstrap was unreachable
      // 1. Dynamic live catalogue sync directly from GitHub Raw (updates live website immediately without rebuilds)
      const liveMap = new Map<string, MovieItem>();
      let liveSeries: MovieSeries[] | null = null;
      let liveSettings: AdminSettings | null = null;

      try {
        const liveRes = await fetch(
          `https://raw.githubusercontent.com/okorotochukwu007-art/TK-AI-MOVIES/main/data/aetheria-db.json?t=${Date.now()}`
        );
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          if (Array.isArray(liveData.movies) && liveData.movies.length > 0) {
            for (const m of liveData.movies as MovieItem[]) {
              if (m.approvalStatus === 'approved' && m.youtubeVideoId) {
                liveMap.set(m.youtubeVideoId, m);
              }
            }
            if (Array.isArray(liveData.series) && liveData.series.length > 0) {
              liveSeries = liveData.series;
            }
            if (liveData.settings) {
              liveSettings = liveData.settings;
            }
          }
        }
      } catch (liveErr) {
        console.warn('Dynamic live GitHub catalogue fetch fallback warning:', liveErr);
      }

      if (liveSeries) setSeries(liveSeries);
      if (liveSettings) setSettings(liveSettings);

      const sb = await initSupabaseIfNeeded();
      if (sb) {
        const { data: dbMovies } = await sb
          .from('movies')
          .select('*')
          .order('published_at', { ascending: false });

        if (Array.isArray(dbMovies) && dbMovies.length > 0) {
          const removedNetflixVids = new Set([
            'b9EkMc79ZSU',
            'yQEfVuvKzVM',
            'MCbKvdQdJ5M',
            'S1bvo1aXGcc',
            '52mb6ODk9NE',
            '9i4h3q4z1qM',
            'P_mBOwMq0WA',
            'ETxZkF5pEHY',
          ]);
          const mergedByVid = new Map<string, MovieItem>();
          // Keep newest daily-synced movies from live GitHub JSON first
          for (const [vid, lm] of liveMap.entries()) {
            mergedByVid.set(vid, lm);
          }
          for (const row of dbMovies) {
            const vid = row.youtube_video_id as string;
            const text = `${row.title || ''} ${row.channel_title || ''} ${
              row.synopsis || ''
            }`;
            if (
              removedNetflixVids.has(vid) ||
              row.channel_title === 'Netflix' ||
              row.primary_category === 'Netflix Movies' ||
              Number(row.duration_seconds || 0) < 2400 ||
              outdatedAiRegex.test(text)
            ) {
              continue;
            }
            if (mergedByVid.has(vid)) continue;
            const bundled = initialByVid.get(vid);
            if (bundled) {
              mergedByVid.set(vid, bundled);
            } else {
              mergedByVid.set(vid, {
                id: row.id,
                youtubeVideoId: vid,
                title: row.title,
                synopsis: row.synopsis || '',
                thumbnailUrl: row.thumbnail_url,
                backdropUrl: row.backdrop_url,
                primaryCategory: row.primary_category,
                secondaryCategories: row.secondary_categories || [],
                channelTitle: row.channel_title,
                channelId: row.channel_id || '',
                publishedAt: row.published_at,
                durationSeconds: row.duration_seconds || 5400,
                durationFormatted: row.duration_formatted || '1:30:00',
                viewCount: Math.max(
                  1850000,
                  Number(row.view_count || 1850000)
                ),
                likeCount: Math.max(95000, Number(row.like_count || 95000)),
                isEmbeddable: true,
                playbackStatus: 'active',
                approvalStatus: row.approval_status || 'approved',
                isFeatured: Boolean(row.is_featured),
                seriesId: row.series_id || null,
                seasonNumber: row.season_number ?? null,
                episodeNumber: row.episode_number ?? null,
                discoveredVia: row.discovered_via || 'youtube_api',
                aiQualityScore: 98,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
              });
            }
          }

          for (const m of INITIAL_MOVIES) {
            if (!mergedByVid.has(m.youtubeVideoId)) {
              mergedByVid.set(m.youtubeVideoId, m);
            }
          }

          setMovies(
            Array.from(mergedByVid.values()).filter(
              (m) => m.approvalStatus === 'approved'
            )
          );
          return;
        }
      }

      if (liveMap.size > 0) {
        for (const m of INITIAL_MOVIES) {
          if (!liveMap.has(m.youtubeVideoId)) {
            liveMap.set(m.youtubeVideoId, m);
          }
        }
        setMovies(Array.from(liveMap.values()));
      } else {
        setMovies((prev) =>
          prev.length >= INITIAL_MOVIES.length ? prev : [...INITIAL_MOVIES]
        );
      }
    } catch (err) {
      console.error('Bootstrap fallback activated:', err);
      await initSupabaseIfNeeded();
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadBootstrapData();
  }, [loadBootstrapData]);

  const watchlistIds = useMemo(
    () => new Set(watchlist.map((w) => w.movieId)),
    [watchlist]
  );

  const progressMap = useMemo(() => {
    const map = new Map<string, WatchProgressItem>();
    for (const item of watchHistory) {
      map.set(item.movieId, item);
    }
    return map;
  }, [watchHistory]);

  const handleToggleWatchlist = async (movieId: string) => {
    if (!isUserSignedIn) {
      const targetMovie = movies.find((m) => m.id === movieId);
      if (targetMovie) {
        setPendingMovieAfterAuth({ movie: targetMovie, autoPlay: false });
      }
      setShowSearchAndAccountModal(true);
      return;
    }
    try {
      const res = await fetch('/api/watchlist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, movieId }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        setWatchlist(data.items || []);
        return;
      }
    } catch {
      // Fallback to local state update below
    }
    setWatchlist((prev) => {
      const exists = prev.some((w) => w.movieId === movieId);
      if (exists) {
        return prev.filter((w) => w.movieId !== movieId);
      }
      return [
        { userId, movieId, addedAt: new Date().toISOString() },
        ...prev,
      ];
    });
  };

  const moviesByIdRef = useRef<Map<string, MovieItem>>(new Map());
  useEffect(() => {
    const map = new Map<string, MovieItem>();
    for (const m of movies) map.set(m.id, m);
    moviesByIdRef.current = map;
  }, [movies]);

  const handleProgressUpdate = useCallback(
    async (
      movieId: string,
      progressSeconds: number,
      durationSeconds: number,
      movieSnapshot?: MovieItem
    ) => {
      const resolvedMovie = movieSnapshot || moviesByIdRef.current.get(movieId);
      if (resolvedMovie) {
        const updatedEntries = upsertLocalWatchEntry(
          userId,
          resolvedMovie,
          progressSeconds,
          durationSeconds
        );
        setLocalWatchEntries(updatedEntries);
        setWatchHistory(updatedEntries.map((e) => e.progress));
      } else {
        setWatchHistory((prev) => {
          const prog = Math.max(0, Math.floor(Number(progressSeconds) || 0));
          const dur = Math.max(60, Math.floor(Number(durationSeconds) || 5400));
          const completed = prog / dur >= 0.93;
          const nextItem: WatchProgressItem = {
            userId,
            movieId,
            progressSeconds: prog,
            durationSeconds: dur,
            completed,
            lastWatchedAt: new Date().toISOString(),
          };
          const rest = prev.filter((h) => h.movieId !== movieId);
          return [nextItem, ...rest];
        });
      }

      // Sync to backend in the background when available (never blocks local Continue Watching)
      try {
        await fetch('/api/history/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            movieId,
            progressSeconds,
            durationSeconds,
          }),
        });
      } catch {
        // silent background progress save
      }
    },
    [userId]
  );

  const handleRemoveContinueWatching = useCallback(
    (movieId: string) => {
      const updated = removeLocalWatchEntry(userId, movieId);
      setLocalWatchEntries(updated);
      setWatchHistory(updated.map((e) => e.progress));
    },
    [userId]
  );

  const handleClearContinueWatching = useCallback(() => {
    clearLocalWatchEntries(userId);
    setLocalWatchEntries([]);
    setWatchHistory([]);
  }, [userId]);

  const handlePlaybackError = useCallback(
    async (
      _movieId: string,
      _playbackStatus: 'unavailable' | 'embed_restricted'
    ) => {
      // Do not deactivate movies in the global catalogue on client playback errors
    },
    []
  );

  const markNotificationsSeen = useCallback((ids: string[]) => {
    setSeenNotificationIds((prev) => {
      const merged = Array.from(new Set([...prev, ...ids]));
      try {
        localStorage.setItem(
          'tk_storyworld_seen_notifications_v1',
          JSON.stringify(merged)
        );
      } catch {
        // ignore storage quota
      }
      return merged;
    });
  }, []);

  const unreadNotificationsCount = useMemo(() => {
    const newReleases = getNewReleaseMovies(movies);
    const seenSet = new Set(seenNotificationIds);
    return newReleases.filter((item) => !seenSet.has(item.movie.id)).length;
  }, [movies, seenNotificationIds]);

  const requireSignup = false;
  const isFreeGrowthMode = true;

  const openMovieModal = useCallback(
    (movie: MovieItem, autoPlay = false, contextQueue?: MovieItem[]) => {
      if (typeof window !== 'undefined' && !activeModalMovie) {
        savedScrollYRef.current = window.scrollY || 0;
      }
      try {
        const cleanPath = buildMoviePath(movie);
        window.history.replaceState({}, '', cleanPath);
      } catch {
        // ignore
      }
      if (Array.isArray(contextQueue)) {
        setActivePlayerQueue(contextQueue);
      } else if (!activeModalMovie) {
        setActivePlayerQueue([]);
      }
      setActiveModalMovie({ movie, autoPlay });
    },
    [activeModalMovie]
  );

  const handleSmartSearchPlayMovie = useCallback(
    (mov: MovieItem, contextQueue?: MovieItem[]) => {
      openMovieModal(mov, true, contextQueue);
    },
    [openMovieModal]
  );

  const handleSmartSearchDownloadMovie = useCallback((mov: MovieItem) => {
    setDownloadModalMovie(mov);
  }, []);

  const handleSmartSearchToggleWatchlist = useCallback(
    (movieId: string) => {
      void handleToggleWatchlist(movieId);
    },
    [handleToggleWatchlist]
  );

  // Automatically detect /movie/<slug> and legacy ?movie=<id> deep links shared via Google, WhatsApp, or Copy Link
  useEffect(() => {
    if (movies.length === 0) return;
    try {
      const extracted = extractMovieIdentifierFromUrl(
        window.location.pathname,
        window.location.search
      );
      if (!extracted || handledDeepLinkRef.current === extracted.value) {
        return;
      }
      const target = findMovieByIdentifier(movies, extracted.value);
      if (target) {
        handledDeepLinkRef.current = extracted.value;
        setSharedInviteMovie(target);
        setActiveModalMovie({ movie: target, autoPlay: true });
        // Normalize legacy ?movie=<id> or partial slug URL to the clean canonical /movie/<slug> path
        const canonicalPath = buildMoviePath(target);
        if (window.location.pathname !== canonicalPath || window.location.search.includes('movie=')) {
          window.history.replaceState({}, '', canonicalPath);
        }
      }
    } catch {
      // ignore
    }
  }, [movies]);

  // Keep browser URL & Back/Forward history synchronized with SEO category landing pages
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const extracted = extractMovieIdentifierFromUrl(
        window.location.pathname,
        window.location.search
      );
      if (extracted) {
        const target = findMovieByIdentifier(movies, extracted.value);
        if (target) {
          setActiveModalMovie({ movie: target, autoPlay: false });
          return;
        }
      }
      setActiveModalMovie(null);
      const catPage = findSeoCategoryPageByPath(window.location.pathname);
      if (catPage) {
        setActiveView(catPage.view);
        if (catPage.view === 'categories') {
          setSelectedCategory(
            catPage.categoryKey as MovieCategory | 'All Categories'
          );
        }
      } else if (window.location.pathname === '/' || window.location.pathname === '') {
        setActiveView('home');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [movies]);

  useEffect(() => {
    if (typeof window === 'undefined' || activeModalMovie) return;
    // Do not overwrite an unresolved /movie/<slug> or ?movie=<id> deep link on initial load
    if (extractMovieIdentifierFromUrl(window.location.pathname, window.location.search)) {
      return;
    }
    const catPage = findSeoCategoryPageByView(activeView, selectedCategory);
    const desiredPath = catPage ? catPage.path : '/';
    if (window.location.pathname !== desiredPath) {
      try {
        window.history.replaceState({}, '', desiredPath);
      } catch {
        // ignore
      }
    }
  }, [activeView, selectedCategory, activeModalMovie]);

  // Keep browser document.title, canonical URL, OpenGraph tags, and JSON-LD synced with the active movie or category landing page
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const setMeta = (selector: string, attrName: 'name' | 'property', key: string, value: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', value);
    };

    const setCanonical = (href: string) => {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = href;
    };

    const setJsonLd = (data: Record<string, unknown>) => {
      let script = document.querySelector('script[type="application/ld+json"]') as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(data);
    };

    const currentMovie = activeModalMovie?.movie;
    if (currentMovie) {
      const payload = buildMovieSeoPayload(currentMovie, DEFAULT_SITE_ORIGIN);
      document.title = payload.title;
      setMeta('meta[name="description"]', 'name', 'description', payload.description);
      setCanonical(payload.canonicalUrl);
      setMeta('meta[property="og:title"]', 'property', 'og:title', payload.title);
      setMeta('meta[property="og:description"]', 'property', 'og:description', payload.description);
      setMeta('meta[property="og:type"]', 'property', 'og:type', payload.ogType);
      setMeta('meta[property="og:url"]', 'property', 'og:url', payload.canonicalUrl);
      setMeta('meta[property="og:image"]', 'property', 'og:image', payload.imageUrl);
      setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', payload.title);
      setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', payload.description);
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', payload.imageUrl);
      setJsonLd(payload.jsonLd);
      return;
    }

    const activeCategoryPage = findSeoCategoryPageByView(activeView, selectedCategory);
    if (activeCategoryPage) {
      const payload = buildCategorySeoPayload(
        activeCategoryPage,
        movies,
        DEFAULT_SITE_ORIGIN
      );
      document.title = payload.title;
      setMeta('meta[name="description"]', 'name', 'description', payload.description);
      setCanonical(payload.canonicalUrl);
      setMeta('meta[property="og:title"]', 'property', 'og:title', payload.title);
      setMeta('meta[property="og:description"]', 'property', 'og:description', payload.description);
      setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
      setMeta('meta[property="og:url"]', 'property', 'og:url', payload.canonicalUrl);
      setMeta('meta[property="og:image"]', 'property', 'og:image', payload.imageUrl);
      setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', payload.title);
      setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', payload.description);
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', payload.imageUrl);
      setJsonLd(payload.jsonLd);
      return;
    }

    document.title = DEFAULT_TITLE;
    setMeta('meta[name="description"]', 'name', 'description', DEFAULT_DESCRIPTION);
    setCanonical(`${DEFAULT_SITE_ORIGIN}/`);
    setMeta('meta[property="og:title"]', 'property', 'og:title', DEFAULT_TITLE);
    setMeta('meta[property="og:description"]', 'property', 'og:description', DEFAULT_DESCRIPTION);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    setMeta('meta[property="og:url"]', 'property', 'og:url', `${DEFAULT_SITE_ORIGIN}/`);
    setMeta('meta[property="og:image"]', 'property', 'og:image', DEFAULT_OG_IMAGE);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', DEFAULT_TITLE);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', DEFAULT_DESCRIPTION);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', DEFAULT_OG_IMAGE);
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE_NAME,
      alternateName: 'TK Storyworld Streaming Platform',
      url: `${DEFAULT_SITE_ORIGIN}/`,
      applicationCategory: 'EntertainmentApplication',
      operatingSystem: 'All',
      description: DEFAULT_DESCRIPTION,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    });
  }, [activeModalMovie, activeView, selectedCategory, movies]);

  // Helper to sort any movie list according to active sortBy option
  const sortMoviesList = useCallback(
    (list: MovieItem[], prioritizePrimary?: MovieCategory): MovieItem[] => {
      return [...list].sort((a, b) => {
        if (prioritizePrimary) {
          const aPrimary = a.primaryCategory === prioritizePrimary ? 1 : 0;
          const bPrimary = b.primaryCategory === prioritizePrimary ? 1 : 0;
          if (aPrimary !== bPrimary) return bPrimary - aPrimary;
        }
        if (sortBy === 'most_loved') {
          const likesA = engagementMap[a.id]?.likesCount ?? a.likeCount ?? 0;
          const likesB = engagementMap[b.id]?.likesCount ?? b.likeCount ?? 0;
          const ratingA = engagementMap[a.id]?.averageRating ?? 4.7;
          const ratingB = engagementMap[b.id]?.averageRating ?? 4.7;
          return likesB - likesA || ratingB - ratingA;
        }
        if (sortBy === 'release_date') {
          return (
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime()
          );
        }
        if (sortBy === 'recently_added') {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        return b.viewCount - a.viewCount;
      });
    },
    [sortBy, engagementMap]
  );

  // Derived Cinema Rails, Daily 2026 Drop Engine & Recent 2026 Hero Banner Spotlight
  const [heroSpotlightIdx, setHeroSpotlightIdx] = useState(0);
  const [dailyDropOffset, setDailyDropOffset] = useState(0);
  const [dailySyncing, setDailySyncing] = useState(false);
  const [dailySyncStatus, setDailySyncStatus] = useState<string | null>(null);
  const [nextDropCountdown, setNextDropCountdown] = useState('06h 14m 22s');

  const todayDateLabel = useMemo(() => {
    try {
      return new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Today';
    }
  }, []);

  // Live countdown to next automated midnight daily drop
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      const diffSec = Math.max(
        0,
        Math.floor((tomorrow.getTime() - now.getTime()) / 1000)
      );
      const hrs = String(Math.floor(diffSec / 3600)).padStart(2, '0');
      const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
      const secs = String(diffSec % 60).padStart(2, '0');
      setNextDropCountdown(`${hrs}h ${mins}m ${secs}s`);
    };
    updateTimer();
    const timerId = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const dayOfYearSeed = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }, []);

  // Strict Home-Page 2026 Movies Pool (ZERO AI movies, ONLY 2026 movies, strictly deduplicated by ID, video ID & normalized title)
  const home2026Movies = useMemo(() => {
    const seenIds = new Set<string>();
    const seenVids = new Set<string>();
    const seenTitles = new Set<string>();
    return movies.filter((m) => {
      if (!isHome2026RealMovie(m)) return false;
      const vid = (m.youtubeVideoId || m.externalVideoId || '').trim().toLowerCase();
      const normTitle = m.title
        .toLowerCase()
        .replace(/\b(2026|full|movie|official|trailer|hd|4k|nollywood|latest|new|teaser)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (seenIds.has(m.id)) return false;
      if (vid && seenVids.has(vid)) return false;
      if (normTitle.length >= 4 && seenTitles.has(normTitle)) return false;
      seenIds.add(m.id);
      if (vid) seenVids.add(vid);
      if (normTitle.length >= 4) seenTitles.add(normTitle);
      return true;
    });
  }, [movies]);

  const hdVerifiedNewMovies = useMemo(() => {
    const hd = home2026Movies.filter(
      (m) =>
        m.primaryCategory === 'New Movies' &&
        m.backdropUrl &&
        m.backdropUrl.includes('maxresdefault.jpg')
    );
    return hd.length >= 16
      ? hd
      : home2026Movies.filter((m) => m.primaryCategory === 'New Movies');
  }, [home2026Movies]);

  const heroSpotlightMovies = useMemo(() => {
    if (hdVerifiedNewMovies.length === 0) return home2026Movies.slice(0, 6);
    const result: MovieItem[] = [];
    const total = hdVerifiedNewMovies.length;
    const baseOffset = dailyDropOffset * 6;
    for (let i = 0; i < Math.min(6, total); i++) {
      result.push(hdVerifiedNewMovies[(baseOffset + i) % total]);
    }
    return result;
  }, [hdVerifiedNewMovies, home2026Movies, dailyDropOffset]);

  const [dailySourceFilter, setDailySourceFilter] = useState<
    'all' | VideoSourcePlatform
  >('all');

  const sourcePlatformCounts = useMemo(() => {
    const counts: Record<VideoSourcePlatform, number> = {
      youtube: 0,
      dailymotion: 0,
      vimeo: 0,
      archive: 0,
    };
    for (const m of home2026Movies) {
      const p = resolveMovieSource(m).platform;
      counts[p] = (counts[p] || 0) + 1;
    }
    return counts;
  }, [home2026Movies]);

  const todaysDailyDropMovies = useMemo(() => {
    if (dailySourceFilter !== 'all') {
      const platformList = home2026Movies
        .filter((m) => resolveMovieSource(m).platform === dailySourceFilter)
        .sort(
          (a, b) =>
            new Date(b.createdAt || b.publishedAt).getTime() -
            new Date(a.createdAt || a.publishedAt).getTime()
        );
      if (platformList.length <= 8) return platformList;
      const startIdx = (dailyDropOffset * 8) % platformList.length;
      const picked: MovieItem[] = [];
      for (let i = 0; i < Math.min(8, platformList.length); i++) {
        picked.push(platformList[(startIdx + i) % platformList.length]);
      }
      return picked;
    }

    // In 'all' mode, spotlight freshly synced Dailymotion & Vimeo 2026 drops alongside YouTube's top daily 2026 drops
    const multiPlatformFresh = home2026Movies
      .filter((m) => resolveMovieSource(m).platform !== 'youtube')
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.publishedAt).getTime() -
          new Date(a.createdAt || a.publishedAt).getTime()
      )
      .slice(0, 3);

    const basePool =
      hdVerifiedNewMovies.length > 0 ? hdVerifiedNewMovies : home2026Movies;
    if (basePool.length === 0) return multiPlatformFresh;
    const total = basePool.length;
    const startIdx = ((dayOfYearSeed * 5) + (dailyDropOffset * 8)) % total;
    const picked: MovieItem[] = [...multiPlatformFresh];
    const seen = new Set(picked.map((m) => m.id));
    for (let i = 0; i < total && picked.length < 8; i++) {
      const cand = basePool[(startIdx + i) % total];
      if (!seen.has(cand.id)) {
        seen.add(cand.id);
        picked.push(cand);
      }
    }
    return picked;
  }, [
    hdVerifiedNewMovies,
    home2026Movies,
    dayOfYearSeed,
    dailyDropOffset,
    dailySourceFilter,
  ]);

  const handleTriggerDailySync = useCallback(async () => {
    if (dailySyncing) return;
    setDailySyncing(true);
    setDailySyncStatus('Scanning for today’s highest-impression 2026 movies...');
    try {
      const res = await fetch('/api/daily-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data.movies) && data.movies.length > 0) {
          setMovies(data.movies);
        }
        setDailyDropOffset((prev) => prev + 1);
        setHeroSpotlightIdx(0);
        setDailySyncStatus(
          data.moviesAdded > 0
            ? `Added ${data.moviesAdded} brand-new 2026 blockbusters & refreshed Today’s Daily Drop!`
            : `Today’s Daily 2026 Drop & Hero Spotlight refreshed with 8 trending blockbusters!`
        );
        return;
      }
    } catch {
      // Fallback rotation on static edge
    } finally {
      setDailySyncing(false);
    }
    setDailyDropOffset((prev) => prev + 1);
    setHeroSpotlightIdx(0);
    setDailySyncStatus(
      'Today’s Daily 2026 Drop & Hero Spotlight refreshed with 8 trending blockbusters!'
    );
  }, [dailySyncing]);

  const featuredMovie = useMemo(() => {
    const explicitlyFeatured = home2026Movies.find((m) => m.isFeatured);
    return (
      explicitlyFeatured ||
      heroSpotlightMovies[heroSpotlightIdx] ||
      heroSpotlightMovies[0] ||
      home2026Movies[0] ||
      null
    );
  }, [heroSpotlightMovies, heroSpotlightIdx, home2026Movies]);

  const continueWatchingMovies = useMemo(() => {
    const catalogById = new Map<string, MovieItem>();
    for (const m of movies) catalogById.set(m.id, m);

    return localWatchEntries
      .filter((entry) => !entry.progress.completed && entry.progress.progressSeconds >= 5)
      .map((entry) => {
        const freshCatalogMovie = catalogById.get(entry.progress.movieId);
        return {
          movie: freshCatalogMovie || entry.movie,
          progress: entry.progress,
        };
      })
      .slice(0, 12);
  }, [localWatchEntries, movies]);

  const watchedMovieIds = useMemo(() => {
    const set = new Set<string>();
    for (const entry of localWatchEntries) {
      if (entry.progress.completed || entry.progress.progressSeconds >= 120) {
        set.add(entry.progress.movieId);
      }
    }
    return set;
  }, [localWatchEntries]);

  const trendingMovies = useMemo(() => {
    return [...movies]
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 12);
  }, [movies]);

  const recentlyAddedMovies = useMemo(() => {
    return [...movies]
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      )
      .slice(0, 12);
  }, [movies]);

  const nigerianAndAfricanMovies = useMemo(() => {
    return movies.filter((m) => {
      const text = `${m.title} ${m.synopsis} ${m.channelTitle}`.toLowerCase();
      return (
        text.includes('nigeria') ||
        text.includes('african') ||
        text.includes('lagos') ||
        text.includes('yoruba') ||
        text.includes('igbo') ||
        text.includes('nollywood') ||
        text.includes('folktale') ||
        text.includes('maid') ||
        text.includes('prince') ||
        text.includes('king') ||
        text.includes('royal') ||
        text.includes('palace') ||
        text.includes('chief') ||
        m.channelTitle.toLowerCase().includes('vic') ||
        m.channelTitle.toLowerCase().includes('larih') ||
        m.channelTitle.toLowerCase().includes('lantora')
      );
    });
  }, [movies]);

  const lagosBillionaireMovies = useMemo(() => {
    return nigerianAndAfricanMovies.filter((m) => {
      const text = `${m.title} ${m.synopsis}`.toLowerCase();
      return (
        m.primaryCategory === 'Billionaire Romance' ||
        m.primaryCategory === 'CEO Love Stories' ||
        text.includes('billionaire') ||
        text.includes('ceo') ||
        text.includes('lagos') ||
        text.includes('tycoon') ||
        text.includes('wealth')
      );
    });
  }, [nigerianAndAfricanMovies]);

  const royalFolktaleMovies = useMemo(() => {
    return nigerianAndAfricanMovies.filter((m) => {
      const text = `${m.title} ${m.synopsis}`.toLowerCase();
      return (
        m.primaryCategory === 'Fantasy Romance' ||
        text.includes('folktale') ||
        text.includes('royal') ||
        text.includes('king') ||
        text.includes('queen') ||
        text.includes('kingdom') ||
        text.includes('village') ||
        text.includes('ancient') ||
        text.includes('tales')
      );
    });
  }, [nigerianAndAfricanMovies]);

  const maidPrinceMovies = useMemo(() => {
    return nigerianAndAfricanMovies.filter((m) => {
      const text = `${m.title} ${m.synopsis}`.toLowerCase();
      return (
        text.includes('maid') ||
        text.includes('prince') ||
        text.includes('princess') ||
        text.includes('orphan') ||
        text.includes('servant') ||
        text.includes('palace') ||
        text.includes('stepmother') ||
        text.includes('rejected')
      );
    });
  }, [nigerianAndAfricanMovies]);

  const emotionalMarriageMovies = useMemo(() => {
    return nigerianAndAfricanMovies.filter((m) => {
      const text = `${m.title} ${m.synopsis}`.toLowerCase();
      return (
        m.primaryCategory === 'Contract Marriage' ||
        m.primaryCategory === 'Secret Marriage' ||
        m.primaryCategory === 'Emotional Love Stories' ||
        m.primaryCategory === 'Revenge Romance' ||
        text.includes('marriage') ||
        text.includes('wife') ||
        text.includes('husband') ||
        text.includes('betray') ||
        text.includes('wedding') ||
        text.includes('contract')
      );
    });
  }, [nigerianAndAfricanMovies]);

  const filteredNigerianMovies = useMemo(() => {
    let base = nigerianAndAfricanMovies;
    if (nigerianSubGenre === 'lagos_billionaire') {
      base = lagosBillionaireMovies;
    } else if (nigerianSubGenre === 'royal_folktale') {
      base = royalFolktaleMovies;
    } else if (nigerianSubGenre === 'maid_prince') {
      base = maidPrinceMovies;
    } else if (nigerianSubGenre === 'emotional_marriage') {
      base = emotionalMarriageMovies;
    }
    return [...base].sort((a, b) => b.viewCount - a.viewCount);
  }, [
    nigerianAndAfricanMovies,
    nigerianSubGenre,
    lagosBillionaireMovies,
    royalFolktaleMovies,
    maidPrinceMovies,
    emotionalMarriageMovies,
  ]);

  const nigerianHeroMovie = useMemo(() => {
    return (
      nigerianAndAfricanMovies.find((m) => m.isFeatured) ||
      nigerianAndAfricanMovies[0] ||
      featuredMovie
    );
  }, [nigerianAndAfricanMovies, featuredMovie]);

  // Strict Genre-Partitioned Collections for Home & Categories Views
  const newMovies2026 = useMemo(() => {
    return sortMoviesList(
      movies.filter(
        (m) =>
          m.primaryCategory === 'New Movies' ||
          m.secondaryCategories.includes('New Movies')
      ),
      'New Movies'
    );
  }, [movies, sortMoviesList]);

  const actionMovies = useMemo(() => {
    return sortMoviesList(
      movies.filter(
        (m) =>
          m.primaryCategory === 'Action Movies' ||
          m.secondaryCategories.includes('Action Movies')
      ),
      'Action Movies'
    );
  }, [movies, sortMoviesList]);

  const contractMarriageMovies = useMemo(() => {
    return sortMoviesList(
      movies.filter(
        (m) =>
          m.primaryCategory === 'Contract Marriage' ||
          m.secondaryCategories.includes('Contract Marriage')
      ),
      'Contract Marriage'
    );
  }, [movies, sortMoviesList]);

  const secretMarriageMovies = useMemo(() => {
    return sortMoviesList(
      movies.filter(
        (m) =>
          m.primaryCategory === 'Secret Marriage' ||
          m.secondaryCategories.includes('Secret Marriage')
      ),
      'Secret Marriage'
    );
  }, [movies, sortMoviesList]);

  const ceoAndBillionaireMovies = useMemo(() => {
    return sortMoviesList(
      movies.filter(
        (m) =>
          m.primaryCategory === 'Billionaire Romance' ||
          m.primaryCategory === 'CEO Love Stories' ||
          m.secondaryCategories.includes('Billionaire Romance') ||
          m.secondaryCategories.includes('CEO Love Stories')
      ),
      'Billionaire Romance'
    );
  }, [movies, sortMoviesList]);

  const revengeRomanceMovies = useMemo(() => {
    return sortMoviesList(
      movies.filter(
        (m) =>
          m.primaryCategory === 'Revenge Romance' ||
          m.secondaryCategories.includes('Revenge Romance')
      ),
      'Revenge Romance'
    );
  }, [movies, sortMoviesList]);

  const emotionalLoveMovies = useMemo(() => {
    return sortMoviesList(
      movies.filter(
        (m) =>
          m.primaryCategory === 'Emotional Love Stories' ||
          m.secondaryCategories.includes('Emotional Love Stories')
      ),
      'Emotional Love Stories'
    );
  }, [movies, sortMoviesList]);

  const werewolfRomanceMovies = useMemo(() => {
    return sortMoviesList(
      movies.filter(
        (m) =>
          m.primaryCategory === 'Werewolf Romance' ||
          m.secondaryCategories.includes('Werewolf Romance') ||
          m.title.toLowerCase().includes('werewolf') ||
          m.title.toLowerCase().includes('alpha') ||
          m.title.toLowerCase().includes('lycan')
      ),
      'Werewolf Romance'
    );
  }, [movies, sortMoviesList]);

  const fantasyAndAnimatedMovies = useMemo(() => {
    return sortMoviesList(
      movies.filter(
        (m) =>
          m.primaryCategory === 'Fantasy Romance' ||
          m.primaryCategory === 'AI Animated Movies' ||
          m.secondaryCategories.includes('Fantasy Romance') ||
          m.secondaryCategories.includes('AI Animated Movies')
      ),
      'Fantasy Romance'
    );
  }, [movies, sortMoviesList]);

  const newlyReleasedEpisodes = useMemo(() => {
    return movies
      .filter((m) => m.seriesId !== null || m.episodeNumber !== null)
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
  }, [movies]);

  const watchlistMovies = useMemo(() => {
    return watchlist
      .map((w) => movies.find((m) => m.id === w.movieId))
      .filter((m): m is MovieItem => Boolean(m));
  }, [watchlist, movies]);

  // Home-Page-Only Strictly 2026 Non-AI Collections
  const home2026NewMovies = useMemo(() => {
    return sortMoviesList(
      home2026Movies.filter(
        (m) =>
          m.primaryCategory === 'New Movies' ||
          m.secondaryCategories.includes('New Movies')
      ),
      'New Movies'
    );
  }, [home2026Movies, sortMoviesList]);

  const home2026ActionMovies = useMemo(() => {
    return sortMoviesList(
      home2026Movies.filter(
        (m) =>
          m.primaryCategory === 'Action Movies' ||
          m.secondaryCategories.includes('Action Movies')
      ),
      'Action Movies'
    );
  }, [home2026Movies, sortMoviesList]);

  const home2026NollywoodMovies = useMemo(() => {
    return sortMoviesList(
      home2026Movies.filter((m) => {
        const text = `${m.title} ${m.synopsis} ${m.channelTitle} ${m.hookTag || ''}`.toLowerCase();
        return (
          (m.primaryCategory as string) === 'African & Nigerian Cinema' ||
          text.includes('nollywood') ||
          text.includes('nigerian') ||
          text.includes('nigeria') ||
          text.includes('lagos')
        );
      })
    );
  }, [home2026Movies, sortMoviesList]);

  const home2026MostLovedMovies = useMemo(() => {
    return [...home2026Movies]
      .sort((a, b) => {
        const likesA = engagementMap[a.id]?.likesCount ?? a.likeCount ?? 0;
        const likesB = engagementMap[b.id]?.likesCount ?? b.likeCount ?? 0;
        const ratingA = engagementMap[a.id]?.averageRating ?? 4.7;
        const ratingB = engagementMap[b.id]?.averageRating ?? 4.7;
        return likesB - likesA || ratingB - ratingA;
      })
      .slice(0, 12);
  }, [home2026Movies, engagementMap]);

  // Home Page Trending 2026 Hits (strictly 2026 non-AI movies, clean genre mood filters)
  const home2026TrendingMovies = useMemo(() => {
    let list = [...home2026Movies];
    if (addictionMood === 'action') {
      list = list.filter(
        (m) =>
          m.primaryCategory === 'Action Movies' ||
          /\b(action|thriller|heist|special forces|assassin|combat)\b/i.test(
            `${m.title} ${m.synopsis} ${m.hookTag || ''}`
          )
      );
    } else if (addictionMood === 'nollywood') {
      list = list.filter((m) => {
        const text = `${m.title} ${m.synopsis} ${m.channelTitle} ${m.hookTag || ''}`.toLowerCase();
        return (
          (m.primaryCategory as string) === 'African & Nigerian Cinema' ||
          text.includes('nollywood') ||
          text.includes('nigerian')
        );
      });
    } else if (addictionMood === 'scifi') {
      list = list.filter((m) =>
        /\b(sci-fi|space|alien|future|thriller|survival|mystery)\b/i.test(
          `${m.title} ${m.synopsis} ${m.hookTag || ''}`
        )
      );
    } else if (addictionMood === 'hollywood') {
      list = list.filter(
        (m) =>
          (m.hookTag || '').includes('Starring') ||
          /\b(hollywood|american)\b/i.test(`${m.title} ${m.hookTag || ''}`)
      );
    }

    return list.sort((a, b) => {
      const scoreA =
        (a.viewCount || 0) + (a.commentsCount || 0) * 150 + (a.likeCount || 0) * 8;
      const scoreB =
        (b.viewCount || 0) + (b.commentsCount || 0) * 150 + (b.likeCount || 0) * 8;
      return scoreB - scoreA;
    });
  }, [home2026Movies, addictionMood]);

  // 2026 Non-AI Series Movies grouped cleanly per series card (zero duplicate episode clutter)
  const seriesEpisodesBySeriesId = useMemo(() => {
    const map = new Map<string, MovieItem[]>();
    for (const m of movies) {
      if (!m.seriesId) continue;
      const arr = map.get(m.seriesId);
      if (arr) {
        arr.push(m);
      } else {
        map.set(m.seriesId, [m]);
      }
    }
    for (const [, list] of map) {
      list.sort(
        (a, b) =>
          (a.seasonNumber || 1) - (b.seasonNumber || 1) ||
          (a.episodeNumber || 1) - (b.episodeNumber || 1)
      );
    }
    return map;
  }, [movies]);

  const series2026Items = useMemo(() => {
    return series
      .filter((s) => {
        const isAiSeries =
          s.primaryCategory === 'Complete AI Movie Series' ||
          HOME_AI_CONTENT_REGEX.test(`${s.title} ${s.synopsis} ${s.channelTitle}`);
        if (isAiSeries) return false;
        const eps = seriesEpisodesBySeriesId.get(s.id) || [];
        return eps.length > 0 && (s.is2026Series === true || s.primaryCategory === '2026 Series Movies');
      })
      .sort((a, b) => {
        const viewsA =
          a.totalViews ||
          (seriesEpisodesBySeriesId.get(a.id) || []).reduce((acc, ep) => acc + (ep.viewCount || 0), 0);
        const viewsB =
          b.totalViews ||
          (seriesEpisodesBySeriesId.get(b.id) || []).reduce((acc, ep) => acc + (ep.viewCount || 0), 0);
        return viewsB - viewsA;
      });
  }, [series, seriesEpisodesBySeriesId]);

  const filteredSeries2026 = useMemo(() => {
    if (seriesGenreFilter === 'all') return series2026Items;
    return series2026Items.filter((s) => {
      if (s.genreBucket) return s.genreBucket === seriesGenreFilter;
      const txt = `${s.title} ${s.genreTag || ''} ${s.synopsis}`.toLowerCase();
      if (seriesGenreFilter === 'nollywood') return /nollywood|lagos|nigeria/.test(txt);
      if (seriesGenreFilter === 'crime_thriller') return /crime|thriller|detective|murder/.test(txt);
      if (seriesGenreFilter === 'action_scifi') return /action|sci-fi|espionage|multiverse/.test(txt);
      if (seriesGenreFilter === 'kdrama_asian') return /k-drama|empress|korean|asian drama/.test(txt);
      if (seriesGenreFilter === 'horror_mystery') return /horror|curse|supernatural/.test(txt);
      return true;
    });
  }, [series2026Items, seriesGenreFilter]);

  // STRICT HOME-PAGE ZERO-DUPLICATE PARTITIONER
  // Guarantees NO movie appears twice anywhere across the Home page (Hero, Trending 2026, Featured 2026, Top 10, Continue Watching, Nollywood 2026, Action 2026, New Blockbusters, Most Loved, or Just Dropped 2026 Hub).
  const homeUniqueSections = useMemo(() => {
    const claimedIds = new Set<string>();
    const claimedKeys = new Set<string>();

    const normalizeHomeKey = (title: string) =>
      title
        .toLowerCase()
        .replace(/\b(2026|full|movie|official|trailer|hd|4k|nollywood|latest|new|teaser)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const isClaimed = (m: MovieItem): boolean => {
      if (claimedIds.has(m.id)) return true;
      const vid = (m.youtubeVideoId || m.externalVideoId || '').trim().toLowerCase();
      if (vid && claimedKeys.has(`vid:${vid}`)) return true;
      const key = normalizeHomeKey(m.title);
      if (key.length >= 4 && claimedKeys.has(key)) return true;
      return false;
    };

    const claim = (m: MovieItem): void => {
      claimedIds.add(m.id);
      const vid = (m.youtubeVideoId || m.externalVideoId || '').trim().toLowerCase();
      if (vid) claimedKeys.add(`vid:${vid}`);
      const key = normalizeHomeKey(m.title);
      if (key.length >= 4) claimedKeys.add(key);
    };

    const takeUnique = (candidates: MovieItem[], limit: number): MovieItem[] => {
      const result: MovieItem[] = [];
      for (const m of candidates) {
        if (result.length >= limit) break;
        if (isClaimed(m)) continue;
        claim(m);
        result.push(m);
      }
      return result;
    };

    // 1. Hero Spotlight (up to 6)
    const hero = takeUnique(heroSpotlightMovies, 6);

    // 2. Continue Watching (up to 4 — personal active progress)
    const continueWatching: Array<{ movie: MovieItem; progress: WatchProgressItem }> = [];
    for (const item of continueWatchingMovies) {
      if (continueWatching.length >= 4) break;
      if (isClaimed(item.movie)) continue;
      claim(item.movie);
      continueWatching.push(item);
    }

    // 3. Trending 2026 Movies (up to 8 — spotlighted right near top of Home to attract users!)
    const trending2026 = takeUnique(home2026TrendingMovies, 8);

    // 4. Today's Featured 2026 Full Movies (up to 8)
    const dailyDrop2026 = takeUnique(todaysDailyDropMovies, 8);

    // 5. Top 10 2026 Movies (up to 10)
    const top102026 = takeUnique(home2026NewMovies, 10);

    // 6. 2026 Nollywood & African Movies (up to 8)
    const nollywood2026 = takeUnique(home2026NollywoodMovies, 8);

    // 7. 2026 Action & Sci-Fi Blockbusters (up to 8)
    const action2026 = takeUnique(home2026ActionMovies, 8);

    // 8. New 2026 Blockbusters (up to 12 remaining)
    const newBlockbusters2026 = takeUnique(home2026NewMovies, 12);

    // 9. Most Loved 2026 Movies (up to 8 remaining)
    const mostLoved2026 = takeUnique(home2026MostLovedMovies, 8);

    return {
      hero,
      continueWatching,
      trending2026,
      dailyDrop2026,
      top102026,
      nollywood2026,
      action2026,
      newBlockbusters2026,
      mostLoved2026,
      claimedKeys,
    };
  }, [
    heroSpotlightMovies,
    continueWatchingMovies,
    home2026TrendingMovies,
    todaysDailyDropMovies,
    home2026NewMovies,
    home2026NollywoodMovies,
    home2026ActionMovies,
    home2026MostLovedMovies,
  ]);

  // Map every MovieCategory to its accurately sorted movie list (Primary matches first)
  const categoryMoviesMap = useMemo(() => {
    const map = {} as Record<MovieCategory, MovieItem[]>;
    for (const cat of MOVIE_CATEGORIES) {
      if (cat === 'Trending AI Movies') {
        map[cat] = trendingMovies;
      } else if (cat === 'Newly Released Movies') {
        map[cat] = recentlyAddedMovies;
      } else if (cat === 'Complete AI Movie Series') {
        map[cat] = newlyReleasedEpisodes;
      } else {
        const matching = movies.filter(
          (m) =>
            m.primaryCategory === cat || m.secondaryCategories.includes(cat)
        );
        map[cat] = sortMoviesList(matching, cat);
      }
    }
    return map;
  }, [
    movies,
    trendingMovies,
    recentlyAddedMovies,
    newlyReleasedEpisodes,
    sortMoviesList,
  ]);

  const filteredCategoryMovies = useMemo(() => {
    if (activeView !== 'categories') return [];
    const baseList =
      selectedCategory === 'All Categories'
        ? sortMoviesList(movies)
        : [...(categoryMoviesMap[selectedCategory] || [])];

    const clean = deferredSearchQuery.trim();
    if (clean.length < 2) return baseList;
    const typo = clean.length >= 4 ? findTypoCorrection(clean) : null;
    return rankInAppMoviesForQuery(baseList, clean, {
      correctedQuery: typo?.corrected,
    });
  }, [activeView, movies, selectedCategory, categoryMoviesMap, deferredSearchQuery, sortMoviesList]);

  const homeSearchMatches = useMemo(() => {
    if (activeView !== 'home') return [];
    const clean = deferredSearchQuery.trim();
    if (clean.length < 2) return [];
    const typo = clean.length >= 4 ? findTypoCorrection(clean) : null;
    const initialRanked = rankInAppMoviesForQuery(movies, clean, {
      correctedQuery: typo?.corrected,
    });
    const catIntent = detectMovieCategoryIntent(clean);
    if (catIntent.category) return initialRanked;

    return initialRanked.filter((m) => {
      const tNorm = normalizeSearchText(m.title);
      const qNorm = normalizeSearchText(clean);
      if (tNorm === qNorm || tNorm.includes(qNorm) || qNorm.includes(tNorm)) return true;
      const sim = computeTitleSimilarity(clean, m.title);
      if (sim >= 0.72) return true;
      const qTokens = qNorm.split(' ').filter((w) => w.length >= 2);
      const titleWords = tNorm.split(' ').filter((w) => w.length >= 2);
      const matchingTokens = qTokens.filter((qt) => titleWords.some((tw) => isTokenMatch(tw, qt)));
      if (qTokens.length > 0 && matchingTokens.length >= Math.ceil(qTokens.length * 0.5)) return true;
      return false;
    });
  }, [activeView, movies, deferredSearchQuery]);

  const focusVisibleSearchBar = useCallback(() => {
    if (activeView !== 'home' && activeView !== 'categories') {
      setActiveView('home');
    }
    window.setTimeout(() => {
      smartSearchInputRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      smartSearchInputRef.current?.focus({ preventScroll: true });
    }, 140);
  }, [activeView]);

  const renderMovieCard = (movie: MovieItem, isHorizontalMobile = false) => {
    const savedProgress = progressMap.get(movie.id);
    const inList = watchlistIds.has(movie.id);
    const eng = engagementMap[movie.id];
    const avgStars = eng ? eng.averageRating : 4.8;
    const totalLikes = eng ? eng.likesCount : movie.likeCount || 0;
    const pct =
      savedProgress && savedProgress.durationSeconds > 0
        ? Math.min(
            100,
            Math.round(
              (savedProgress.progressSeconds / savedProgress.durationSeconds) *
                100
            )
          )
        : 0;

    return (
      <div
        key={movie.id}
        onClick={() => openMovieModal(movie, true)}
        className={`group relative rounded-xl bg-[#0E1118] border border-white/10 hover:border-white/25 overflow-hidden transition-transform duration-150 hover:-translate-y-1 cursor-pointer flex flex-col ${
          isHorizontalMobile
            ? 'w-[78vw] max-w-[290px] sm:w-auto sm:max-w-none shrink-0 snap-start'
            : ''
        }`}
      >
        <div className="relative aspect-video w-full bg-black overflow-hidden">
          <CinemaPosterImage
            src={movie.thumbnailUrl}
            fallbackVideoId={movie.youtubeVideoId}
            alt={movie.title}
            category={movie.primaryCategory}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E1118] via-transparent to-black/30 opacity-90" />

          {/* Luxury Red TK STORYWORLD Signature Watermark */}
          <div className="absolute top-2.5 left-3 pointer-events-none">
            <span className="brand-luxury-red text-[10px] font-extrabold uppercase">
              TK STORYWORLD
            </span>
          </div>

          {/* Addiction Hook / Viral Badge (source platform names stripped for pure in-app feel) */}
          <div className="absolute top-2.5 right-3 pointer-events-none flex items-center gap-1.5">
            {(() => {
              const cleanTag = (movie.hookTag || '')
                .replace(/\b(YouTube|Dailymotion|Vimeo)\b/gi, '')
                .replace(/[·•|/-]+\s*(DM|YT|VM)\b/gi, '')
                .replace(/\s*[·•|]\s*[·•|]\s*/g, ' · ')
                .replace(/^\s*[·•|-]+\s*|\s*[·•|-]+\s*$/g, '')
                .trim();
              return cleanTag ? (
                <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-[#090B10]/95 border border-[#E11D48]/50 text-rose-300">
                  {cleanTag}
                </span>
              ) : null;
            })()}
          </div>

          {/* Touch-Friendly Mobile + Desktop Play Overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150 bg-black/20 sm:bg-black/40">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openMovieModal(movie, true);
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-lg transform sm:scale-95 sm:group-hover:scale-100 transition-transform cursor-pointer"
              aria-label={`Play ${movie.title}`}
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
            </button>
          </div>

          {/* Bottom Runtime & Episode Overlay (Clean Unboxed Text) */}
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-200">
            <span>
              {movie.episodeNumber
                ? `S${String(movie.seasonNumber || 1).padStart(2, '0')} · E${String(
                    movie.episodeNumber
                  ).padStart(2, '0')}`
                : movie.primaryCategory}
            </span>
            <span>{movie.durationFormatted}</span>
          </div>

          {/* Resume Progress Bar if watched */}
          {pct > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
              <div
                className="h-full bg-[#E11D48]"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-white group-hover:text-[#F59E0B] transition-colors line-clamp-1">
                {movie.title}
              </h3>
              <div className="flex items-center gap-0.5 -mr-1 -mt-1 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDownloadModalMovie(movie);
                  }}
                  className="text-emerald-400/90 hover:text-emerald-300 p-1 cursor-pointer transition-colors"
                  title="Download Movie to Device or Save to Device Vault"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShareModalMovie(movie);
                  }}
                  className="text-slate-400 hover:text-[#F59E0B] p-1 cursor-pointer transition-colors"
                  title="Share Movie to WhatsApp or Copy Link"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleToggleWatchlist(movie.id);
                  }}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer transition-colors"
                  title={inList ? 'Remove from Watchlist' : 'Add to Watchlist'}
                >
                  {inList ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Bookmark className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
              {movie.synopsis}
            </p>
          </div>

          {/* Zero-Pill Metadata Footer with Star Rating & Viral Views & Comments */}
          <div className="pt-1 flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
            <span className="font-mono tabular-nums text-[#F59E0B] shrink-0 font-medium">
              ★ {avgStars}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-rose-400/95 shrink-0 font-medium">
              🔥 {movie.viewCount ? (movie.viewCount >= 1000000 ? `${(movie.viewCount / 1000000).toFixed(1)}M` : `${Math.round(movie.viewCount / 1000)}K`) : '850K'} views
            </span>
            {movie.commentsCount ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-300 shrink-0">
                  💬 {movie.commentsCount >= 1000 ? `${(movie.commentsCount / 1000).toFixed(1)}K` : movie.commentsCount} comments
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderSeriesCard = (s: MovieSeries, isHorizontalMobile = false) => {
    const eps = seriesEpisodesBySeriesId.get(s.id) || [];
    const firstEp = eps[0];
    const totalViews =
      s.totalViews || eps.reduce((acc, ep) => acc + (ep.viewCount || 0), 0);
    const seriesRating = (s.rating || 4.8).toFixed(1);
    const activeWatchPct = eps.reduce((maxPct, ep) => {
      const p = progressMap.get(ep.id);
      if (!p || !p.durationSeconds) return maxPct;
      return Math.max(
        maxPct,
        Math.min(100, Math.round((p.progressSeconds / p.durationSeconds) * 100))
      );
    }, 0);

    return (
      <div
        key={`series-${s.id}`}
        onClick={() => setActiveSeriesModal(s)}
        className={`group relative rounded-xl bg-[#0E1118] border border-white/10 hover:border-[#E11D48]/60 overflow-hidden transition-transform duration-150 hover:-translate-y-1 cursor-pointer flex flex-col ${
          isHorizontalMobile
            ? 'w-[78vw] max-w-[290px] sm:w-auto sm:max-w-none shrink-0 snap-start'
            : ''
        }`}
      >
        <div className="relative aspect-video w-full bg-black overflow-hidden">
          <CinemaPosterImage
            src={s.thumbnailUrl}
            fallbackVideoId={firstEp?.youtubeVideoId}
            alt={s.title}
            category={s.primaryCategory}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E1118] via-black/15 to-black/35 opacity-95" />

          <div className="absolute top-2.5 left-3 pointer-events-none">
            <span className="brand-luxury-red text-[10px] font-extrabold uppercase">
              TK STORYWORLD
            </span>
          </div>

          <div className="absolute top-2.5 right-3 pointer-events-none">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#090B10]/95 border border-[#F59E0B]/45 text-[#F59E0B]">
              {s.releaseYear || '2026'} Series
            </span>
          </div>

          <div className="absolute inset-0 flex items-center justify-center opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150 bg-black/20 sm:bg-black/40">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-lg transform sm:scale-95 sm:group-hover:scale-100 transition-transform">
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
            </div>
          </div>

          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-200">
            <span className="text-white font-semibold truncate">
              {s.genreTag || s.primaryCategory}
            </span>
            <span className="text-[#F59E0B] font-semibold shrink-0 ml-2">
              {eps.length === 1 ? 'Full Season' : `${eps.length} Episodes`}
            </span>
          </div>

          {activeWatchPct > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
              <div
                className="h-full bg-[#E11D48]"
                style={{ width: `${activeWatchPct}%` }}
              />
            </div>
          )}
        </div>

        <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
          <div>
            <h3 className="font-display text-sm font-semibold text-white group-hover:text-[#F59E0B] transition-colors line-clamp-1">
              {s.title}
            </h3>
            <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
              {s.synopsis}
            </p>
          </div>

          <div className="pt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-mono tabular-nums text-[#F59E0B] shrink-0 font-medium">
                ★ {seriesRating}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-rose-400/95 shrink-0 font-medium">
                {totalViews >= 1_000_000
                  ? `${(totalViews / 1_000_000).toFixed(1)}M views`
                  : `${Math.max(12, Math.round(totalViews / 1_000))}K views`}
              </span>
            </div>
            <span className="text-emerald-400 font-semibold shrink-0">
              {eps.length === 1 ? 'Watch Series' : 'Episodes →'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#050505] text-[#F8FAFC] flex flex-col">
      {/* CUSTOM RED LUXURY CINEMA SPLASH SCREEN */}
      {showSplashScreen && (
        <LuxurySplashScreen onFinish={() => setShowSplashScreen(false)} />
      )}

      {/* OFFLINE CONNECTIVITY INDICATOR */}
      <OfflineIndicator isOnline={isOnline} />

      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className={`sticky top-0 z-40 flex items-center justify-between gap-2 sm:gap-8 px-3 sm:px-10 py-3 sm:py-4 bg-[#050505] border-b border-white/10 ${activeModalMovie ? 'hidden' : ''}`}>
        {/* Zone 1: Single text element luxury red wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('home');
          }}
          className="brand-luxury-red text-base sm:text-2xl font-black uppercase whitespace-nowrap truncate min-w-0"
        >
          TK STORYWORLD
        </a>

        {/* Zone 2: Concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('home');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'home'
                ? 'text-white underline underline-offset-8 decoration-[#E11D48] decoration-2'
                : ''
            }`}
          >
            Home
          </a>
          <a
            href="#series"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('series');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'series'
                ? 'text-white underline underline-offset-8 decoration-[#E11D48] decoration-2'
                : ''
            }`}
          >
            2026 Series
          </a>
          <a
            href="#categories"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('categories');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'categories'
                ? 'text-white underline underline-offset-8 decoration-[#E11D48] decoration-2'
                : ''
            }`}
          >
            Categories
          </a>
          <a
            href="#saved"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('saved');
            }}
            className={`inline-flex items-center gap-1.5 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'saved'
                ? 'text-emerald-400 underline underline-offset-8 decoration-emerald-400 decoration-2 font-semibold'
                : 'text-emerald-400/95'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Saved Movies</span>
            {deviceDownloads.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold">
                {deviceDownloads.length}
              </span>
            )}
          </a>
          {isAdminAuthenticated ? (
            <a
              href="#admin"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('admin');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'admin'
                  ? 'text-white underline underline-offset-8 decoration-[#E11D48] decoration-2'
                  : ''
              }`}
            >
              Admin Console
            </a>
          ) : (
            <a
              href="#watchlist"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('watchlist');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'watchlist'
                  ? 'text-white underline underline-offset-8 decoration-[#E11D48] decoration-2'
                  : ''
              }`}
            >
              My Watchlist
            </a>
          )}
        </nav>

        {/* Zone 3: Install App (PWA) + Notification Bell + Primary Account Action */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {!isStandalone && (
            <button
              type="button"
              onClick={() => setShowPWAInstallModal(true)}
              className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl bg-[#14080E] hover:bg-[#220C16] border border-[#E11D48]/50 text-xs font-semibold text-white transition-colors cursor-pointer"
              title="Install TK STORYWORLD on Phone Home Screen"
            >
              <Download className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span className="hidden sm:inline">Install App</span>
            </button>
          )}

          {/* Quick 1-Tap Search Button for Mobile & Desktop */}
          <button
            type="button"
            onClick={focusVisibleSearchBar}
            className="p-2 sm:p-2.5 rounded-xl bg-[#0E1118] hover:bg-[#171C28] border border-white/15 text-slate-200 hover:text-white transition-colors cursor-pointer"
            title="Search Movies on App & Outside App"
            aria-label="Search Movies"
          >
            <Search className="w-4 h-4 text-slate-200" />
          </button>

          <button
            type="button"
            onClick={() => setShowNotifications((prev) => !prev)}
            className="relative p-2 sm:p-2.5 rounded-xl bg-[#0E1118] hover:bg-[#171C28] border border-white/15 text-slate-200 hover:text-white transition-colors cursor-pointer"
            title="New Releases (Last 48h) & Coming Soon"
            aria-label="New Releases and Coming Soon Notifications"
          >
            <Bell className="w-4 h-4 text-[#F59E0B]" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E11D48] text-white font-mono text-[10px] font-bold flex items-center justify-center shadow-lg">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setPendingMovieAfterAuth(null);
              setShowSearchAndAccountModal(true);
            }}
            className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-white bg-[#E11D48] hover:bg-[#BE123C] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isUserSignedIn ? 'Account' : 'Login'}
          </button>
        </div>
      </header>

      {/* Sticky Mobile Secondary Navigation Strip (Android & iPhone) */}
      <div className={`sticky top-[57px] sm:top-[65px] z-30 flex md:hidden items-center justify-between sm:justify-around gap-1 px-2 py-2 bg-[#0A0C12]/95 backdrop-blur-md border-b border-white/10 text-[11px] sm:text-xs font-medium text-slate-300 overflow-x-auto no-scrollbar ${activeModalMovie ? 'hidden' : ''}`}>
        {[
          { id: 'home', label: 'Home' },
          { id: 'series', label: '2026 Series' },
          {
            id: 'saved',
            label:
              deviceDownloads.length > 0
                ? `Saved (${deviceDownloads.length})`
                : 'Saved Movies',
          },
          { id: 'categories', label: 'Categories' },
          { id: 'watchlist', label: 'Watchlist' },
          ...(isAdminAuthenticated ? [{ id: 'admin', label: 'Admin' }] : []),
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id as NavView)}
            className={`px-2 py-1.5 rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === item.id
                ? item.id === 'saved'
                  ? 'text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-500/30'
                  : 'text-[#E11D48] font-bold bg-white/5'
                : item.id === 'saved'
                ? 'text-emerald-400 font-semibold'
                : ''
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* SMART MOBILE & DESKTOP PWA INSTALL BANNER */}
      <PWAInstallBanner
        isInstalled={isInstalled}
        isStandalone={isStandalone}
        isInstallable={isInstallable}
        isIOS={isIOS}
        onPromptInstall={promptInstall}
        onOpenGuideModal={() => setShowPWAInstallModal(true)}
      />

      {/* SHARED MOVIE DEEP-LINK INVITATION BANNER */}
      {sharedInviteMovie && (
        <div className="bg-gradient-to-r from-[#1A080E] via-[#0F131F] to-[#1A1206] border-b border-[#E11D48]/40 px-5 sm:px-10 py-3.5">
          <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="brand-luxury-red text-xs font-black uppercase shrink-0">
                TK STORYWORLD INVITE
              </span>
              <span className="text-xs sm:text-sm text-white font-medium truncate">
                You were invited to watch{' '}
                <strong className="text-[#F59E0B]">
                  "{sharedInviteMovie.title}"
                </strong>{' '}
                ({sharedInviteMovie.primaryCategory})
              </span>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => openMovieModal(sharedInviteMovie, true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold shadow cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isUserSignedIn
                    ? 'Watch Shared Movie Now'
                    : 'Sign Up / Login to Watch'}
                </span>
              </button>
              <button
                onClick={() => setShareModalMovie(sharedInviteMovie)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-slate-200 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>Share</span>
              </button>
              <button
                onClick={() => setSharedInviteMovie(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Dismiss invitation banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      <main className={`flex-1 ${activeModalMovie ? 'hidden' : ''}`}>
        {activeView === 'admin' ? (
          isAdminAuthenticated ? (
            <AdminDashboard
              accessToken={
                authSession?.access_token ||
                (isAdminAuthenticated ? currentUserEmail : null)
              }
              adminEmail={currentUserEmail}
              onCatalogueChanged={loadBootstrapData}
              onPlayPreview={(mov) => openMovieModal(mov, true)}
            />
          ) : (
            <section className="max-w-xl mx-auto px-5 py-20">
              <div className="rounded-2xl bg-[#0B0E15] border border-white/15 p-8 text-center space-y-5 shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-[#E11D48]/15 border border-[#E11D48]/30 text-[#E11D48] flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#F59E0B]">
                    Restricted Administrator Workspace
                  </div>
                  <h1 className="font-display text-2xl font-bold text-white">
                    Admin Console Locked
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Access to the TK STORYWORLD Admin Console, Discovery
                    Scheduler, and Supabase SQL operations is strictly locked to the
                    authenticated{' '}
                    <strong className="text-white">
                      okorotochukwu007@gmail.com
                    </strong>{' '}
                    Supabase Auth session.
                  </p>
                </div>

                {isUserSignedIn && (
                  <div className="px-4 py-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-200">
                    Currently signed in as{' '}
                    <strong>{currentUserEmail}</strong> (Viewer role). Please
                    sign in as <strong>okorotochukwu007@gmail.com</strong>.
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setShowSearchAndAccountModal(true)}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign In with Supabase Auth</span>
                  </button>
                  <button
                    onClick={() => setActiveView('home')}
                    className="px-4 py-3 rounded-xl border border-white/15 text-xs sm:text-sm text-slate-300 hover:text-white cursor-pointer"
                  >
                    Return to Cinema Home
                  </button>
                </div>
              </div>
            </section>
          )
        ) : activeView === 'nigerian' ? (
          <div className="pb-20 space-y-12">
            {/* Dedicated Nigerian & African AI Cinema Hero Banner */}
            {nigerianHeroMovie && (
              <section className="relative min-h-[64vh] w-full flex items-end overflow-hidden border-b border-white/10">
                <div className="absolute inset-0">
                  <CinemaPosterImage
                    src={nigerianHeroMovie.thumbnailUrl}
                    fallbackVideoId={nigerianHeroMovie.youtubeVideoId}
                    alt={nigerianHeroMovie.title}
                    category={nigerianHeroMovie.primaryCategory}
                    className="w-full h-full object-cover object-center scale-105"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(5,5,5,0.96) 0%, rgba(5,5,5,0.82) 48%, rgba(5,5,5,0.28) 100%), linear-gradient(180deg, rgba(5,5,5,0.25) 0%, rgba(5,5,5,0.92) 92%, #050505 100%)',
                    }}
                  />
                </div>

                <div className="relative z-10 max-w-[1400px] w-full mx-auto px-5 sm:px-10 pt-20 pb-12">
                  <div className="max-w-2xl space-y-4">
                    <div className="brand-luxury-red text-xs sm:text-sm font-black uppercase">
                      TK STORYWORLD · NIGERIAN &amp; AFRICAN CINEMA
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#F59E0B]">
                      <span>Nigerian &amp; African Cinema Hub</span>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span className="text-slate-200">
                        {cleanPublicCategoryLabel(nigerianHeroMovie.primaryCategory)}
                      </span>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span className="font-mono tabular-nums text-emerald-400">
                        {nigerianAndAfricanMovies.length} Verified Titles
                      </span>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {nigerianHeroMovie.durationFormatted}
                      </span>
                    </div>

                    <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.08]">
                      {nigerianHeroMovie.title}
                    </h1>

                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed line-clamp-3">
                      {nigerianHeroMovie.synopsis}
                    </p>

                    <div className="text-xs text-slate-400">
                      Creator Studio:{' '}
                      <span className="text-slate-200 font-medium">
                        {nigerianHeroMovie.channelTitle}
                      </span>{' '}
                      · Updated Automatically Every 6 Hours
                    </div>

                    <div className="pt-2 flex flex-wrap items-center gap-3.5">
                      <button
                        onClick={() => openMovieModal(nigerianHeroMovie, true)}
                        className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-semibold text-sm shadow-lg transition-all cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Watch Featured Nollywood Movie</span>
                      </button>

                      <button
                        onClick={() =>
                          void handleToggleWatchlist(nigerianHeroMovie.id)
                        }
                        className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm border border-white/15 backdrop-blur-md transition-all cursor-pointer"
                      >
                        {watchlistIds.has(nigerianHeroMovie.id) ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span>Saved in Watchlist</span>
                          </>
                        ) : (
                          <>
                            <Bookmark className="w-4 h-4" />
                            <span>Add to Watchlist</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setShareModalMovie(nigerianHeroMovie)}
                        className="inline-flex items-center gap-2 px-4 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs sm:text-sm border border-white/15 transition-all cursor-pointer"
                      >
                        <Share2 className="w-4 h-4 text-[#F59E0B]" />
                        <span>Share Movie</span>
                      </button>

                      <button
                        onClick={() => setActiveView('watchlist')}
                        className="inline-flex items-center gap-2 px-4 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium text-xs border border-white/10 transition-all cursor-pointer"
                      >
                        <span>My Watchlist ({watchlistMovies.length})</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Sub-Genre Filter Strip & Nigerian Catalogue */}
            <div className="max-w-[1400px] mx-auto px-5 sm:px-10 space-y-10">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-white/10">
                <div>
                  <div className="text-xs text-[#F59E0B] font-medium">
                    Lagos Billionaire Romance · Royal Folktale Romance · Maid & Prince Dramas
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white mt-1">
                    Nigerian &amp; African Love Stories ({filteredNigerianMovies.length})
                  </h2>
                </div>

                {/* Sub-Genre Filter Tabs */}
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    {
                      id: 'all',
                      label: `All Nigerian & African (${nigerianAndAfricanMovies.length})`,
                    },
                    {
                      id: 'lagos_billionaire',
                      label: `Lagos Billionaire Romance (${lagosBillionaireMovies.length})`,
                    },
                    {
                      id: 'royal_folktale',
                      label: `Royal Folktale Romance (${royalFolktaleMovies.length})`,
                    },
                    {
                      id: 'maid_prince',
                      label: `Maid & Prince Dramas (${maidPrinceMovies.length})`,
                    },
                    {
                      id: 'emotional_marriage',
                      label: `Marriage & Betrayal (${emotionalMarriageMovies.length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() =>
                        setNigerianSubGenre(
                          tab.id as
                            | 'all'
                            | 'lagos_billionaire'
                            | 'royal_folktale'
                            | 'maid_prince'
                            | 'emotional_marriage'
                        )
                      }
                      className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                        nigerianSubGenre === tab.id
                          ? 'bg-[#F59E0B] text-black font-semibold'
                          : 'bg-[#0E1118] text-slate-300 border border-white/10 hover:border-white/25'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {nigerianSubGenre === 'all' ? (
                <div className="space-y-12">
                  {/* Spotlight Rail 1: Lagos Billionaire & CEO Romance */}
                  {lagosBillionaireMovies.length > 0 && (
                    <section className="space-y-4">
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-xs text-[#F59E0B]">
                            Victoria Island · Lekki · Abuja Luxury Dramas
                          </div>
                          <h3 className="font-display text-xl font-bold text-white">
                            Lagos Billionaire & CEO Love Stories
                          </h3>
                        </div>
                        <button
                          onClick={() => setNigerianSubGenre('lagos_billionaire')}
                          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          <span>View All ({lagosBillionaireMovies.length})</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {lagosBillionaireMovies
                          .slice(0, 8)
                          .map((m) => renderMovieCard(m))}
                      </div>
                    </section>
                  )}

                  {/* Spotlight Rail 2: Royal Folktale Romance */}
                  {royalFolktaleMovies.length > 0 && (
                    <section className="space-y-4">
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-xs text-[#F59E0B]">
                            Ancient Kingdoms · Sacred Promises · Folktale Cinema
                          </div>
                          <h3 className="font-display text-xl font-bold text-white">
                            Royal Folktale Romance & Kingdom Chronicles
                          </h3>
                        </div>
                        <button
                          onClick={() => setNigerianSubGenre('royal_folktale')}
                          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          <span>View All ({royalFolktaleMovies.length})</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {royalFolktaleMovies
                          .slice(0, 8)
                          .map((m) => renderMovieCard(m))}
                      </div>
                    </section>
                  )}

                  {/* Spotlight Rail 3: Maid & Prince Dramas */}
                  {maidPrinceMovies.length > 0 && (
                    <section className="space-y-4">
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-xs text-[#F59E0B]">
                            Palace Intrigue · Forbidden Affection · Destiny
                          </div>
                          <h3 className="font-display text-xl font-bold text-white">
                            Maid & Prince Dramas
                          </h3>
                        </div>
                        <button
                          onClick={() => setNigerianSubGenre('maid_prince')}
                          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          <span>View All ({maidPrinceMovies.length})</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {maidPrinceMovies
                          .slice(0, 8)
                          .map((m) => renderMovieCard(m))}
                      </div>
                    </section>
                  )}

                  {/* Complete Nigerian & African AI Catalogue */}
                  <section className="space-y-4">
                    <div>
                      <div className="text-xs text-slate-400">
                        Complete Regional Library
                      </div>
                      <h3 className="font-display text-xl font-bold text-white">
                        All Nigerian &amp; African Movies ({nigerianAndAfricanMovies.length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                      {nigerianAndAfricanMovies.map((m) => renderMovieCard(m))}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {filteredNigerianMovies.map((m) => renderMovieCard(m))}
                </div>
              )}
            </div>
          </div>
        ) : activeView === 'saved' ? (
          <section className="max-w-[1400px] mx-auto px-5 sm:px-10 py-10 space-y-8">
            {/* SAVED MOVIES PAGE HEADER */}
            <div className="rounded-2xl bg-gradient-to-r from-[#091512] via-[#0B0F19] to-[#170910] border border-emerald-500/30 p-6 sm:p-8 space-y-6 shadow-2xl">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-2 max-w-2xl">
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                    <Download className="w-4 h-4" />
                    <span>
                      TK STORYWORLD · SAVED MOVIES VAULT ({deviceDownloads.length}{' '}
                      DOWNLOADED)
                    </span>
                  </div>
                  <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-white">
                    Saved Movies
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    All movies you download on TK STORYWORLD are stored right here in{' '}
                    <strong className="text-emerald-400">Saved Movies</strong> for
                    instant in-app access and playback on your phone or computer.
                  </p>
                </div>

                {/* Vault Storage Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
                  <div className="rounded-xl bg-black/50 border border-white/10 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Saved Movies
                    </div>
                    <div className="font-mono text-xl font-bold text-emerald-400 mt-0.5">
                      {deviceDownloads.length}
                    </div>
                  </div>
                  <div className="rounded-xl bg-black/50 border border-white/10 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      App Vault Size
                    </div>
                    <div className="font-mono text-xl font-bold text-[#F59E0B] mt-0.5">
                      {deviceDownloads.reduce(
                        (sum, item) => sum + (item.estimatedSizeMb || 0),
                        0
                      )}{' '}
                      MB
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1 rounded-xl bg-black/50 border border-white/10 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Vault Status
                    </div>
                    <div className="text-xs font-bold text-white mt-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>{isOnline ? 'Ready in App' : 'Offline Active'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ZERO-DATA OFFLINE CINEMA ACTION BANNER */}
              <div className="rounded-xl bg-gradient-to-r from-emerald-950/80 via-[#0B1512] to-slate-900 border border-emerald-500/40 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 shadow-lg">
                    <WifiOff className="w-6 h-6" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                        100% Offline Cinema · Zero Data Used
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div className="text-sm sm:text-base font-bold text-white">
                      Play Any Downloaded Movie on This Device Without Internet
                    </div>
                    <p className="text-xs text-slate-300 max-w-xl">
                      Turn off mobile data or turn on Airplane Mode. Open your downloaded movie file to play inside the TK STORYWORLD luxury cinema player with zero data, custom progress scrubber, and zero interruptions.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
                  <button
                    onClick={() => generalOfflineFileInputRef.current?.click()}
                    className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs sm:text-sm font-bold shadow-xl shadow-emerald-500/20 transition-all transform hover:scale-[1.02] cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>Play Device Video (0 Data)</span>
                  </button>
                  <input
                    ref={generalOfflineFileInputRef}
                    type="file"
                    accept="video/mp4,video/x-m4v,video/webm,video/mkv,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const baseMovie = movies[0] || INITIAL_MOVIES[0];
                        const customMovie: MovieItem = {
                          ...baseMovie,
                          id: `local-file-${Date.now()}`,
                          title: file.name.replace(/\.[^/.]+$/, ''),
                          synopsis: 'Local downloaded video file playing offline on your device in TK STORYWORLD with zero data consumed.',
                        };
                        openOfflinePlayer(customMovie, file);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Filter & Search Bar inside Saved Movies */}
              {deviceDownloads.length > 0 && (
                <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {(['all', '1080p FHD', '720p HD', '480p Fast'] as const).map((qFilter) => (
                      <button
                        key={qFilter}
                        onClick={() => setSavedQualityFilter(qFilter)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          savedQualityFilter === qFilter
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                        }`}
                      >
                        {qFilter === 'all'
                          ? `All Downloaded (${deviceDownloads.length})`
                          : qFilter}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={savedSearchQuery}
                      onChange={(e) => setSavedSearchQuery(e.target.value)}
                      placeholder="Search your saved movies..."
                      className="w-full pl-9 pr-8 py-2 rounded-xl bg-black/60 border border-white/15 text-base sm:text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                    />
                    {savedSearchQuery && (
                      <button
                        onClick={() => setSavedSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SAVED MOVIES GRID */}
            {deviceDownloads.length === 0 ? (
              <div className="space-y-8">
                <div className="rounded-2xl bg-[#0E1118] border border-emerald-500/25 p-10 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                    <Download className="w-7 h-7" />
                  </div>
                  <div className="space-y-1.5 max-w-lg mx-auto">
                    <h2 className="font-display text-xl font-bold text-white">
                      Your Saved Movies Page Is Ready
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      Tap the green{' '}
                      <span className="text-emerald-400 font-semibold">
                        Download
                      </span>{' '}
                      button on any movie card or inside the video player to store
                      movies right here in <strong className="text-white">Saved Movies</strong>.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => setActiveView('home')}
                      className="px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-bold cursor-pointer"
                    >
                      Browse 2026 Movies to Download
                    </button>
                    <button
                      onClick={() => setActiveView('watchlist')}
                      className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs sm:text-sm font-semibold cursor-pointer"
                    >
                      View My Watchlist
                    </button>
                  </div>
                </div>

                {/* Quick 1-Tap Download Recommendations */}
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-emerald-400 font-semibold">
                      Instant Save · Popular 2026 Blockbusters
                    </div>
                    <h3 className="font-display text-lg sm:text-xl font-bold text-white">
                      Recommended Movies to Download to Saved Movies
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {movies.slice(0, 8).map((m) => renderMovieCard(m))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {deviceDownloads
                  .filter((item) =>
                    savedQualityFilter === 'all'
                      ? true
                      : item.quality === savedQualityFilter
                  )
                  .filter((item) =>
                    !savedSearchQuery.trim()
                      ? true
                      : item.title
                          .toLowerCase()
                          .includes(savedSearchQuery.trim().toLowerCase()) ||
                        item.category
                          .toLowerCase()
                          .includes(savedSearchQuery.trim().toLowerCase())
                  )
                  .map((item) => {
                    const matchedMovie =
                      movies.find((m) => m.id === item.movieId) ||
                      ({
                        ...INITIAL_MOVIES[0],
                        id: item.movieId,
                        youtubeVideoId: item.youtubeVideoId,
                        title: item.title,
                        synopsis: `${item.category} blockbuster feature stored in your TK STORYWORLD Saved Movies page.`,
                        thumbnailUrl: item.thumbnailUrl,
                        backdropUrl: item.backdropUrl,
                        primaryCategory: item.category as MovieCategory,
                        secondaryCategories: [item.category as MovieCategory],
                        durationFormatted: item.durationFormatted,
                        publishedAt: item.downloadedAt,
                      } as MovieItem);

                    const savedProg = progressMap.get(item.movieId);
                    const savedPct =
                      savedProg && savedProg.durationSeconds > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (savedProg.progressSeconds /
                                savedProg.durationSeconds) *
                                100
                            )
                          )
                        : 0;

                    return (
                      <div
                        key={item.movieId}
                        className="rounded-xl overflow-hidden bg-[#0E1118] border border-emerald-500/35 flex flex-col justify-between shadow-lg hover:border-emerald-400 transition-colors"
                      >
                        <div
                          onClick={() => openMovieModal(matchedMovie, true)}
                          className="relative aspect-video bg-black cursor-pointer group overflow-hidden"
                        >
                          <CinemaPosterImage
                            src={item.backdropUrl || item.thumbnailUrl}
                            fallbackVideoId={item.youtubeVideoId}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-bold uppercase tracking-wider">
                            ✓ Saved · {item.quality} · {item.estimatedSizeMb} MB
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </div>
                          </div>
                          <div className="absolute bottom-2 right-2.5 text-[11px] font-mono text-white/90 bg-black/70 px-1.5 py-0.5 rounded">
                            {item.durationFormatted}
                          </div>
                          {savedPct > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                              <div
                                className="h-full bg-[#E11D48]"
                                style={{ width: `${savedPct}%` }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="font-display text-sm font-bold text-white line-clamp-2">
                              {item.title}
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-1">
                              {item.category} · Downloaded{' '}
                              {new Date(item.downloadedAt).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="flex flex-col gap-2 pt-1">
                            {/* Primary 100% Offline Zero-Data Play Button */}
                            <button
                              onClick={() => openOfflinePlayer(matchedMovie)}
                              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-950 transition-all cursor-pointer"
                              title="Play completely offline on this device with zero data"
                            >
                              <WifiOff className="w-3.5 h-3.5" />
                              <span>Play Offline (0 Data)</span>
                            </button>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openMovieModal(matchedMovie, true)}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold cursor-pointer border border-white/10"
                                title="Stream using Internet"
                              >
                                <Play className="w-3 h-3 fill-current text-rose-500" />
                                <span>Stream Online</span>
                              </button>
                              <button
                                onClick={() => setDownloadModalMovie(matchedMovie)}
                                className="px-2.5 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold cursor-pointer"
                                title="Download Quality & Backup Options"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  const updated = removeMovieFromDeviceVault(
                                    item.movieId
                                  );
                                  setDeviceDownloads(updated);
                                }}
                                className="px-2.5 py-2 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 text-slate-400 hover:text-rose-300 text-xs cursor-pointer"
                                title="Remove from Saved Movies"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
        ) : activeView === 'watchlist' ? (
          <section className="max-w-[1400px] mx-auto px-5 sm:px-10 py-10 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/10">
              <div>
                <div className="text-xs text-slate-400">
                  Personal Library & Saved Movies · {currentUserEmail}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1">
                  My Watchlist & Continue Watching
                </h1>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setActiveView('saved')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Open Saved Movies ({deviceDownloads.length})</span>
                </button>
                <button
                  onClick={() => setActiveView('categories')}
                  className="px-4 py-2 rounded-lg border border-white/15 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Explore All 12 Categories
                </button>
              </div>
            </div>

            {/* IN-APP DEVICE VAULT (DOWNLOADED ON THIS DEVICE) */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                    <Download className="w-5 h-5 text-emerald-400" />
                    <span>
                      Downloaded on This Device ({deviceDownloads.length})
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Movies saved to your In-App Device Vault or downloaded to your Phone / Computer storage.
                  </p>
                </div>
              </div>

              {deviceDownloads.length === 0 ? (
                <div className="rounded-2xl bg-[#0E1118] border border-emerald-500/20 p-8 text-center space-y-2.5">
                  <p className="text-sm text-slate-200 font-medium">
                    No movies saved in your Device Vault yet.
                  </p>
                  <p className="text-xs text-slate-400 max-w-lg mx-auto">
                    Click the green <span className="text-emerald-400 font-semibold">Download</span> button on any movie card or inside the theatre player to save it to your In-App Device Vault or download the file directly to your phone or computer.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {deviceDownloads.map((item) => {
                    const matchedMovie =
                      movies.find((m) => m.id === item.movieId) ||
                      ({
                        ...INITIAL_MOVIES[0],
                        id: item.movieId,
                        youtubeVideoId: item.youtubeVideoId,
                        title: item.title,
                        synopsis: `${item.category} blockbuster feature saved in your TK STORYWORLD Device Vault.`,
                        thumbnailUrl: item.thumbnailUrl,
                        backdropUrl: item.backdropUrl,
                        primaryCategory: item.category as MovieCategory,
                        secondaryCategories: [item.category as MovieCategory],
                        durationFormatted: item.durationFormatted,
                        publishedAt: item.downloadedAt,
                      } as MovieItem);

                    return (
                      <div
                        key={item.movieId}
                        className="rounded-xl overflow-hidden bg-[#0E1118] border border-emerald-500/30 flex flex-col justify-between shadow-lg"
                      >
                        <div
                          onClick={() => openMovieModal(matchedMovie, true)}
                          className="relative aspect-video bg-black cursor-pointer group overflow-hidden"
                        >
                          <CinemaPosterImage
                            src={item.backdropUrl || item.thumbnailUrl}
                            fallbackVideoId={item.youtubeVideoId}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-emerald-500/90 text-slate-950 text-[10px] font-bold uppercase tracking-wider">
                            {item.quality} · {item.estimatedSizeMb} MB
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-11 h-11 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </div>
                          </div>
                          <div className="absolute bottom-2 right-2.5 text-[11px] font-mono text-white/90 bg-black/70 px-1.5 py-0.5 rounded">
                            {item.durationFormatted}
                          </div>
                        </div>

                        <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="font-display text-sm font-bold text-white line-clamp-1">
                              {item.title}
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {item.category} · Saved{' '}
                              {new Date(item.downloadedAt).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => openMovieModal(matchedMovie, true)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Play Now</span>
                            </button>
                            <button
                              onClick={() => setDownloadModalMovie(matchedMovie)}
                              className="px-2.5 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold cursor-pointer"
                              title="Download file to device storage"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                const updated = removeMovieFromDeviceVault(
                                  item.movieId
                                );
                                setDeviceDownloads(updated);
                              }}
                              className="px-2.5 py-2 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 text-slate-400 hover:text-rose-300 text-xs cursor-pointer"
                              title="Remove from Device Vault"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {continueWatchingMovies.length > 0 && (
              <div className="space-y-4">
                <h2 className="font-display text-lg font-bold text-white">
                  Continue Watching Where You Stopped
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {continueWatchingMovies.map(({ movie }) =>
                    renderMovieCard(movie)
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h2 className="font-display text-lg font-bold text-white">
                Saved to Watchlist ({watchlistMovies.length})
              </h2>
              {watchlistMovies.length === 0 ? (
                <div className="rounded-2xl bg-[#0E1118] border border-white/10 p-12 text-center space-y-3">
                  <p className="text-sm text-slate-300">
                    Your personal watchlist is currently empty.
                  </p>
                  <button
                    onClick={() => setActiveView('home')}
                    className="px-5 py-2.5 rounded-lg bg-[#E11D48] text-white text-xs font-semibold cursor-pointer"
                  >
                    Browse Featured Movies
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {watchlistMovies.map((m) => renderMovieCard(m))}
                </div>
              )}
            </div>
          </section>
        ) : activeView === 'series' ? (
          <section className="max-w-[1400px] mx-auto px-4 sm:px-10 py-8 sm:py-10 space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-white/10">
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#F59E0B]">
                  2026 Limited Series &amp; Multi-Part Sagas · Auto-Next Episodes
                </div>
                <h1 className="font-display text-2xl sm:text-4xl font-bold text-white">
                  2026 Series Movies ({filteredSeries2026.length})
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                  Binge-watch 2026 Nollywood series, Crime &amp; Detective thrillers, Action &amp; Sci-Fi limited series, K-Dramas, and Horror mysteries—grouped cleanly by season and episode.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: `All 2026 Series (${series2026Items.length})` },
                    { id: 'nollywood', label: 'Nollywood' },
                    { id: 'crime_thriller', label: 'Crime & Thriller' },
                    { id: 'action_scifi', label: 'Action & Sci-Fi' },
                    { id: 'kdrama_asian', label: 'K-Drama' },
                    { id: 'horror_mystery', label: 'Horror & Mystery' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSeriesGenreFilter(tab.id)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      seriesGenreFilter === tab.id
                        ? 'bg-[#E11D48] text-white'
                        : 'bg-[#0E1118] border border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredSeries2026.length === 0 ? (
              <div className="rounded-2xl bg-[#0B0E15] border border-white/10 p-10 text-center space-y-3">
                <p className="text-sm text-slate-300">
                  No 2026 series matched this genre filter yet.
                </p>
                <button
                  type="button"
                  onClick={() => setSeriesGenreFilter('all')}
                  className="px-4 py-2 rounded-lg bg-[#E11D48] text-white text-xs font-semibold cursor-pointer"
                >
                  Show All 2026 Series
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {filteredSeries2026.map((s) => renderSeriesCard(s))}
              </div>
            )}
          </section>
        ) : activeView === 'categories' ? (
          <section className="max-w-[1400px] mx-auto px-5 sm:px-10 py-10 space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-white/10">
              <div>
                <div className="text-xs text-[#F59E0B] font-medium">
                  Structured Cinema Genre Directory
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1">
                  Browse Stories Arranged by Category & Genre
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Every story is classified by its true plot and title into dedicated romance, drama, and fantasy shelves.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Display Mode Toggle when viewing All Categories */}
                {selectedCategory === 'All Categories' && !searchQuery.trim() && (
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0E1118] border border-white/10">
                    <button
                      onClick={() => setCategoryDisplayMode('grouped')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        categoryDisplayMode === 'grouped'
                          ? 'bg-[#F59E0B] text-black font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Grouped by Genre
                    </button>
                    <button
                      onClick={() => setCategoryDisplayMode('grid')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        categoryDisplayMode === 'grid'
                          ? 'bg-[#F59E0B] text-black font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All in One Grid
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#0E1118] border border-white/10">
                  {[
                    { id: 'most_loved', label: 'Most Loved' },
                    { id: 'popularity', label: 'Most Popular' },
                    { id: 'release_date', label: 'Release Date' },
                    { id: 'recently_added', label: 'Recently Added' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setSortBy(opt.id as SortOption)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        sortBy === opt.id
                          ? 'bg-[#E11D48] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* VISIBLE SMART MOVIE SEARCH BAR (IN-APP + OUTSIDE-THE-APP EXPLORER) ON CATEGORY PAGE */}
            <CinemaSmartSearch
              query={searchQuery}
              onQueryChange={setSearchQuery}
              inAppMatches={filteredCategoryMovies}
              allAppMovies={movies}
              allAppMoviesCount={movies.length}
              watchlistIds={watchlistIds}
              onPlayMovie={handleSmartSearchPlayMovie}
              onDownloadMovie={handleSmartSearchDownloadMovie}
              onToggleWatchlist={handleSmartSearchToggleWatchlist}
              variant="categories"
              categoryLabel={selectedCategory}
              inputRef={activeView === 'categories' ? smartSearchInputRef : undefined}
              renderInAppCard={(mov) => renderMovieCard(mov)}
            />

            {/* Interactive 12-Category Segmented Selector with Live Genre Counts */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedCategory('All Categories')}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === 'All Categories'
                    ? 'bg-white text-black font-semibold'
                    : 'bg-[#0E1118] border border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                All Categories ({movies.length})
              </button>
              {MOVIE_CATEGORIES.map((cat) => {
                const count = categoryMoviesMap[cat]?.length || 0;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-[#E11D48] text-white font-semibold'
                        : 'bg-[#0E1118] border border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {cleanPublicCategoryLabel(cat)} ({count})
                  </button>
                );
              })}
            </div>

            {/* Active Genre Header Banner when a specific Category is selected */}
            {selectedCategory !== 'All Categories' && (
              <div className="rounded-2xl bg-[#0B0E15] border border-white/10 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-[#F59E0B] font-medium">
                    {GENRE_METADATA[selectedCategory]?.kicker || 'Curated Cinema Genre'}
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                    {cleanPublicCategoryLabel(selectedCategory)} ({filteredCategoryMovies.length} Stories)
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
                    {GENRE_METADATA[selectedCategory]?.description}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedCategory('All Categories');
                    setCategoryDisplayMode('grouped');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  View All Genres Grouped
                </button>
              </div>
            )}

            {/* GROUPED BY GENRE SECTIONS (Default when All Categories is active) */}
            {selectedCategory === 'All Categories' &&
            categoryDisplayMode === 'grouped' &&
            !searchQuery.trim() ? (
              <div className="space-y-12">
                {CORE_STORY_GENRES.map((genre) => {
                  const genreMovies = categoryMoviesMap[genre] || [];
                  if (genreMovies.length === 0) return null;
                  const meta = GENRE_METADATA[genre];
                  return (
                    <section
                      key={genre}
                      className="rounded-2xl bg-[#090B10] border border-white/10 p-6 sm:p-7 space-y-5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-white/10">
                        <div>
                          <div className="text-xs text-[#F59E0B] font-medium">
                            {meta.kicker}
                          </div>
                          <h2 className="font-display text-xl sm:text-2xl font-bold text-white mt-0.5">
                            {cleanPublicCategoryLabel(genre)}{' '}
                            <span className="text-sm font-mono font-normal text-slate-400">
                              ({genreMovies.length})
                            </span>
                          </h2>
                          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                            {meta.description}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedCategory(genre)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0E1118] hover:bg-[#E11D48] text-xs font-semibold text-slate-200 hover:text-white border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <span>See All {genreMovies.length} in {cleanPublicCategoryLabel(genre)}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {genreMovies.slice(0, 8).map((m) => renderMovieCard(m))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : filteredCategoryMovies.length === 0 ? (
              <div className="rounded-xl bg-[#0E1118] border border-white/10 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs sm:text-sm text-slate-300">
                  No exact in-app match inside "{selectedCategory}"
                  {searchQuery ? ` for "${searchQuery}"` : ''} — explore global results above or reset category filter.
                </p>
                <button
                  onClick={() => {
                    setSelectedCategory('All Categories');
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 rounded-lg bg-[#E11D48] text-white text-xs font-semibold cursor-pointer self-start sm:self-auto shrink-0"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {searchQuery.trim() && (
                  <h2 className="font-display text-lg font-bold text-white">
                    On TK STORYWORLD ({selectedCategory}) Matching "{searchQuery.trim()}" ({filteredCategoryMovies.length})
                  </h2>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {filteredCategoryMovies.map((m) => renderMovieCard(m))}
                </div>
              </div>
            )}
          </section>
        ) : (
          /* HOME VIEW: NETFLIX-STYLE STREAMING INTERFACE ARRANGED BY GENRE */
          <div className="space-y-10 pb-16">
            {/* VISIBLE SMART MOVIE SEARCH BAR (IN-APP + OUTSIDE-THE-APP EXPLORER) ON HOME PAGE */}
            <section className="max-w-[1400px] mx-auto px-4 sm:px-10 pt-4 sm:pt-5 scroll-mt-32">
              <CinemaSmartSearch
                query={searchQuery}
                onQueryChange={setSearchQuery}
                inAppMatches={homeSearchMatches}
                allAppMovies={movies}
                allAppMoviesCount={movies.length}
                watchlistIds={watchlistIds}
                onPlayMovie={handleSmartSearchPlayMovie}
                onDownloadMovie={handleSmartSearchDownloadMovie}
                onToggleWatchlist={handleSmartSearchToggleWatchlist}
                variant="home"
                inputRef={activeView === 'home' ? smartSearchInputRef : undefined}
                renderInAppCard={(mov) => renderMovieCard(mov)}
              />
            </section>

            {/* 1. CINEMATIC RECENT 2026 MOVIE HERO BANNER */}
            {featuredMovie && (
              <section className="relative w-full min-h-[460px] sm:min-h-[560px] lg:min-h-[650px] flex items-end overflow-hidden border-b border-white/10 bg-[#050505]">
                <div className="absolute inset-0">
                  <CinemaPosterImage
                    src={featuredMovie.backdropUrl || featuredMovie.thumbnailUrl}
                    fallbackVideoId={featuredMovie.youtubeVideoId}
                    alt={featuredMovie.title}
                    category={featuredMovie.primaryCategory}
                    className="w-full h-full object-cover object-center brightness-95 contrast-105"
                  />
                  {/* Balanced Contrast Scrims so the Recent 2026 Movie Banner shines clearly while text stays crisp */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/70 to-black/10" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/30 to-transparent" />
                </div>

                <div className="relative z-10 max-w-[1400px] w-full mx-auto px-4 sm:px-10 py-8 sm:py-14 space-y-6 sm:space-y-8">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
                    <div className="lg:col-span-7 xl:col-span-8 space-y-4">
                      {/* Luxury Red Brand Marquee + Star Hook Badge */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="brand-luxury-red text-xs sm:text-sm font-black uppercase">
                          TK STORYWORLD · 2026 BLOCKBUSTER PREMIERE
                        </span>
                        {featuredMovie.hookTag && (
                          <span className="px-2.5 py-0.5 rounded-md bg-[#E11D48] text-white text-[11px] font-bold tracking-wide shadow-md">
                            {featuredMovie.hookTag}
                          </span>
                        )}
                      </div>

                      {/* Unboxed Kicker Metadata */}
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-200">
                        <span className="text-[#F59E0B] font-bold">
                          #{(heroSpotlightIdx % Math.max(1, heroSpotlightMovies.length)) + 1} Recent 2026 Movie
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-rose-400 font-mono font-bold">
                          🔥 {(featuredMovie.viewCount / 1000000).toFixed(1)}M Views
                        </span>
                        {isFreeGrowthMode && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400 font-semibold">
                              100% Free Full Movie
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{featuredMovie.primaryCategory}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {featuredMovie.durationFormatted}
                        </span>
                      </div>

                      <h1
                        className="font-display font-extrabold text-white tracking-tight leading-[1.08] drop-shadow-lg break-words"
                        style={{ fontSize: 'clamp(1.65rem, 5vw, 3.5rem)' }}
                      >
                        {featuredMovie.title}
                      </h1>

                      <p className="text-slate-200 text-sm sm:text-base leading-relaxed max-w-[62ch] line-clamp-3">
                        {featuredMovie.synopsis}
                      </p>

                      <div className="pt-2 flex flex-wrap items-center gap-2.5 sm:gap-3">
                        <button
                          onClick={() => openMovieModal(featuredMovie, true)}
                          className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-bold shadow-lg transition-transform hover:scale-105 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Watch Full Movie Now</span>
                        </button>

                        <button
                          onClick={() => openMovieModal(featuredMovie, false)}
                          className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-[#0B0E17]/90 hover:bg-[#151A28] border border-white/20 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Info className="w-4 h-4 text-[#F59E0B]" />
                          <span>Movie Details</span>
                        </button>

                        <button
                          onClick={() => handleToggleWatchlist(featuredMovie.id)}
                          className="inline-flex items-center gap-2 px-4 py-3.5 rounded-xl bg-[#0B0E17]/80 hover:bg-[#151A28] border border-white/15 text-slate-200 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {watchlistIds.has(featuredMovie.id) ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span>In Watchlist</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="w-4 h-4" />
                              <span>Save</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => setDownloadModalMovie(featuredMovie)}
                          className="inline-flex items-center gap-2 px-4 py-3.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Download className="w-4 h-4 text-emerald-400" />
                          <span>Download</span>
                        </button>

                        <button
                          onClick={() => setShareModalMovie(featuredMovie)}
                          className="inline-flex items-center gap-2 px-4 py-3.5 rounded-xl bg-[#0B0E17]/80 hover:bg-[#151A28] border border-white/15 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Share2 className="w-4 h-4 text-[#F59E0B]" />
                          <span>Share</span>
                        </button>
                      </div>
                    </div>

                    {/* Right-Side Crisp HD Widescreen Movie Poster Card (Desktop) */}
                    <div className="hidden lg:block lg:col-span-5 xl:col-span-4">
                      <div
                        onClick={() => openMovieModal(featuredMovie, true)}
                        className="group relative aspect-video w-full rounded-2xl overflow-hidden border-2 border-white/20 hover:border-[#E11D48] bg-black shadow-2xl cursor-pointer transition-transform hover:scale-[1.02]"
                      >
                        <CinemaPosterImage
                          src={featuredMovie.backdropUrl || featuredMovie.thumbnailUrl}
                          fallbackVideoId={featuredMovie.youtubeVideoId}
                          alt={featuredMovie.title}
                          category={featuredMovie.primaryCategory}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 flex items-center justify-center">
                          <div className="w-14 h-14 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                            <Play className="w-6 h-6 fill-current ml-0.5" />
                          </div>
                        </div>
                        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/85 border border-white/15 text-[11px] font-bold text-[#F59E0B]">
                          🎬 Tap to Stream in HD
                        </div>
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs font-mono text-white bg-black/75 px-3 py-1.5 rounded-lg">
                          <span className="truncate font-sans font-bold">
                            {featuredMovie.hookTag || '2026 US Hit'}
                          </span>
                          <span className="text-emerald-400 shrink-0 ml-2">
                            {featuredMovie.durationFormatted}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Recent 2026 Movie Banner Selector Strip */}
                  {heroSpotlightMovies.length > 1 && (
                    <div className="pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                          🔥 Featured Recent 2026 Movie Banners (Tap to Switch Spotlight)
                        </span>
                        <span className="text-[11px] font-mono text-[#F59E0B]">
                          Spotlight {heroSpotlightIdx + 1} of {heroSpotlightMovies.length}
                        </span>
                      </div>
                      <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-2.5 pb-1 sm:pb-0 sm:grid sm:grid-cols-3 lg:grid-cols-6">
                        {heroSpotlightMovies.map((spotMovie, idx) => {
                          const isSelected = idx === heroSpotlightIdx;
                          return (
                            <button
                              key={spotMovie.id}
                              type="button"
                              onClick={() => setHeroSpotlightIdx(idx)}
                              className={`group relative w-[200px] sm:w-auto shrink-0 snap-start rounded-xl overflow-hidden border text-left transition-all cursor-pointer flex items-center gap-2.5 p-1.5 ${
                                isSelected
                                  ? 'bg-[#18121E] border-[#E11D48] ring-1 ring-[#E11D48]'
                                  : 'bg-[#0B0D14]/90 border-white/10 hover:border-white/30'
                              }`}
                            >
                              <div className="relative w-14 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
                                <CinemaPosterImage
                                  src={spotMovie.thumbnailUrl}
                                  fallbackVideoId={spotMovie.youtubeVideoId}
                                  alt={spotMovie.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 flex-1 pr-1">
                                <div className="font-display text-[11px] font-bold text-white truncate">
                                  {spotMovie.title}
                                </div>
                                <div className="text-[10px] text-[#F59E0B] truncate">
                                  {spotMovie.hookTag || '2026 US Hit'}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            <div className="max-w-[1400px] mx-auto px-4 sm:px-10 space-y-10 sm:space-y-12">
              {/* NETFLIX-STYLE CONTINUE WATCHING RAIL (PERSISTED LOCALLY ACROSS CATALOG & SMART SEARCH) */}
              {continueWatchingMovies.length > 0 && !searchQuery.trim() && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                        Continue Watching
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Pick up right where you stopped · Saved automatically on this device
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearContinueWatching}
                      className="text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Clear history
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:pb-0">
                    {continueWatchingMovies.slice(0, 8).map(({ movie, progress }) => {
                      const pct = Math.min(
                        99,
                        Math.max(
                          2,
                          Math.round(
                            (progress.progressSeconds /
                              Math.max(1, progress.durationSeconds)) *
                              100
                          )
                        )
                      );
                      const remainingLabel = formatRemainingTimeLabel(
                        progress.progressSeconds,
                        progress.durationSeconds
                      );
                      return (
                        <div
                          key={movie.id}
                          onClick={() =>
                            openMovieModal(
                              movie,
                              true,
                              continueWatchingMovies.map((item) => item.movie)
                            )
                          }
                          className="group relative w-[270px] sm:w-auto shrink-0 snap-start rounded-xl bg-[#0E1118] border border-white/10 hover:border-[#E11D48]/60 overflow-hidden cursor-pointer transition-all"
                        >
                          <div className="relative aspect-video bg-black overflow-hidden">
                            <CinemaPosterImage
                              src={movie.thumbnailUrl}
                              fallbackVideoId={movie.youtubeVideoId}
                              alt={movie.title}
                              category={movie.primaryCategory}
                              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/15" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-11 h-11 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                              </div>
                            </div>
                            <button
                              type="button"
                              aria-label={`Remove ${movie.title} from Continue Watching`}
                              title="Remove from Continue Watching"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveContinueWatching(movie.id);
                              }}
                              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/75 hover:bg-black text-slate-300 hover:text-white border border-white/15 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                              <div
                                className="h-full bg-[#E11D48]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <div className="p-3.5 space-y-1">
                            <div className="font-display text-sm font-semibold text-white truncate">
                              {movie.title}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
                              <span>
                                {pct}% watched · {remainingLabel}
                              </span>
                              <span className="text-[#E11D48] font-sans font-semibold shrink-0">
                                Resume
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* VIRAL WHATSAPP INVITE & LIVE VIEWER GROWTH BANNER */}
              <section className="rounded-2xl bg-gradient-to-r from-[#0E131F] via-[#150B14] to-[#0A1612] border border-white/10 p-4 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold shrink-0 mt-0.5 sm:mt-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    LIVE 2026 CINEMA
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-white">
                      Enjoying TK STORYWORLD? Invite your friends on WhatsApp to watch 2026 Blockbusters &amp; Nollywood Movies for free!
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Every 2026 movie opens with a direct instant-play link on www.tkstoryworld.name.ng
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      '🎬 Watch Brand-New 2026 Hollywood & Nollywood Movies 100% FREE on TK STORYWORLD!\n\n👉 Stream Now: https://www.tkstoryworld.name.ng/'
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold shadow-lg transition-transform hover:scale-105 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Invite Friends on WhatsApp</span>
                  </a>
                </div>
              </section>

              {/* TRENDING 2026 MOVIES — FEATURED FIRST ON HOME TO ATTRACT VIEWERS (ZERO DUPLICATES) */}
              {homeUniqueSections.trending2026.length > 0 && (
                <section className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E11D48]">
                        <span>🔥 Trending 2026 Movies</span>
                        <span className="text-amber-400 font-mono">
                          · Hot Right Now
                        </span>
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-bold text-white mt-1">
                        Trending 2026 Full Movies
                      </h2>
                      <p className="text-xs text-slate-400">
                        Most-watched 2026 Hollywood, Nollywood, and Action blockbusters ranked by viewer watch counts and reactions
                      </p>
                    </div>

                    {/* Clean 2026 Movie Filter Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                      {[
                        { id: 'all', label: 'All 2026 Hits' },
                        { id: 'hollywood', label: 'Hollywood 2026' },
                        { id: 'action', label: '2026 Action' },
                        { id: 'nollywood', label: 'Nollywood 2026' },
                        { id: 'scifi', label: 'Sci-Fi & Thriller' },
                      ].map((mood) => (
                        <button
                          key={mood.id}
                          onClick={() => setAddictionMood(mood.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                            addictionMood === mood.id
                              ? 'bg-[#E11D48] text-white shadow-md shadow-rose-950/40'
                              : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                          }`}
                        >
                          {mood.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {homeUniqueSections.trending2026.map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* TRENDING 2026 SERIES MOVIES — GROUPED BINGE-READY SERIES (ZERO DUPLICATES) */}
              {series2026Items.length > 0 && (
                <section className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
                        2026 Series Spotlight · Multi-Episode Binge
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-bold text-white mt-1">
                        Trending 2026 Series Movies ({series2026Items.length})
                      </h2>
                      <p className="text-xs text-slate-400">
                        Nollywood series, K-Drama premieres, Crime mysteries, and Sci-Fi limited series grouped by season &amp; episode
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('series');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="text-xs text-[#F59E0B] hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0 font-semibold"
                    >
                      <span>Explore All 2026 Series</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {series2026Items.slice(0, 8).map((s) => renderSeriesCard(s, true))}
                  </div>
                </section>
              )}

              {/* "JUST DROPPED IN 2026" HUB (DEDUPLICATED AGAINST HOME SECTIONS) */}
              <JustDropped2026Hub
                allMovies={home2026Movies}
                excludeMovieKeys={homeUniqueSections.claimedKeys}
                onPlayMovie={(mov) => openMovieModal(mov, true)}
              />

              {/* TODAY'S DAILY 2026 MOVIE DROP (UNIQUE NON-DUPLICATE 2026 TITLES) */}
              {homeUniqueSections.dailyDrop2026.length > 0 && (
                <section className="rounded-2xl bg-gradient-to-b from-[#130911] to-[#080A10] border border-[#E11D48]/30 p-4 sm:p-6 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#E11D48] text-white uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          Daily 2026 Drop · {todayDateLabel}
                        </span>
                        <span className="font-mono text-emerald-400">
                          ● Next Automated Drop in {nextDropCountdown}
                        </span>
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                        Today’s Featured 2026 Full Movies
                      </h2>
                      <p className="text-xs text-slate-300">
                        Automatically synced daily into the TK STORYWORLD cinema player so viewers always find fresh 2026 full-length hits in one seamless app.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleTriggerDailySync}
                        disabled={dailySyncing}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-60 text-white text-xs font-bold shadow-lg transition-colors cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            dailySyncing ? 'animate-spin' : ''
                          }`}
                        />
                        <span>
                          {dailySyncing
                            ? 'Scanning Today’s Trends...'
                            : 'Refresh Today’s Trending Drops'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* In-App Cinema Server Filter Tabs */}
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                    {(
                      [
                        { id: 'all', label: `All 2026 Movies (${home2026Movies.length})`, count: home2026Movies.length },
                        { id: 'youtube', label: `HD Stream 1 (${sourcePlatformCounts.youtube})`, count: sourcePlatformCounts.youtube },
                        { id: 'dailymotion', label: `HD Stream 2 (${sourcePlatformCounts.dailymotion})`, count: sourcePlatformCounts.dailymotion },
                        { id: 'vimeo', label: `HD Stream 3 (${sourcePlatformCounts.vimeo})`, count: sourcePlatformCounts.vimeo },
                        { id: 'archive', label: `HD Stream 4 (${sourcePlatformCounts.archive})`, count: sourcePlatformCounts.archive },
                      ] as const
                    )
                      .filter((t) => t.id === 'all' || t.count > 0)
                      .map((srcTab) => (
                        <button
                          key={srcTab.id}
                          type="button"
                          onClick={() => setDailySourceFilter(srcTab.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            dailySourceFilter === srcTab.id
                              ? 'bg-white text-black shadow'
                              : 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          {srcTab.label}
                        </button>
                      ))}
                  </div>

                  {dailySyncStatus && (
                    <div className="px-3.5 py-2 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between gap-2">
                      <span>✨ {dailySyncStatus}</span>
                      <button
                        type="button"
                        onClick={() => setDailySyncStatus(null)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
                    {homeUniqueSections.dailyDrop2026.map((m, idx) => {
                      const cleanHookTag = (m.hookTag || '2026 Full Movie')
                        .replace(/\b(YouTube|Dailymotion|Vimeo)\b/gi, '')
                        .replace(/[·•|/-]+\s*(DM|YT|VM)\b/gi, '')
                        .replace(/\s*[·•|]\s*[·•|]\s*/g, ' · ')
                        .replace(/^\s*[·•|-]+\s*|\s*[·•|-]+\s*$/g, '')
                        .trim();
                      return (
                        <div
                          key={`daily-drop-${m.id}-${dailyDropOffset}`}
                          onClick={() => openMovieModal(m, true)}
                          className="group relative w-[245px] sm:w-auto shrink-0 snap-start rounded-xl bg-[#0D1017] border border-white/15 hover:border-[#F59E0B] overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 flex flex-col"
                        >
                          <div className="relative aspect-video w-full bg-black overflow-hidden">
                            <CinemaPosterImage
                              src={m.backdropUrl || m.thumbnailUrl}
                              fallbackVideoId={m.youtubeVideoId}
                              alt={m.title}
                              category={m.primaryCategory}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0D1017] via-black/15 to-black/30" />
                            <div className="absolute top-2 left-2 flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-[#F59E0B] text-black font-mono text-[10px] font-black uppercase">
                                FULL #{idx + 1}
                              </span>
                              <span className="px-1.5 py-0.5 rounded border text-[9.5px] font-extrabold uppercase bg-black/85 bg-emerald-500/20 border-emerald-400/40 text-emerald-300">
                                HD
                              </span>
                            </div>
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/85 border border-emerald-500/40 text-emerald-400 font-mono text-[10px] font-bold">
                              +{580 - idx * 45}K views
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-black/25">
                              <div className="w-10 h-10 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-lg">
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                              </div>
                            </div>
                            <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] font-mono text-white">
                              <span className="font-sans font-bold text-[#F59E0B] truncate">
                                {cleanHookTag || '2026 Full Movie'}
                              </span>
                              <span className="shrink-0 ml-2">
                                {m.durationFormatted}
                              </span>
                            </div>
                          </div>
                          <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5">
                            <h3 className="font-display text-xs sm:text-sm font-bold text-white group-hover:text-[#F59E0B] line-clamp-1">
                              {m.title}
                            </h3>
                            <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                              <span className="text-rose-400 font-semibold">
                                🔥 {m.viewCount >= 1000000 ? `${(m.viewCount / 1000000).toFixed(1)}M` : `${Math.max(12, Math.round(m.viewCount / 1000))}K`} total
                              </span>
                              <span className="text-emerald-400 font-sans font-semibold">
                                Stream HD →
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* TOP 2026 MOVIES IN TK STORYWORLD TODAY (ZERO DUPLICATES) */}
              {homeUniqueSections.top102026.length >= 4 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-wider text-[#E11D48]">
                        🏆 Daily 2026 Box Office · Updated Live
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-bold text-white mt-0.5">
                        Top {homeUniqueSections.top102026.length} 2026 Movies in TK STORYWORLD Today
                      </h2>
                      <p className="text-xs text-slate-400">
                        More top-ranked 2026 full-length movies our audience is streaming right now
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCategory('New Movies');
                        setActiveView('categories');
                      }}
                      className="text-xs text-[#F59E0B] hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0 font-semibold"
                    >
                      <span>See All {home2026NewMovies.length} 2026 Movies</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-stretch gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                    {homeUniqueSections.top102026.map((m, idx) => (
                      <div
                        key={`top10-${m.id}`}
                        onClick={() => openMovieModal(m, true)}
                        className="group relative w-[250px] sm:w-[275px] shrink-0 snap-start rounded-xl bg-[#0E1118] border border-white/10 hover:border-[#E11D48] overflow-hidden cursor-pointer transition-all hover:-translate-y-1 flex flex-col"
                      >
                        <div className="relative aspect-video w-full bg-black overflow-hidden">
                          <CinemaPosterImage
                            src={m.thumbnailUrl}
                            fallbackVideoId={m.youtubeVideoId}
                            alt={m.title}
                            category={m.primaryCategory}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#0E1118] via-black/20 to-black/30" />

                          {/* Giant Top Rank Badge */}
                          <div className="absolute top-2 left-2.5 px-2.5 py-0.5 rounded-lg bg-[#E11D48] text-white font-display text-xs font-black tracking-wider shadow-lg">
                            TOP #{idx + 1}
                          </div>

                          {/* Live Watching Indicator */}
                          <div className="absolute top-2 right-2.5 px-2 py-0.5 rounded-md bg-[#090B10]/95 border border-emerald-500/40 text-emerald-400 font-mono text-[10px] font-bold">
                            ● {(1950 - idx * 115).toLocaleString()} watching
                          </div>

                          {/* Play Button */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-black/25">
                            <div className="w-10 h-10 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-lg">
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            </div>
                          </div>

                          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-slate-200">
                            <span className="text-[#F59E0B] font-semibold">
                              2026 Release
                            </span>
                            <span>{m.durationFormatted}</span>
                          </div>
                        </div>

                        <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                          <div>
                            <h3 className="font-display text-sm font-bold text-white group-hover:text-[#F59E0B] line-clamp-1">
                              {m.title}
                            </h3>
                            <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                              {m.synopsis}
                            </p>
                          </div>
                          <div className="pt-1 flex items-center justify-between text-[11px] font-mono text-rose-400">
                            <span>
                              🔥 {(m.viewCount / 1000000).toFixed(1)}M views
                            </span>
                            <span className="text-emerald-400 font-sans font-semibold">
                              Watch Now →
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 2026 NOLLYWOOD & AFRICAN CINEMA (UNIQUE TITLES ONLY) */}
              {homeUniqueSections.nollywood2026.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#F59E0B] font-semibold uppercase tracking-wider">
                        🇳🇬 Fresh 2026 Nollywood Premieres
                      </div>
                      <h2 className="font-display text-xl font-bold text-white mt-0.5">
                        2026 Nollywood &amp; African Movies ({homeUniqueSections.nollywood2026.length})
                      </h2>
                      <p className="text-xs text-slate-400">
                        Brand-new 2026 Nigerian full movies starring top Nollywood actors
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSearchQuery('Nollywood Movies 2026');
                        window.setTimeout(() => {
                          smartSearchInputRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center',
                          });
                        }, 80);
                      }}
                      className="text-xs text-[#F59E0B] hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Discover More Nollywood 2026</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {homeUniqueSections.nollywood2026.map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* 2026 ACTION & SCI-FI BLOCKBUSTERS (UNIQUE TITLES ONLY) */}
              {homeUniqueSections.action2026.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#E11D48] font-semibold">
                        {GENRE_METADATA['Action Movies'].kicker} · 2026 Releases
                      </div>
                      <h2 className="font-display text-xl font-bold text-white">
                        2026 Action Movies &amp; Sci-Fi Blockbusters
                      </h2>
                      <p className="text-xs text-slate-400">
                        {GENRE_METADATA['Action Movies'].description}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCategory('Action Movies');
                        setActiveView('categories');
                      }}
                      className="text-xs text-[#F59E0B] hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Explore ({home2026ActionMovies.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {homeUniqueSections.action2026.map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* MORE NEW 2026 BLOCKBUSTERS (UNIQUE TITLES ONLY) */}
              {homeUniqueSections.newBlockbusters2026.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#E11D48] font-bold uppercase tracking-wider">
                        🇺🇸 2026 Hollywood &amp; International Releases
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-bold text-white mt-0.5">
                        New 2026 Blockbusters ({homeUniqueSections.newBlockbusters2026.length})
                      </h2>
                      <p className="text-xs text-slate-400">
                        Full-length 2026 Hollywood and international movies with verified HD streaming
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCategory('New Movies');
                        setActiveView('categories');
                      }}
                      className="text-xs text-[#F59E0B] hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0 font-semibold"
                    >
                      <span>View All {home2026NewMovies.length} 2026 Movies</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {homeUniqueSections.newBlockbusters2026.map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* MOST LOVED 2026 MOVIES BY VIEWERS (UNIQUE TITLES ONLY) */}
              {homeUniqueSections.mostLoved2026.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-[#E11D48] font-semibold">
                        <Heart className="w-3.5 h-3.5 fill-current" />
                        <span>Audience Favorites · 2026</span>
                      </div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Most Loved 2026 Movies
                      </h2>
                      <p className="text-xs text-slate-400">
                        Highest-rated 2026 full-length movies based on viewer hearts, star ratings, and reviews
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCategory('New Movies');
                        setCategoryDisplayMode('grid');
                        setSortBy('most_loved');
                        setActiveView('categories');
                      }}
                      className="text-xs text-[#F59E0B] hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Sort All</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {homeUniqueSections.mostLoved2026.map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </main>

      {/* CLEAN EDITORIAL FOOTER WITH CRAWLABLE SEO CATEGORY LANDING LINKS */}
      <footer className={`border-t border-white/10 bg-[#050505] py-8 pb-24 md:pb-8 px-4 sm:px-10 ${activeModalMovie ? 'hidden' : ''}`}>
        <div className="max-w-[1400px] mx-auto space-y-5">
          {/* SEO Category Landing Directory */}
          <nav
            aria-label="Browse Free Movie Categories"
            className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 pb-5 border-b border-white/10 text-xs text-slate-400"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">
              Explore:
            </span>
            {SEO_CATEGORY_PAGES.map((catPage) => (
              <a
                key={catPage.slug}
                href={catPage.path}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveView(catPage.view);
                  if (catPage.view === 'categories') {
                    setSelectedCategory(
                      catPage.categoryKey as MovieCategory | 'All Categories'
                    );
                  }
                  try {
                    window.history.pushState({}, '', catPage.path);
                  } catch {
                    // ignore
                  }
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="hover:text-white transition-colors"
              >
                {catPage.label}
              </a>
            ))}
          </nav>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div>
              <span className="brand-luxury-red text-sm font-black uppercase">
                TK STORYWORLD
              </span>{' '}
              · 2026 Global &amp; Nollywood Movie Streaming Platform
            </div>
            <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6">
              <a
                href="/nollywood"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveView('nigerian');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="hover:text-slate-300 cursor-pointer"
              >
                Nollywood
              </a>
              <a
                href="/2026-series"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveView('series');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="hover:text-slate-300 cursor-pointer"
              >
                2026 Series
              </a>
              <a
                href="/categories"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveView('categories');
                  setSelectedCategory('All Categories');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="hover:text-slate-300 cursor-pointer"
              >
                Categories
              </a>
              <button
                onClick={() => setActiveView('saved')}
                className="hover:text-slate-300 cursor-pointer"
              >
                Saved Movies
              </button>
              {isAdminAuthenticated && (
                <button
                  onClick={() => setActiveView('admin')}
                  className="hover:text-slate-300 cursor-pointer"
                >
                  Admin Console
                </button>
              )}
              <button
                onClick={() => setShowPWAInstallModal(true)}
                className="text-[#F59E0B] hover:text-amber-300 font-semibold cursor-pointer"
              >
                Install Mobile App
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* FIXED BOTTOM MOBILE THUMB NAVIGATION BAR (For One-Handed Phone Viewing) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className={`fixed bottom-0 inset-x-0 z-40 md:hidden bg-[#07090F] border-t border-white/10 px-2 py-1.5 flex items-center justify-around ${activeModalMovie ? 'hidden' : ''}`}
      >
        <button
          type="button"
          onClick={() => {
            setActiveView('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
            activeView === 'home' ? 'text-[#E11D48] font-bold' : 'text-slate-400'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView('series');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
            activeView === 'series' ? 'text-[#E11D48] font-bold' : 'text-slate-400'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Series</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView('saved');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
            activeView === 'saved'
              ? 'text-emerald-400 font-bold'
              : 'text-slate-400'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Saved</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView('categories');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
            activeView === 'categories'
              ? 'text-[#E11D48] font-bold'
              : 'text-slate-400'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Genres</span>
        </button>

        {isAdminAuthenticated ? (
          <button
            type="button"
            onClick={() => {
              setActiveView('admin');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
              activeView === 'admin'
                ? 'text-[#E11D48] font-bold'
                : 'text-slate-400'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Admin</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setActiveView('watchlist');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
              activeView === 'watchlist'
                ? 'text-[#E11D48] font-bold'
                : 'text-slate-400'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Watchlist</span>
          </button>
        )}
      </nav>

      {/* CUSTOM AETHERIA CINEMA THEATRE PLAYER & COMMUNITY MODAL */}
      {activeModalMovie && (
        <YouTubeTheatreModal
          key={activeModalMovie.movie.id}
          movie={activeModalMovie.movie}
          allMovies={movies}
          seriesList={series}
          contextQueue={activePlayerQueue}
          watchedMovieIds={watchedMovieIds}
          userId={userId}
          initialAutoPlay={activeModalMovie.autoPlay}
          resumeSeconds={
            progressMap.get(activeModalMovie.movie.id)?.progressSeconds || 0
          }
          inWatchlist={watchlistIds.has(activeModalMovie.movie.id)}
          onClose={() => {
            setActiveModalMovie(null);
            window.requestAnimationFrame(() => {
              window.scrollTo({ top: savedScrollYRef.current, behavior: 'instant' as ScrollBehavior });
            });
            try {
              const catPage = findSeoCategoryPageByView(activeView, selectedCategory);
              window.history.replaceState({}, '', catPage ? catPage.path : '/');
            } catch {
              // ignore
            }
          }}
          onSelectMovie={(nextMovie, autoPlay = true) =>
            openMovieModal(nextMovie, autoPlay, activePlayerQueue)
          }
          onToggleWatchlist={handleToggleWatchlist}
          onProgressUpdate={handleProgressUpdate}
          onPlaybackError={handlePlaybackError}
          onEngagementChanged={() => void loadBootstrapData()}
          onOpenDownload={(mov) => setDownloadModalMovie(mov)}
          onOpenOfflinePlayer={(mov) => {
            setActiveModalMovie(null);
            openOfflinePlayer(mov);
          }}
        />
      )}

      {/* 100% OFFLINE ZERO-DATA CINEMA PLAYER MODAL */}
      {offlinePlayerMovie && (
        <OfflineCinemaPlayerModal
          movie={offlinePlayerMovie}
          initialFile={offlineInitialFile}
          onClose={() => {
            setOfflinePlayerMovie(null);
            setOfflineInitialFile(null);
          }}
          onOpenDownloadModal={(mov) => setDownloadModalMovie(mov)}
        />
      )}

      {/* SAVED MOVIES DOWNLOADER MODAL */}
      {downloadModalMovie && (
        <DownloadMovieModal
          movie={downloadModalMovie}
          onClose={() => setDownloadModalMovie(null)}
          onPlayMovie={(mov) => {
            setDownloadModalMovie(null);
            openMovieModal(mov, true);
          }}
          onOpenSavedMovies={() => {
            setDownloadModalMovie(null);
            setActiveModalMovie(null);
            setActiveView('saved');
          }}
          onVaultUpdated={(items) => setDeviceDownloads(items)}
        />
      )}

      {/* BRANDED SHARE MOVIE MODAL (WHATSAPP / COPY LINK / SOCIAL INVITE) */}
      {shareModalMovie && (
        <ShareMovieModal
          movie={shareModalMovie}
          averageRating={
            engagementMap[shareModalMovie.id]?.averageRating ?? 4.8
          }
          likesCount={
            engagementMap[shareModalMovie.id]?.likesCount ??
            shareModalMovie.likeCount ??
            120
          }
          onClose={() => setShareModalMovie(null)}
        />
      )}

      {/* NEW RELEASES (LAST 48H) & COMING SOON NOTIFICATION BELL POPOVER */}
      {showNotifications && (
        <NotificationsPopover
          movies={movies}
          lastDiscoveryRunAt={
            settings?.lastDiscoveryRunAt || settings?.lastSuccessfulRunAt
          }
          discoveryIntervalHours={
            settings?.discoveryIntervalHours ||
            settings?.scheduleIntervalHours ||
            6
          }
          seenIds={seenNotificationIds}
          onMarkAllSeen={markNotificationsSeen}
          onSelectMovie={(mov, autoPlay = true) =>
            openMovieModal(mov, autoPlay)
          }
          onShareMovie={(mov) => setShareModalMovie(mov)}
          onClose={() => setShowNotifications(false)}
        />
      )}

      {/* INSTALL ON PHONE HOME SCREEN (ANDROID & IPHONE PWA) MODAL */}
      <PWAInstallModal
        isOpen={showPWAInstallModal}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        isStandalone={isStandalone}
        isIOS={isIOS}
        isAndroid={isAndroid}
        onPromptInstall={promptInstall}
        onPreviewSplash={() => setShowSplashScreen(true)}
        onClose={() => setShowPWAInstallModal(false)}
      />

      {/* SIMPLE SIGN UP / LOGIN / FORGOT PASSWORD MODAL */}
      {showSearchAndAccountModal && (
        <SupabaseAuthModal
          supabaseClient={supabaseClient}
          session={authSession}
          activeUserEmail={currentUserEmail}
          isAdmin={isAdminAuthenticated}
          pendingMovieTitle={pendingMovieAfterAuth?.movie.title || null}
          onOpenWatchlist={() => setActiveView('watchlist')}
          onOpenAdmin={() => setActiveView('admin')}
          onClose={() => {
            setShowSearchAndAccountModal(false);
            setPendingMovieAfterAuth(null);
          }}
          onAuthSuccess={(signedInEmail) => {
            if (signedInEmail) {
              setLocalUserEmail(signedInEmail.trim().toLowerCase());
            }
            setShowSearchAndAccountModal(false);
            setPendingMovieAfterAuth(null);
            setActiveModalMovie(null);
            setActiveView('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            void loadBootstrapData();
          }}
          onSignOut={() => {
            setLocalUserEmail(null);
            setAuthSession(null);
          }}
        />
      )}
      {/* 2026 SERIES SEASON & EPISODE BROWSER MODAL */}
      {activeSeriesModal && (
        <SeriesDetailModal
          series={activeSeriesModal}
          episodes={seriesEpisodesBySeriesId.get(activeSeriesModal.id) || []}
          progressMap={progressMap}
          watchlistIds={watchlistIds}
          onClose={() => setActiveSeriesModal(null)}
          onPlayEpisode={(ep) => {
            setActiveSeriesModal(null);
            openMovieModal(ep, true);
          }}
          onToggleWatchlist={(movieId) => void handleToggleWatchlist(movieId)}
        />
      )}
    </div>
  );
}
