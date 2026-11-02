/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import {
  Bell,
  Bookmark,
  Check,
  ChevronRight,
  Clock,
  Download,
  Film,
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
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { CinemaPosterImage } from './components/CinemaPosterImage.tsx';
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
import { ShareMovieModal } from './components/ShareMovieModal.tsx';
import { SupabaseAuthModal } from './components/SupabaseAuthModal.tsx';
import { YouTubeTheatreModal } from './components/YouTubeTheatreModal.tsx';
import { usePWAInstall } from './hooks/usePWAInstall.ts';
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
  SupabaseConnectionDiagnostics,
  WatchlistItem,
  WatchProgressItem,
} from './types/cinema.ts';

type NavView = 'home' | 'nigerian' | 'series' | 'categories' | 'watchlist' | 'admin';
type SortOption = 'popularity' | 'most_loved' | 'release_date' | 'recently_added';
type CategoryDisplayMode = 'grouped' | 'grid';
type NigerianSubGenre =
  | 'all'
  | 'lagos_billionaire'
  | 'royal_folktale'
  | 'maid_prince'
  | 'emotional_marriage';

const CORE_STORY_GENRES: MovieCategory[] = [
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

const GENRE_METADATA: Record<
  MovieCategory,
  { kicker: string; description: string }
> = {
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
      'Breathtaking AI-assisted and open-studio animated films crafted with rich visual artistry.',
  },
  'Trending AI Movies': {
    kicker: 'Most Watched Across TK STORYWORLD',
    description:
      'Top-performing full-length AI movies ranked by global viewer watch counts.',
  },
  'Newly Released Movies': {
    kicker: 'Fresh Premieres & Latest Uploads',
    description:
      'The newest AI romance dramas and animated features added to the streaming catalogue.',
  },
  'Complete AI Movie Series': {
    kicker: 'Multi-Episode Sagas · Season & Episode Continuity',
    description:
      'Serialized AI dramas organized sequentially by season and episode.',
  },
};

export default function App() {
  const [activeView, setActiveView] = useState<NavView>('home');
  const [nigerianSubGenre, setNigerianSubGenre] =
    useState<NigerianSubGenre>('all');
  const [movies, setMovies] = useState<MovieItem[]>(() => [...INITIAL_MOVIES]);
  const [series, setSeries] = useState<MovieSeries[]>(() => [...INITIAL_SERIES]);
  const [watchHistory, setWatchHistory] = useState<WatchProgressItem[]>([]);
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

  // Real Supabase Auth Client & Session State
  const supabaseClientRef = useRef<SupabaseClient | null>(null);
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(
    null
  );
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [showSearchAndAccountModal, setShowSearchAndAccountModal] =
    useState(false);

  // Category & Search filtering state
  const [selectedCategory, setSelectedCategory] = useState<
    MovieCategory | 'All Categories'
  >('All Categories');
  const [categoryDisplayMode, setCategoryDisplayMode] =
    useState<CategoryDisplayMode>('grouped');
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Movie Player / Details Modal state
  const [activeModalMovie, setActiveModalMovie] = useState<{
    movie: MovieItem;
    autoPlay: boolean;
  } | null>(null);
  const [pendingMovieAfterAuth, setPendingMovieAfterAuth] = useState<{
    movie: MovieItem;
    autoPlay: boolean;
  } | null>(null);

  // Viral Share Movie Modal & Deep-Link Invitation State
  const [shareModalMovie, setShareModalMovie] = useState<MovieItem | null>(
    null
  );
  const [sharedInviteMovie, setSharedInviteMovie] = useState<MovieItem | null>(
    null
  );
  const handledDeepLinkRef = useRef<string | null>(null);

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
  const [showSplashScreen, setShowSplashScreen] = useState<boolean>(() => {
    try {
      const seenSplash = sessionStorage.getItem('tk_storyworld_splash_shown');
      if (!seenSplash) {
        sessionStorage.setItem('tk_storyworld_splash_shown', '1');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });

  const currentUserEmail = useMemo(() => {
    return authSession?.user?.email || 'guest-viewer';
  }, [authSession]);

  const userId = useMemo(
    () => currentUserEmail.toLowerCase().trim() || 'guest-viewer',
    [currentUserEmail]
  );

  const isAdminAuthenticated = useMemo(() => {
    const email = authSession?.user?.email?.trim().toLowerCase();
    if (!email || !authSession?.access_token) return false;
    if (email === 'okorotochukwu007@gmail.com') return true;
    return Boolean(
      settings?.adminEmails?.some((a) => a.trim().toLowerCase() === email)
    );
  }, [authSession, settings]);

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

          sb.auth.onAuthStateChange((_event, nextSession) => {
            setAuthSession(nextSession || null);
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

      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        setMovies(
          Array.isArray(data.movies) && data.movies.length > 0
            ? data.movies
            : [...INITIAL_MOVIES]
        );
        setSeries(
          Array.isArray(data.series) && data.series.length > 0
            ? data.series
            : [...INITIAL_SERIES]
        );
        setWatchHistory(data.watchHistory || []);
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

      // Fallback when deployed as static site or if /api/bootstrap was unreachable
      const sb = await initSupabaseIfNeeded();
      if (sb) {
        const { data: dbMovies } = await sb
          .from('movies')
          .select('*')
          .order('published_at', { ascending: false });

        if (Array.isArray(dbMovies) && dbMovies.length > 0) {
          const mappedMovies: MovieItem[] = dbMovies.map((row: any) => ({
            id: row.id,
            youtubeVideoId: row.youtube_video_id,
            title: row.title,
            synopsis: row.synopsis || '',
            thumbnailUrl: row.thumbnail_url,
            backdropUrl: row.backdrop_url,
            primaryCategory: row.primary_category,
            secondaryCategories: row.secondary_categories || [],
            channelTitle: row.channel_title,
            channelId: row.channel_id || '',
            publishedAt: row.published_at,
            durationSeconds: row.duration_seconds || 0,
            durationFormatted: row.duration_formatted || '00:00',
            viewCount: Number(row.view_count || 0),
            likeCount: Number(row.like_count || 0),
            isEmbeddable: row.is_embeddable ?? true,
            playbackStatus: row.playback_status || 'active',
            approvalStatus: row.approval_status || 'approved',
            isFeatured: Boolean(row.is_featured),
            seriesId: row.series_id || null,
            seasonNumber: row.season_number ?? null,
            episodeNumber: row.episode_number ?? null,
            discoveredVia: row.discovered_via || 'youtube_api',
            aiQualityScore: row.ai_quality_score || 85,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }));
          setMovies(
            mappedMovies.filter(
              (m) =>
                m.approvalStatus === 'approved' && m.playbackStatus === 'active'
            )
          );
        }
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
    if (!authSession?.user) {
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
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data.items || []);
      }
    } catch (err) {
      console.error('Watchlist toggle error:', err);
    }
  };

  const handleProgressUpdate = useCallback(
    async (movieId: string, progressSeconds: number, durationSeconds: number) => {
      try {
        const res = await fetch('/api/history/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            movieId,
            progressSeconds,
            durationSeconds,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setWatchHistory(data.watchHistory || []);
        }
      } catch {
        // silent background progress save
      }
    },
    [userId]
  );

  const handlePlaybackError = useCallback(
    async (
      movieId: string,
      playbackStatus: 'unavailable' | 'embed_restricted'
    ) => {
      try {
        await fetch(`/api/movies/${movieId}/playback-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playbackStatus, isEmbeddable: false }),
        });
        void loadBootstrapData();
      } catch {
        // ignore
      }
    },
    [loadBootstrapData]
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

  const requireSignup = settings?.requireFreeSignupToWatch !== false;
  const isFreeGrowthMode = settings?.monetizationMode !== 'paid_vip';

  const openMovieModal = useCallback(
    (movie: MovieItem, autoPlay = false) => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('movie', movie.id);
        window.history.replaceState({}, '', url.toString());
      } catch {
        // ignore
      }
      if (requireSignup && !authSession?.user) {
        setPendingMovieAfterAuth({ movie, autoPlay: true });
        setShowSearchAndAccountModal(true);
        return;
      }
      setActiveModalMovie({ movie, autoPlay });
    },
    [authSession, requireSignup]
  );

  // Automatically detect ?movie=<movieId> deep links shared via WhatsApp or Copy Link
  useEffect(() => {
    if (movies.length === 0) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const sharedMovieId = params.get('movie');
      if (!sharedMovieId || handledDeepLinkRef.current === sharedMovieId) {
        return;
      }
      const target = movies.find((m) => m.id === sharedMovieId);
      if (target) {
        handledDeepLinkRef.current = sharedMovieId;
        setSharedInviteMovie(target);
        if (authSession?.user) {
          setActiveModalMovie({ movie: target, autoPlay: true });
        } else {
          setPendingMovieAfterAuth({ movie: target, autoPlay: true });
        }
      }
    } catch {
      // ignore
    }
  }, [movies, authSession]);

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

  // Derived Cinema Rails
  const featuredMovie = useMemo(() => {
    return (
      movies.find((m) => m.isFeatured) ||
      movies.find((m) => m.primaryCategory === 'Fantasy Romance') ||
      movies[0] ||
      null
    );
  }, [movies]);

  const continueWatchingMovies = useMemo(() => {
    return watchHistory
      .filter((h) => !h.completed && h.progressSeconds > 5)
      .map((h) => {
        const m = movies.find((mov) => mov.id === h.movieId);
        return m ? { movie: m, progress: h } : null;
      })
      .filter(
        (x): x is { movie: MovieItem; progress: WatchProgressItem } =>
          x !== null
      );
  }, [watchHistory, movies]);

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

  const fantasyAndAnimatedMovies = useMemo(() => {
    return sortMoviesList(
      movies.filter(
        (m) =>
          m.primaryCategory === 'Fantasy Romance' ||
          m.primaryCategory === 'Werewolf Romance' ||
          m.primaryCategory === 'AI Animated Movies' ||
          m.secondaryCategories.includes('Fantasy Romance') ||
          m.secondaryCategories.includes('Werewolf Romance') ||
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

  const mostLovedMovies = useMemo(() => {
    return [...movies]
      .sort((a, b) => {
        const likesA = engagementMap[a.id]?.likesCount ?? a.likeCount ?? 0;
        const likesB = engagementMap[b.id]?.likesCount ?? b.likeCount ?? 0;
        const ratingA = engagementMap[a.id]?.averageRating ?? 4.7;
        const ratingB = engagementMap[b.id]?.averageRating ?? 4.7;
        return likesB - likesA || ratingB - ratingA;
      })
      .slice(0, 12);
  }, [movies, engagementMap]);

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
    let list =
      selectedCategory === 'All Categories'
        ? sortMoviesList(movies)
        : [...(categoryMoviesMap[selectedCategory] || [])];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.synopsis.toLowerCase().includes(q) ||
          m.channelTitle.toLowerCase().includes(q) ||
          m.primaryCategory.toLowerCase().includes(q) ||
          m.secondaryCategories.some((c) => c.toLowerCase().includes(q))
      );
    }
    return list;
  }, [movies, selectedCategory, categoryMoviesMap, searchQuery, sortMoviesList]);

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
        onClick={() => openMovieModal(movie, false)}
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

          {/* Zero-Pill Metadata Footer with Star Rating & Viewer Likes */}
          <div className="pt-1 flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
            <span className="font-mono tabular-nums text-[#F59E0B] shrink-0">
              ★ {avgStars}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-rose-400/90 shrink-0">
              ♥ {totalLikes.toLocaleString()}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{movie.channelTitle}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#F8FAFC] flex flex-col">
      {/* CUSTOM RED LUXURY CINEMA SPLASH SCREEN */}
      {showSplashScreen && (
        <LuxurySplashScreen onFinish={() => setShowSplashScreen(false)} />
      )}

      {/* OFFLINE CONNECTIVITY INDICATOR */}
      <OfflineIndicator isOnline={isOnline} />

      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-10 py-4 bg-[#050505]/90 backdrop-blur-md border-b border-white/10">
        {/* Zone 1: Single text element luxury red wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('home');
          }}
          className="brand-luxury-red text-xl sm:text-2xl font-black uppercase whitespace-nowrap shrink-0"
        >
          TK STORYWORLD
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
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
            href="#nigerian"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('nigerian');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'nigerian'
                ? 'text-[#F59E0B] underline underline-offset-8 decoration-[#F59E0B] decoration-2 font-semibold'
                : 'text-[#F59E0B]/90'
            }`}
          >
            Nigerian AI Movies
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
            Series
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
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {!isStandalone && (
            <button
              type="button"
              onClick={() => setShowPWAInstallModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#14080E] hover:bg-[#220C16] border border-[#E11D48]/50 text-xs font-semibold text-white transition-colors cursor-pointer"
              title="Install TK STORYWORLD on Phone Home Screen"
            >
              <Download className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span className="hidden sm:inline">Install App</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowNotifications((prev) => !prev)}
            className="relative p-2.5 rounded-xl bg-[#0E1118] hover:bg-[#171C28] border border-white/15 text-slate-200 hover:text-white transition-colors cursor-pointer"
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
            className="px-3.5 sm:px-4 py-2 text-xs font-semibold text-white bg-[#E11D48] hover:bg-[#BE123C] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {authSession?.user?.email ? 'My Account' : 'Sign Up / Login'}
          </button>
        </div>
      </header>

      {/* Mobile Secondary Navigation Strip */}
      <div className="flex md:hidden items-center justify-around px-3 py-2 bg-[#0A0C12] border-b border-white/10 text-xs font-medium text-slate-300 overflow-x-auto no-scrollbar">
        {[
          { id: 'home', label: 'Home' },
          { id: 'nigerian', label: 'Nigerian AI' },
          { id: 'series', label: 'Series' },
          { id: 'categories', label: 'Categories' },
          { id: 'watchlist', label: 'Watchlist' },
          ...(isAdminAuthenticated ? [{ id: 'admin', label: 'Admin' }] : []),
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id as NavView)}
            className={`px-3 py-1.5 rounded-md whitespace-nowrap shrink-0 ${
              activeView === item.id ? 'text-[#E11D48] font-semibold' : ''
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
                  {authSession?.user
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
      <main className="flex-1">
        {activeView === 'admin' ? (
          isAdminAuthenticated ? (
            <AdminDashboard
              accessToken={authSession?.access_token || null}
              adminEmail={authSession?.user?.email || null}
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

                {authSession?.user?.email && (
                  <div className="px-4 py-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-200">
                    Currently signed in as{' '}
                    <strong>{authSession.user.email}</strong> (Viewer role). Please
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
                      TK STORYWORLD · NIGERIAN & AFRICAN AI CINEMA
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#F59E0B]">
                      <span>Nigerian & African AI Cinema Hub</span>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span className="text-slate-200">
                        {nigerianHeroMovie.primaryCategory}
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
                        <span>Watch Featured Nigerian AI Movie</span>
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
                    Nigerian & African AI Love Stories ({filteredNigerianMovies.length})
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
                        All Nigerian & African AI Movies ({nigerianAndAfricanMovies.length})
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
        ) : activeView === 'watchlist' ? (
          <section className="max-w-[1400px] mx-auto px-5 sm:px-10 py-10 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/10">
              <div>
                <div className="text-xs text-slate-400">
                  Personal Library · {currentUserEmail}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1">
                  My Saved Watchlist & Continue Watching
                </h1>
              </div>
              <button
                onClick={() => setActiveView('categories')}
                className="px-4 py-2 rounded-lg border border-white/15 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Explore All 12 Categories
              </button>
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
                    Browse Featured AI Movies
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
          <section className="max-w-[1400px] mx-auto px-5 sm:px-10 py-10 space-y-10">
            <div className="pb-6 border-b border-white/10">
              <div className="text-xs text-[#F59E0B]">
                Serialized AI Storytelling · Multi-Episode Collections
              </div>
              <h1 className="font-display text-2xl sm:text-4xl font-bold text-white mt-1">
                Complete AI Movie Series & Episodic Dramas
              </h1>
              <p className="text-sm text-slate-400 mt-2 max-w-2xl">
                Watch multi-part billionaire contract marriages, werewolf alpha sagas,
                and animated chronicles organized into complete seasons and episodes.
              </p>
            </div>

            <div className="space-y-10">
              {series.map((s) => {
                const eps = movies
                  .filter((m) => m.seriesId === s.id)
                  .sort(
                    (a, b) =>
                      (a.seasonNumber || 1) - (b.seasonNumber || 1) ||
                      (a.episodeNumber || 1) - (b.episodeNumber || 1)
                  );
                return (
                  <div
                    key={s.id}
                    className="rounded-2xl bg-[#0B0E15] border border-white/10 p-6 sm:p-8 space-y-6"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-white/10">
                      <div className="space-y-2 max-w-2xl">
                        <div className="text-xs text-slate-400">
                          <span className="text-[#F59E0B] font-medium">
                            {s.primaryCategory}
                          </span>{' '}
                          · {s.totalSeasons} Season · {eps.length} Episodes ·{' '}
                          {s.channelTitle}
                        </div>
                        <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                          {s.title}
                        </h2>
                        <p className="text-sm text-slate-300 leading-relaxed">
                          {s.synopsis}
                        </p>
                      </div>

                      {eps[0] && (
                        <button
                          onClick={() => openMovieModal(eps[0], true)}
                          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Play Season 1 · Episode 1</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                      {eps.map((ep) => renderMovieCard(ep))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : activeView === 'categories' ? (
          <section className="max-w-[1400px] mx-auto px-5 sm:px-10 py-10 space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-white/10">
              <div>
                <div className="text-xs text-[#F59E0B] font-medium">
                  Structured AI Cinema Genre Directory
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1">
                  Browse Stories Arranged by Category & Genre
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Every story is classified by its true plot and title into dedicated romance, drama, and fantasy shelves.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter movies, genres, or creators..."
                    className="pl-9 pr-4 py-2 rounded-lg bg-[#0E1118] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48]"
                  />
                </div>

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
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            {/* Active Genre Header Banner when a specific Category is selected */}
            {selectedCategory !== 'All Categories' && (
              <div className="rounded-2xl bg-[#0B0E15] border border-white/10 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-[#F59E0B] font-medium">
                    {GENRE_METADATA[selectedCategory]?.kicker || 'Curated AI Genre'}
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                    {selectedCategory} ({filteredCategoryMovies.length} Stories)
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
                            {genre}{' '}
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
                          <span>See All {genreMovies.length} in {genre}</span>
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
              <div className="rounded-2xl bg-[#0E1118] border border-white/10 p-12 text-center space-y-3">
                <p className="text-sm text-slate-300">
                  No movies found matching "{selectedCategory}"{' '}
                  {searchQuery ? `and "${searchQuery}"` : ''}.
                </p>
                <button
                  onClick={() => {
                    setSelectedCategory('All Categories');
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 rounded-lg bg-[#E11D48] text-white text-xs font-semibold cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {filteredCategoryMovies.map((m) => renderMovieCard(m))}
              </div>
            )}
          </section>
        ) : (
          /* HOME VIEW: NETFLIX-STYLE STREAMING INTERFACE ARRANGED BY GENRE */
          <div className="space-y-12 pb-16">
            {/* 1. CINEMATIC FEATURED MOVIE HERO BANNER */}
            {featuredMovie && (
              <section className="relative w-full min-h-[540px] lg:min-h-[620px] flex items-end overflow-hidden border-b border-white/10">
                <div className="absolute inset-0">
                  <CinemaPosterImage
                    src={featuredMovie.backdropUrl}
                    fallbackVideoId={featuredMovie.youtubeVideoId}
                    alt={featuredMovie.title}
                    category={featuredMovie.primaryCategory}
                    className="w-full h-full object-cover object-center scale-105"
                  />
                  {/* Measured Contrast Scrims for 4.5:1 Legibility */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/80 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent" />
                </div>

                <div className="relative z-10 max-w-[1400px] w-full mx-auto px-5 sm:px-10 py-12 sm:py-16">
                  <div className="max-w-2xl space-y-4">
                    {/* Luxury Red Brand Marquee */}
                    <div className="brand-luxury-red text-xs sm:text-sm font-black uppercase">
                      TK STORYWORLD · ORIGINAL AI CINEMA
                    </div>
                    {/* Unboxed Kicker Metadata */}
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-300">
                      <span className="text-[#F59E0B] font-semibold">
                        Featured AI Film
                      </span>
                      {isFreeGrowthMode && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-400 font-semibold">
                            100% Free to Watch
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{featuredMovie.primaryCategory}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {featuredMovie.durationFormatted}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{featuredMovie.channelTitle}</span>
                    </div>

                    <h1
                      className="font-display font-bold text-white tracking-tight leading-[1.08]"
                      style={{ fontSize: 'clamp(2.25rem, 4vw, 3.75rem)' }}
                    >
                      {featuredMovie.title}
                    </h1>

                    <p className="text-slate-200 text-sm sm:text-base leading-relaxed max-w-[62ch]">
                      {featuredMovie.synopsis}
                    </p>

                    <div className="pt-3 flex flex-wrap items-center gap-3.5">
                      <button
                        onClick={() => openMovieModal(featuredMovie, true)}
                        className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-semibold shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Watch Movie</span>
                      </button>

                      <button
                        onClick={() => openMovieModal(featuredMovie, false)}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/15 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Info className="w-4 h-4" />
                        <span>Details & Episodes</span>
                      </button>

                      <button
                        onClick={() => handleToggleWatchlist(featuredMovie.id)}
                        className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-black/50 hover:bg-white/10 border border-white/15 text-slate-200 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {watchlistIds.has(featuredMovie.id) ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span>In Watchlist</span>
                          </>
                        ) : (
                          <>
                            <Bookmark className="w-4 h-4" />
                            <span>Save to Watchlist</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setShareModalMovie(featuredMovie)}
                        className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-black/50 hover:bg-white/15 border border-white/15 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Share2 className="w-4 h-4 text-[#F59E0B]" />
                        <span>Share Movie</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <div className="max-w-[1400px] mx-auto px-5 sm:px-10 space-y-12">
              {/* QUICK 12-GENRE BAR WITH STORY COUNTS */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-300">
                    Jump Directly to Any Story Genre
                  </h2>
                  <button
                    onClick={() => {
                      setSelectedCategory('All Categories');
                      setCategoryDisplayMode('grouped');
                      setActiveView('categories');
                    }}
                    className="text-xs text-[#F59E0B] hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Browse All Genres Grouped</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  {CORE_STORY_GENRES.map((cat) => {
                    const count = categoryMoviesMap[cat]?.length || 0;
                    return (
                      <button
                        key={cat}
                        onClick={() => {
                          setSelectedCategory(cat);
                          setActiveView('categories');
                        }}
                        className="px-3.5 py-2 rounded-lg bg-[#0E1118] hover:bg-[#171C28] border border-white/10 hover:border-white/25 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {cat}{' '}
                        <span className="text-slate-500 font-mono">
                          ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 2. CONTINUE WATCHING RAIL */}
              {continueWatchingMovies.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Continue Watching
                      </h2>
                      <p className="text-xs text-slate-400">
                        Pick up right where you stopped
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {continueWatchingMovies.slice(0, 4).map(({ movie, progress }) => {
                      const pct = Math.min(
                        100,
                        Math.round(
                          (progress.progressSeconds /
                            Math.max(1, progress.durationSeconds)) *
                            100
                        )
                      );
                      const minsLeft = Math.max(
                        1,
                        Math.ceil(
                          (progress.durationSeconds - progress.progressSeconds) / 60
                        )
                      );
                      return (
                        <div
                          key={movie.id}
                          onClick={() => openMovieModal(movie, true)}
                          className="group rounded-xl bg-[#0E1118] border border-white/10 hover:border-[#E11D48]/60 overflow-hidden cursor-pointer transition-all"
                        >
                          <div className="relative aspect-video bg-black">
                            <CinemaPosterImage
                              src={movie.thumbnailUrl}
                              fallbackVideoId={movie.youtubeVideoId}
                              alt={movie.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                              </div>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                              <div
                                className="h-full bg-[#E11D48]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <div className="p-3.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-display text-sm font-semibold text-white truncate">
                                {movie.title}
                              </div>
                              <div className="font-mono text-[11px] text-slate-400 tabular-nums mt-0.5">
                                {pct}% watched · {minsLeft}m remaining
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 3. NIGERIAN & AFRICAN AI LOVE STORIES */}
              {nigerianAndAfricanMovies.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#F59E0B] font-medium">
                        Regional Spotlight · Lagos Billionaires · Royal Folktales · Maid & Prince
                      </div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Nigerian & African AI Love Stories
                      </h2>
                      <p className="text-xs text-slate-400">
                        Captivating Nigerian billionaire romances, royal love stories,
                        and emotional wedding dramas
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setNigerianSubGenre('all');
                        setActiveView('nigerian');
                      }}
                      className="text-xs text-[#F59E0B] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open Nigerian AI Hub ({nigerianAndAfricanMovies.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {nigerianAndAfricanMovies
                      .slice(0, 8)
                      .map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* 4. CONTRACT MARRIAGE & ARRANGED VOWS */}
              {contractMarriageMovies.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#F59E0B] font-medium">
                        {GENRE_METADATA['Contract Marriage'].kicker}
                      </div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Contract Marriage & Mistaken Brides
                      </h2>
                      <p className="text-xs text-slate-400">
                        {GENRE_METADATA['Contract Marriage'].description}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCategory('Contract Marriage');
                        setActiveView('categories');
                      }}
                      className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Explore ({contractMarriageMovies.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {contractMarriageMovies
                      .slice(0, 8)
                      .map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* 5. SECRET MARRIAGE & HIDDEN IDENTITY */}
              {secretMarriageMovies.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#F59E0B] font-medium">
                        {GENRE_METADATA['Secret Marriage'].kicker}
                      </div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Secret Marriage & Hidden Billionaire Husbands
                      </h2>
                      <p className="text-xs text-slate-400">
                        {GENRE_METADATA['Secret Marriage'].description}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCategory('Secret Marriage');
                        setActiveView('categories');
                      }}
                      className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Explore ({secretMarriageMovies.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {secretMarriageMovies
                      .slice(0, 8)
                      .map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* 6. BILLIONAIRE & CEO POWER ROMANCE */}
              {ceoAndBillionaireMovies.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#F59E0B] font-medium">
                        {GENRE_METADATA['Billionaire Romance'].kicker}
                      </div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Billionaire & CEO Love Stories
                      </h2>
                      <p className="text-xs text-slate-400">
                        {GENRE_METADATA['Billionaire Romance'].description}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCategory('Billionaire Romance');
                        setActiveView('categories');
                      }}
                      className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Explore ({ceoAndBillionaireMovies.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {ceoAndBillionaireMovies
                      .slice(0, 8)
                      .map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* 7. REVENGE, BETRAYAL & SECOND-CHANCE LOVE */}
              {revengeRomanceMovies.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#F59E0B] font-medium">
                        {GENRE_METADATA['Revenge Romance'].kicker}
                      </div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Revenge Romance, Betrayal & Rebirth
                      </h2>
                      <p className="text-xs text-slate-400">
                        {GENRE_METADATA['Revenge Romance'].description}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCategory('Revenge Romance');
                        setActiveView('categories');
                      }}
                      className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Explore ({revengeRomanceMovies.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {revengeRomanceMovies
                      .slice(0, 8)
                      .map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* 8. EMOTIONAL LOVE & HEARTBREAK DRAMAS */}
              {emotionalLoveMovies.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#F59E0B] font-medium">
                        {GENRE_METADATA['Emotional Love Stories'].kicker}
                      </div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Emotional Love Stories & Tearful Sacrifices
                      </h2>
                      <p className="text-xs text-slate-400">
                        {GENRE_METADATA['Emotional Love Stories'].description}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCategory('Emotional Love Stories');
                        setActiveView('categories');
                      }}
                      className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Explore ({emotionalLoveMovies.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {emotionalLoveMovies
                      .slice(0, 8)
                      .map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* 9. FANTASY, WEREWOLF & AI ANIMATED WORLDS */}
              {fantasyAndAnimatedMovies.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#F59E0B] font-medium">
                        {GENRE_METADATA['Fantasy Romance'].kicker}
                      </div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Fantasy, Werewolf Alpha & AI Animated Cinema
                      </h2>
                      <p className="text-xs text-slate-400">
                        Enchanted realms, fated alpha mates, and visually poetic animated films
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCategory('Fantasy Romance');
                        setActiveView('categories');
                      }}
                      className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Explore ({fantasyAndAnimatedMovies.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {fantasyAndAnimatedMovies
                      .slice(0, 8)
                      .map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}

              {/* 10. MOST LOVED BY VIEWERS */}
              <section className="space-y-4">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-[#E11D48] font-semibold">
                      <Heart className="w-3.5 h-3.5 fill-current" />
                      <span>Audience Favorites</span>
                    </div>
                    <h2 className="font-display text-xl font-bold text-white">
                      Most Loved by Viewers
                    </h2>
                    <p className="text-xs text-slate-400">
                      Highest-rated AI love stories based on viewer hearts, star
                      ratings, and reviews
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCategory('All Categories');
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
                <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                  {mostLovedMovies
                    .slice(0, 8)
                    .map((m) => renderMovieCard(m, true))}
                </div>
              </section>

              {/* 11. NEWLY RELEASED EPISODES & COMPLETE SERIES */}
              {newlyReleasedEpisodes.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-[#F59E0B] font-medium">
                        {GENRE_METADATA['Complete AI Movie Series'].kicker}
                      </div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Complete AI Movie Series & Episodes
                      </h2>
                      <p className="text-xs text-slate-400">
                        Multi-part AI series organized sequentially by season and episode
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveView('series')}
                      className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>All Series</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
                    {newlyReleasedEpisodes
                      .slice(0, 4)
                      .map((m) => renderMovieCard(m, true))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </main>

      {/* CLEAN EDITORIAL FOOTER */}
      <footer className="border-t border-white/10 bg-[#050505] py-8 pb-24 md:pb-8 px-5 sm:px-10">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <span className="brand-luxury-red text-sm font-black uppercase">
              TK STORYWORLD
            </span>{' '}
            · AI Movie & Series Streaming Platform · Nigerian & International AI
            Love Cinema
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6">
            <button
              onClick={() => setActiveView('nigerian')}
              className="hover:text-slate-300 cursor-pointer"
            >
              Nigerian AI Movies
            </button>
            <button
              onClick={() => setActiveView('categories')}
              className="hover:text-slate-300 cursor-pointer"
            >
              12 Genres
            </button>
            <button
              onClick={() => setActiveView('series')}
              className="hover:text-slate-300 cursor-pointer"
            >
              Complete Series
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
      </footer>

      {/* FIXED BOTTOM MOBILE THUMB NAVIGATION BAR (For One-Handed Phone Viewing) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-[#07090F]/95 backdrop-blur-xl border-t border-white/10 px-2 py-1.5 flex items-center justify-around"
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
            setActiveView('nigerian');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
            activeView === 'nigerian'
              ? 'text-[#F59E0B] font-bold'
              : 'text-slate-400'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Nigerian AI</span>
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

        <button
          type="button"
          onClick={() => {
            setActiveView('series');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
            activeView === 'series'
              ? 'text-[#E11D48] font-bold'
              : 'text-slate-400'
          }`}
        >
          <Play className="w-4 h-4" />
          <span>Series</span>
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
          movie={activeModalMovie.movie}
          allMovies={movies}
          seriesList={series}
          userId={userId}
          initialAutoPlay={activeModalMovie.autoPlay}
          resumeSeconds={
            progressMap.get(activeModalMovie.movie.id)?.progressSeconds || 0
          }
          inWatchlist={watchlistIds.has(activeModalMovie.movie.id)}
          onClose={() => {
            setActiveModalMovie(null);
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete('movie');
              window.history.replaceState({}, '', url.toString());
            } catch {
              // ignore
            }
          }}
          onSelectMovie={(nextMovie, autoPlay = true) =>
            openMovieModal(nextMovie, autoPlay)
          }
          onToggleWatchlist={handleToggleWatchlist}
          onProgressUpdate={handleProgressUpdate}
          onPlaybackError={handlePlaybackError}
          onEngagementChanged={() => void loadBootstrapData()}
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
          lastDiscoveryRunAt={settings?.lastDiscoveryRunAt}
          discoveryIntervalHours={settings?.discoveryIntervalHours || 6}
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
          isAdmin={isAdminAuthenticated}
          pendingMovieTitle={pendingMovieAfterAuth?.movie.title || null}
          onOpenWatchlist={() => setActiveView('watchlist')}
          onOpenAdmin={() => setActiveView('admin')}
          onClose={() => {
            setShowSearchAndAccountModal(false);
            setPendingMovieAfterAuth(null);
          }}
          onAuthSuccess={() => {
            setShowSearchAndAccountModal(false);
            void loadBootstrapData();
            if (pendingMovieAfterAuth) {
              setActiveModalMovie(pendingMovieAfterAuth);
              setPendingMovieAfterAuth(null);
            }
          }}
        />
      )}
    </div>
  );
}
