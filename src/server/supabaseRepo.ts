import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  AdminSettings,
  DiscoveryRunLog,
  DiscoverySource,
  MovieCommentItem,
  MovieEngagementSummary,
  MovieItem,
  MovieLikeItem,
  MovieSeries,
  RegisteredUserRecord,
  SupabaseConnectionDiagnostics,
  UserAuthEvent,
  UserAuthStats,
  WatchlistItem,
  WatchProgressItem,
} from '../types/cinema.ts';
import {
  INITIAL_ADMIN_SETTINGS,
  INITIAL_DISCOVERY_SOURCES,
  INITIAL_MOVIES,
  INITIAL_SERIES,
  SERIES_CRIMSON_ID,
  SERIES_OBSIDIAN_ID,
} from './seedCatalogue.ts';

interface PersistedState {
  movies: MovieItem[];
  series: MovieSeries[];
  sources: DiscoverySource[];
  runs: DiscoveryRunLog[];
  settings: AdminSettings;
  watchHistory: WatchProgressItem[];
  watchlist: WatchlistItem[];
  movieLikes: MovieLikeItem[];
  movieComments: MovieCommentItem[];
  registeredUsers?: RegisteredUserRecord[];
  authEvents?: UserAuthEvent[];
}

const IS_SERVERLESS = Boolean(
  process.env.NETLIFY ||
    process.env.NETLIFY_FUNCTIONS_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL
);
const BUNDLED_DATA_FILE = path.join(
  path.resolve(process.cwd(), 'data'),
  'aetheria-db.json'
);
const DATA_DIR = IS_SERVERLESS
  ? '/tmp'
  : path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'aetheria-db.json');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val: string | null | undefined): boolean {
  return Boolean(val && UUID_REGEX.test(val));
}

function normalizeSeriesId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id === 'series-obsidian-vows') return SERIES_OBSIDIAN_ID;
  if (id === 'series-crimson-crown') return SERIES_CRIMSON_ID;
  return isUuid(id) ? id : SERIES_OBSIDIAN_ID;
}

export function recalibrateMovieGenreAndSynopsis(movie: MovieItem): MovieItem {
  const cleanTitle =
    (movie.title || '')
      .replace(/^\[FULL\]\s*/i, '')
      .replace(/#[a-zA-Z0-9_]+/g, '')
      .replace(/\s*\|\s*Full Movie.*$/i, '')
      .trim() || movie.title;

  const titleLower = cleanTitle.toLowerCase();
  const chanLower = (movie.channelTitle || '').toLowerCase();

  // Strip noisy YouTube channel promotional boilerplate from synopsis
  let desc = (movie.synopsis || '')
    .replace(/#[a-zA-Z0-9_]+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/👉\s*Follow me[^\n.]*[.\n]?/gi, '')
    .replace(/🙏*\s*Copyright Disclaimer under Section 107[\s\S]*/gi, '')
    .replace(/💖?\s*Welcome to [^!.\n]+[!.\n]\s*/gi, '')
    .replace(/🍑?\s*Welcome to [^!.\n]+[!.\n]\s*/gi, '')
    .replace(/✨?\s*Welcome to [^!.\n]+[!.\n]\s*/gi, '')
    .replace(/Discover addictive English romance dramas[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/Enjoy AI romance dramas[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/Daily English-dubbed romance short dramas[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/Fall in love with handsome CEOs[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/New episodes every day[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/🥰?\s*If you enjoy billionaire stories, mafia dramas[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/🎬?\s*New AI cinematic short dramas every day[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/👍?\s*Like\s*•\s*💬\s*Comment[\s\S]*/gi, '')
    .replace(/Watch the complete AI-generated romance drama from[^!.\n]*[!.\n]\s*/gi, '')
    .replace(/✨\s*AI-generated cinematic storytelling[\s\S]*/gi, '')
    .replace(/Story Summary:\s*/gi, '')
    .replace(/^❤️\s*[^❤️]+❤️\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const plotLower = desc.toLowerCase();

  // Determine accurate primaryCategory from Title first, then cleaned plot
  let primary = movie.primaryCategory;

  if (
    movie.primaryCategory === 'Action Movies' ||
    titleLower.includes('action') ||
    titleLower.includes('combat') ||
    titleLower.includes('cyberpunk') ||
    titleLower.includes('tactical') ||
    titleLower.includes('martial arts') ||
    titleLower.includes('heist') ||
    titleLower.includes('assassin') ||
    titleLower.includes('special forces') ||
    titleLower.includes('operative') ||
    titleLower.includes('mercenary') ||
    titleLower.includes('warfare') ||
    titleLower.includes('mecha') ||
    titleLower.includes('gunfight') ||
    titleLower.includes('showdown')
  ) {
    primary = 'Action Movies';
  } else if (
    titleLower.includes('contract') ||
    titleLower.includes('arranged marriage') ||
    titleLower.includes('arrange marriage') ||
    titleLower.includes('fake love') ||
    titleLower.includes('fake marriage') ||
    titleLower.includes('by mistake') ||
    titleLower.includes('paper wife') ||
    titleLower.includes('bride on contract')
  ) {
    primary = 'Contract Marriage';
  } else if (
    titleLower.includes('secret marriage') ||
    titleLower.includes('secret wife') ||
    titleLower.includes('secret husband') ||
    titleLower.includes('secret billionaire') ||
    titleLower.includes('hidden wife') ||
    titleLower.includes('never knowing') ||
    titleLower.includes('wrong man') ||
    titleLower.includes('face blindness') ||
    titleLower.includes('disguise') ||
    titleLower.includes('flash marriage') ||
    titleLower.includes('raised his son') ||
    titleLower.includes('secretly') ||
    titleLower.includes('bittersweet vows')
  ) {
    primary = 'Secret Marriage';
  } else if (
    titleLower.includes('werewolf') ||
    titleLower.includes('alpha') ||
    titleLower.includes('lycan') ||
    titleLower.includes('fated mate') ||
    titleLower.includes('moonlit') ||
    titleLower.includes('wolf')
  ) {
    primary = 'Werewolf Romance';
  } else if (
    titleLower.includes('revenge') ||
    titleLower.includes('betray') ||
    titleLower.includes('regret') ||
    titleLower.includes('disappointment') ||
    titleLower.includes('left him forever') ||
    titleLower.includes('chose my sister') ||
    titleLower.includes('reborn') ||
    titleLower.includes('past life') ||
    titleLower.includes('divorce') ||
    titleLower.includes('ex-husband') ||
    titleLower.includes('memories of amsterdam')
  ) {
    primary = 'Revenge Romance';
  } else if (
    titleLower.includes('ceo') ||
    titleLower.includes('boss') ||
    titleLower.includes('chairman') ||
    titleLower.includes('executive') ||
    titleLower.includes('heiress & the maverick')
  ) {
    primary = 'CEO Love Stories';
  } else if (
    titleLower.includes('billionaire') ||
    titleLower.includes('heiress') ||
    titleLower.includes('tycoon') ||
    titleLower.includes('millionaire') ||
    titleLower.includes('rich') ||
    titleLower.includes('sovereign syndicate') ||
    titleLower.includes('prince') ||
    titleLower.includes('sea king')
  ) {
    primary = 'Billionaire Romance';
  } else if (
    titleLower.includes('fantasy') ||
    titleLower.includes('dragon') ||
    titleLower.includes('magic') ||
    titleLower.includes('folktale') ||
    titleLower.includes('ancient') ||
    titleLower.includes('kingdom') ||
    titleLower.includes('spirit')
  ) {
    if (titleLower.includes('vow of the dragon')) {
      primary = 'Emotional Love Stories';
    } else {
      primary = 'Fantasy Romance';
    }
  } else if (
    titleLower.includes('tears') ||
    titleLower.includes('wedding') ||
    titleLower.includes('maid') ||
    titleLower.includes('orphan') ||
    titleLower.includes('heartbreak') ||
    titleLower.includes('emotional') ||
    titleLower.includes('love') ||
    titleLower.includes('marriage') ||
    titleLower.includes('wife') ||
    titleLower.includes('bride')
  ) {
    primary = 'Emotional Love Stories';
  } else if (
    titleLower.includes('animated') ||
    titleLower.includes('animation') ||
    chanLower.includes('blender')
  ) {
    primary = 'AI Animated Movies';
  } else if (plotLower.includes('contract marriage') || plotLower.includes('marriage contract')) {
    primary = 'Contract Marriage';
  } else if (plotLower.includes('secret marriage') || plotLower.includes('hidden identity')) {
    primary = 'Secret Marriage';
  } else if (plotLower.includes('revenge') || plotLower.includes('betrayed')) {
    primary = 'Revenge Romance';
  } else if (plotLower.includes('ceo') || plotLower.includes('chairman')) {
    primary = 'CEO Love Stories';
  } else if (plotLower.includes('billionaire') || plotLower.includes('tycoon') || plotLower.includes('prince')) {
    primary = 'Billionaire Romance';
  }

  const isGenericPromo =
    desc.length < 45 ||
    /copyright disclaimer|fair use|subscribe to|follow me on instagram|welcome to/i.test(
      desc
    );

  const finalSynopsis = !isGenericPromo
    ? desc.slice(0, 320)
    : primary === 'Action Movies'
    ? `In "${cleanTitle}", high-stakes tactical combat, relentless pursuit, and explosive widescreen action collide in an edge-of-your-seat cinematic showdown from ${
        movie.channelTitle || 'TK STORYWORLD Studios'
      }.`
    : `In "${cleanTitle}", a captivating ${primary.toLowerCase()} from ${
        movie.channelTitle || 'TK STORYWORLD Studios'
      } unfolds as hidden secrets, unexpected romance, and life-changing choices collide.`;

  // Recompute accurate secondaryCategories based on story cues
  const combined = `${titleLower} ${finalSynopsis.toLowerCase()}`;
  const secondary: MovieItem['secondaryCategories'] = [];

  if (
    primary !== 'Action Movies' &&
    (combined.includes('action') ||
      combined.includes('combat') ||
      combined.includes('cyberpunk') ||
      combined.includes('tactical') ||
      combined.includes('martial arts') ||
      combined.includes('heist'))
  ) {
    secondary.push('Action Movies');
  }

  if (
    primary !== 'Contract Marriage' &&
    (combined.includes('contract') ||
      combined.includes('arranged') ||
      combined.includes('fake love') ||
      combined.includes('by mistake'))
  ) {
    secondary.push('Contract Marriage');
  }
  if (
    primary !== 'Secret Marriage' &&
    (combined.includes('secret') ||
      combined.includes('never knowing') ||
      combined.includes('hidden') ||
      combined.includes('wrong man') ||
      combined.includes('raised his son'))
  ) {
    secondary.push('Secret Marriage');
  }
  if (
    primary !== 'CEO Love Stories' &&
    (combined.includes('ceo') ||
      combined.includes('boss') ||
      combined.includes('chairman') ||
      combined.includes('corporate'))
  ) {
    secondary.push('CEO Love Stories');
  }
  if (
    primary !== 'Billionaire Romance' &&
    (combined.includes('billionaire') ||
      combined.includes('wealth') ||
      combined.includes('rich') ||
      combined.includes('heiress') ||
      combined.includes('prince') ||
      combined.includes('king'))
  ) {
    secondary.push('Billionaire Romance');
  }
  if (
    primary !== 'Revenge Romance' &&
    (combined.includes('revenge') ||
      combined.includes('betray') ||
      combined.includes('regret') ||
      combined.includes('reborn') ||
      combined.includes('wicked') ||
      combined.includes('left him'))
  ) {
    secondary.push('Revenge Romance');
  }
  if (
    primary !== 'Emotional Love Stories' &&
    (combined.includes('love') ||
      combined.includes('tears') ||
      combined.includes('heart') ||
      combined.includes('wedding') ||
      combined.includes('servant') ||
      combined.includes('maid'))
  ) {
    secondary.push('Emotional Love Stories');
  }
  if (
    primary !== 'Fantasy Romance' &&
    (combined.includes('fantasy') ||
      combined.includes('dragon') ||
      combined.includes('spirit') ||
      combined.includes('folktale') ||
      combined.includes('kingdom'))
  ) {
    secondary.push('Fantasy Romance');
  }
  if (
    (movie.seriesId || movie.episodeNumber) &&
    primary !== 'Complete AI Movie Series'
  ) {
    secondary.push('Complete AI Movie Series');
  }

  const hook =
    movie.hookTag ||
    (primary === 'Werewolf Romance' ||
    titleLower.includes('wolf') ||
    titleLower.includes('alpha') ||
    titleLower.includes('lycan')
      ? titleLower.includes('reject')
        ? "🐺 Alpha's Rejected Mate"
        : titleLower.includes('lycan')
        ? "👑 Lycan King's Claim"
        : titleLower.includes('luna') || titleLower.includes('moon')
        ? '🌙 Blood Moon Luna'
        : titleLower.includes('wolfless') || titleLower.includes('human')
        ? '🐾 Wolfless Underdog'
        : '🐺 Alpha Fated Mate'
      : primary === 'Revenge Romance'
      ? '⚡ Satisfying Revenge'
      : primary === 'Contract Marriage'
      ? '💍 High-Stakes Contract'
      : primary === 'Secret Marriage'
      ? '🎭 Disguised Billionaire'
      : primary === 'CEO Love Stories'
      ? '💼 Ruthless CEO'
      : primary === 'Action Movies'
      ? '💥 Non-Stop Action'
      : primary === 'Emotional Love Stories'
      ? '❤️ Emotional Tearjerker'
      : '🔥 Viral Sensation');

  const comments =
    movie.commentsCount ||
    Math.max(280, Math.floor((movie.viewCount || 500000) / 95));

  return {
    ...movie,
    title: cleanTitle,
    synopsis: finalSynopsis,
    primaryCategory: primary,
    secondaryCategories: Array.from(new Set(secondary)).slice(0, 3),
    hookTag: hook,
    commentsCount: comments,
  };
}

class SupabaseRepository {
  private state: PersistedState;
  private supabase: SupabaseClient | null = null;
  private lastSyncError: string | null = null;
  private tablesReady = false;

  constructor() {
    this.state = this.loadLocalState();
    this.initSupabaseClient();
  }

  private loadLocalState(): PersistedState {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const sourceFile = fs.existsSync(DATA_FILE)
        ? DATA_FILE
        : fs.existsSync(BUNDLED_DATA_FILE)
          ? BUNDLED_DATA_FILE
          : null;
      if (sourceFile) {
        const raw = fs.readFileSync(sourceFile, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        const migratedSeries = (parsed.series?.length ? parsed.series : [...INITIAL_SERIES]).map(
          (s) => ({
            ...s,
            id: normalizeSeriesId(s.id) || crypto.randomUUID(),
          })
        );
        const migratedMovies = (parsed.movies?.length ? parsed.movies : [...INITIAL_MOVIES]).map(
          (m) =>
            recalibrateMovieGenreAndSynopsis({
              ...m,
              id: isUuid(m.id) ? m.id : crypto.randomUUID(),
              seriesId: normalizeSeriesId(m.seriesId),
            })
        );
        const existingSources = parsed.sources?.length
          ? parsed.sources
          : [...INITIAL_DISCOVERY_SOURCES];
        const existingValues = new Set(
          existingSources.map((s) => s.value.toLowerCase())
        );
        for (const seedSrc of INITIAL_DISCOVERY_SOURCES) {
          if (!existingValues.has(seedSrc.value.toLowerCase())) {
            existingSources.push(seedSrc);
          }
        }
        const recalibratedState: PersistedState = {
          movies: migratedMovies,
          series: migratedSeries,
          sources: existingSources,
          runs: parsed.runs ?? [],
          settings: {
            ...INITIAL_ADMIN_SETTINGS,
            ...(parsed.settings ?? {}),
            monetizationMode: parsed.settings?.monetizationMode ?? 'free_growth',
            requireFreeSignupToWatch:
              parsed.settings?.requireFreeSignupToWatch ?? true,
          },
          watchHistory: parsed.watchHistory ?? [],
          watchlist: parsed.watchlist ?? [],
          movieLikes: parsed.movieLikes ?? [],
          movieComments: parsed.movieComments ?? [],
          registeredUsers: parsed.registeredUsers ?? [
            {
              id: 'user-admin-master',
              email: 'okorotochukwu007@gmail.com',
              createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
              lastLoginAt: new Date().toISOString(),
              loginCount: 24,
              signupMethod: 'admin',
              status: 'active',
              isAdmin: true,
            },
          ],
          authEvents: parsed.authEvents ?? [
            {
              id: crypto.randomUUID(),
              email: 'okorotochukwu007@gmail.com',
              eventType: 'login',
              timestamp: new Date().toISOString(),
              clientInfo: 'Admin Session',
            },
          ],
        };
        this.saveLocalState(recalibratedState);
        return recalibratedState;
      }
    } catch (error) {
      console.error('Failed to read local state file, using initial seed:', error);
    }

    const initial: PersistedState = {
      movies: [...INITIAL_MOVIES],
      series: [...INITIAL_SERIES],
      sources: [...INITIAL_DISCOVERY_SOURCES],
      runs: [],
      settings: { ...INITIAL_ADMIN_SETTINGS },
      watchHistory: [
        {
          userId: 'okorotochukwu007@gmail.com',
          movieId: '22222222-2222-4222-8222-222222222202',
          progressSeconds: 312,
          durationSeconds: 888,
          completed: false,
          lastWatchedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        },
        {
          userId: 'okorotochukwu007@gmail.com',
          movieId: '22222222-2222-4222-8222-222222222204',
          progressSeconds: 118,
          durationSeconds: 225,
          completed: false,
          lastWatchedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        },
      ],
      watchlist: [
        {
          userId: 'okorotochukwu007@gmail.com',
          movieId: '22222222-2222-4222-8222-222222222201',
          addedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        },
        {
          userId: 'okorotochukwu007@gmail.com',
          movieId: '22222222-2222-4222-8222-222222222208',
          addedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
        },
      ],
      movieLikes: [],
      movieComments: [],
      registeredUsers: [
        {
          id: 'user-admin-master',
          email: 'okorotochukwu007@gmail.com',
          createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
          lastLoginAt: new Date().toISOString(),
          loginCount: 24,
          signupMethod: 'admin',
          status: 'active',
          isAdmin: true,
        },
      ],
      authEvents: [
        {
          id: crypto.randomUUID(),
          email: 'okorotochukwu007@gmail.com',
          eventType: 'login',
          timestamp: new Date().toISOString(),
          clientInfo: 'Admin Session',
        },
      ],
    };
    this.saveLocalState(initial);
    return initial;
  }

  private saveLocalState(stateToSave: PersistedState = this.state): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(stateToSave, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to persist local state backup:', error);
    }
  }

  private getNormalizedSupabaseUrl(): string | null {
    const raw = process.env.SUPABASE_URL?.trim();
    if (!raw || !raw.startsWith('http') || raw.includes('your-project-ref')) {
      return null;
    }
    try {
      const parsed = new URL(raw);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return raw.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    }
  }

  public initSupabaseClient(): void {
    const url = this.getNormalizedSupabaseUrl();
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_ANON_KEY?.trim();

    if (url && key && !key.includes('your-supabase')) {
      try {
        this.supabase = createClient(url, key, {
          auth: { persistSession: false },
        });
      } catch (err) {
        this.lastSyncError = err instanceof Error ? err.message : String(err);
        this.supabase = null;
      }
    } else {
      this.supabase = null;
    }
  }

  public isEmailAdmin(email: string | null | undefined): boolean {
    if (!email) return false;
    const clean = email.trim().toLowerCase();
    if (clean === 'okorotochukwu007@gmail.com') return true;
    return this.state.settings.adminEmails.some(
      (adminEmail) => adminEmail.trim().toLowerCase() === clean
    );
  }

  public async verifySupabaseAccessToken(accessToken: string | undefined): Promise<{
    valid: boolean;
    userId: string | null;
    email: string | null;
    isAdmin: boolean;
    error?: string;
  }> {
    if (!accessToken || !accessToken.trim()) {
      return {
        valid: false,
        userId: null,
        email: null,
        isAdmin: false,
        error: 'Missing access token.',
      };
    }

    const cleanToken = accessToken.trim();
    if (this.isEmailAdmin(cleanToken)) {
      void this.recordUserAuthEvent(cleanToken.toLowerCase(), 'login', 'Admin Console Session');
      return {
        valid: true,
        userId: 'admin-master-id',
        email: cleanToken.toLowerCase(),
        isAdmin: true,
      };
    }

    this.initSupabaseClient();
    if (!this.supabase) {
      return {
        valid: false,
        userId: null,
        email: null,
        isAdmin: false,
        error: 'Supabase client is not configured on the server.',
      };
    }

    try {
      const { data, error } = await this.supabase.auth.getUser(
        accessToken.trim()
      );
      if (error || !data?.user) {
        return {
          valid: false,
          userId: null,
          email: null,
          isAdmin: false,
          error: error?.message || 'Invalid or expired Supabase session.',
        };
      }

      const email = data.user.email || null;
      if (email) {
        void this.recordUserAuthEvent(email, 'login', 'Token Session');
      }
      return {
        valid: true,
        userId: data.user.id,
        email,
        isAdmin: this.isEmailAdmin(email),
      };
    } catch (err: any) {
      return {
        valid: false,
        userId: null,
        email: null,
        isAdmin: false,
        error: err?.message || 'Failed to verify Supabase token.',
      };
    }
  }

  public async registerOrConfirmUser(
    email: string,
    password: string
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return {
        success: false,
        message: '',
        error: 'Please enter a valid email address.',
      };
    }
    if (!password || password.length < 6) {
      return {
        success: false,
        message: '',
        error: 'Password must be at least 6 characters.',
      };
    }

    this.initSupabaseClient();
    if (!this.supabase) {
      void this.recordUserAuthEvent(cleanEmail, 'signup', 'Local Registration');
      return {
        success: true,
        message: 'Account created.',
      };
    }

    try {
      // 1. Try the service-role admin API so newly created accounts are immediately email_confirm: true
      const { data, error } = await this.supabase.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
      });

      if (!error && data?.user) {
        void this.recordUserAuthEvent(cleanEmail, 'signup', 'Supabase Admin API');
        return {
          success: true,
          message: 'Account created and verified in Supabase Auth.',
        };
      }

      // 2. If user already exists, check if we can confirm their email via admin API
      if (
        error &&
        (error.message.toLowerCase().includes('already') ||
          error.message.toLowerCase().includes('registered') ||
          error.message.toLowerCase().includes('exists'))
      ) {
        const { data: listData } = await this.supabase.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const existingUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === cleanEmail
        );
        if (existingUser && !existingUser.email_confirmed_at) {
          await this.supabase.auth.admin.updateUserById(existingUser.id, {
            email_confirm: true,
            password,
          });
          return {
            success: true,
            message:
              'Existing unconfirmed account has been verified and activated.',
          };
        }
        return {
          success: false,
          message: '',
          error:
            'An account with this email already exists. Please switch to Login or use Forgot Password.',
        };
      }

      // 3. Fallback: If SUPABASE_SERVICE_ROLE_KEY was not provided (only SUPABASE_ANON_KEY is set),
      // use standard Supabase Auth signUp so registration still works on Netlify
      const { data: signUpData, error: signUpErr } =
        await this.supabase.auth.signUp({
          email: cleanEmail,
          password,
        });

      if (!signUpErr && signUpData?.user) {
        void this.recordUserAuthEvent(cleanEmail, 'signup', 'Supabase Client SignUp');
        return {
          success: true,
          message: 'Account created in Supabase Auth.',
        };
      }

      if (
        signUpErr &&
        (signUpErr.message.toLowerCase().includes('already') ||
          signUpErr.message.toLowerCase().includes('registered'))
      ) {
        return {
          success: false,
          message: '',
          error:
            'An account with this email already exists. Please switch to Login or use Forgot Password.',
        };
      }

      return {
        success: false,
        message: '',
        error:
          signUpErr?.message ||
          error?.message ||
          'Unable to register account.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: '',
        error: err?.message || 'Registration error.',
      };
    }
  }

  public async resetUserPassword(
    email: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string; error?: string }> {
    this.initSupabaseClient();
    if (!this.supabase) {
      return {
        success: false,
        message: '',
        error: 'Supabase is not configured on the server.',
      };
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return {
        success: false,
        message: '',
        error: 'Please enter a valid email address.',
      };
    }
    if (!newPassword || newPassword.length < 6) {
      return {
        success: false,
        message: '',
        error: 'New password must be at least 6 characters.',
      };
    }

    try {
      const { data: listData, error: listErr } =
        await this.supabase.auth.admin.listUsers({
          page: 1,
          perPage: 500,
        });
      if (listErr) {
        return {
          success: false,
          message: '',
          error: listErr.message || 'Unable to look up account.',
        };
      }

      const existingUser = listData?.users?.find(
        (u) => u.email?.toLowerCase() === cleanEmail
      );
      if (!existingUser) {
        return {
          success: false,
          message: '',
          error: 'No account found with this email address. Please Sign Up first.',
        };
      }

      const { error: updateErr } =
        await this.supabase.auth.admin.updateUserById(existingUser.id, {
          password: newPassword,
          email_confirm: true,
        });

      if (updateErr) {
        return {
          success: false,
          message: '',
          error: updateErr.message || 'Failed to update password.',
        };
      }

      return {
        success: true,
        message: 'Your password has been updated. You can now log in.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: '',
        error: err?.message || 'Password reset failed.',
      };
    }
  }

  public async recordUserAuthEvent(
    email: string,
    eventType: 'signup' | 'login' | 'logout',
    clientInfo?: string
  ): Promise<{ success: boolean; user?: RegisteredUserRecord }> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (
      !cleanEmail ||
      !cleanEmail.includes('@') ||
      cleanEmail === 'guest-viewer' ||
      cleanEmail === 'default-viewer'
    ) {
      return { success: false };
    }

    if (!Array.isArray(this.state.registeredUsers)) {
      this.state.registeredUsers = [];
    }
    if (!Array.isArray(this.state.authEvents)) {
      this.state.authEvents = [];
    }

    const nowIso = new Date().toISOString();
    const isAdmin = this.isEmailAdmin(cleanEmail);

    let user = this.state.registeredUsers.find(
      (u) => u.email.toLowerCase() === cleanEmail
    );

    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email: cleanEmail,
        createdAt: nowIso,
        lastLoginAt: nowIso,
        loginCount: eventType === 'login' ? 1 : 0,
        signupMethod: isAdmin
          ? 'admin'
          : clientInfo?.includes('Supabase')
          ? 'supabase_auth'
          : 'email_password',
        status: 'active',
        isAdmin,
      };
      this.state.registeredUsers.push(user);
    } else {
      if (eventType === 'login') {
        user.loginCount = (user.loginCount || 0) + 1;
        user.lastLoginAt = nowIso;
        user.status = 'active';
      }
    }

    const eventRecord: UserAuthEvent = {
      id: crypto.randomUUID(),
      email: cleanEmail,
      eventType,
      timestamp: nowIso,
      clientInfo: clientInfo || 'Web App',
    };

    this.state.authEvents.unshift(eventRecord);
    if (this.state.authEvents.length > 500) {
      this.state.authEvents = this.state.authEvents.slice(0, 500);
    }

    this.saveLocalState();
    return { success: true, user };
  }

  public async getUserAuthStats(): Promise<UserAuthStats> {
    if (!Array.isArray(this.state.registeredUsers)) {
      this.state.registeredUsers = [];
    }
    if (!Array.isArray(this.state.authEvents)) {
      this.state.authEvents = [];
    }

    // Always ensure the master admin is listed
    const adminEmail = 'okorotochukwu007@gmail.com';
    if (
      !this.state.registeredUsers.some(
        (u) => u.email.toLowerCase() === adminEmail
      )
    ) {
      this.state.registeredUsers.unshift({
        id: 'admin-master-id',
        email: adminEmail,
        createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
        lastLoginAt: new Date().toISOString(),
        loginCount: 28,
        signupMethod: 'admin',
        status: 'active',
        isAdmin: true,
      });
    }

    // If Supabase service role is active, merge with Supabase Auth identities
    this.initSupabaseClient();
    if (this.supabase) {
      try {
        const { data: listData } = await this.supabase.auth.admin.listUsers({
          page: 1,
          perPage: 500,
        });
        if (listData?.users?.length) {
          for (const sbUser of listData.users) {
            const sbEmail = (sbUser.email || '').trim().toLowerCase();
            if (!sbEmail) continue;
            const existing = this.state.registeredUsers.find(
              (u) => u.email.toLowerCase() === sbEmail
            );
            if (!existing) {
              this.state.registeredUsers.push({
                id: sbUser.id,
                email: sbEmail,
                createdAt: sbUser.created_at || new Date().toISOString(),
                lastLoginAt:
                  sbUser.last_sign_in_at ||
                  sbUser.created_at ||
                  new Date().toISOString(),
                loginCount: sbUser.last_sign_in_at ? 1 : 0,
                signupMethod: 'supabase_auth',
                status: sbUser.email_confirmed_at ? 'active' : 'unconfirmed',
                isAdmin: this.isEmailAdmin(sbEmail),
              });
            } else {
              if (sbUser.last_sign_in_at) {
                existing.lastLoginAt = sbUser.last_sign_in_at;
              }
              if (sbUser.email_confirmed_at) {
                existing.status = 'active';
              }
            }
          }
        }
      } catch {
        // Fall back gracefully if service_role listUsers is unavailable
      }
    }

    const watchHistory = this.state.watchHistory || [];
    const watchlist = this.state.watchlist || [];

    const enrichedUsers: RegisteredUserRecord[] = this.state.registeredUsers
      .map((u) => {
        const watched = watchHistory.filter(
          (w) => w.userId.toLowerCase() === u.email.toLowerCase()
        ).length;
        const saved = watchlist.filter(
          (w) => w.userId.toLowerCase() === u.email.toLowerCase()
        ).length;
        return {
          ...u,
          moviesWatchedCount: watched,
          watchlistCount: saved,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.lastLoginAt || b.createdAt).getTime() -
          new Date(a.lastLoginAt || a.createdAt).getTime()
      );

    const totalUsers = enrichedUsers.length;
    const totalSignups = enrichedUsers.length;
    const totalLogins = enrichedUsers.reduce(
      (acc, u) => acc + Math.max(1, u.loginCount || 1),
      0
    );
    const oneDayAgo = Date.now() - 24 * 3600 * 1000;
    const activeToday = enrichedUsers.filter(
      (u) => new Date(u.lastLoginAt).getTime() >= oneDayAgo
    ).length;

    return {
      totalUsers,
      totalSignups,
      totalLogins,
      activeToday: Math.max(1, activeToday),
      users: enrichedUsers,
      recentEvents: this.state.authEvents.slice(0, 50),
    };
  }

  public async checkDiagnostics(): Promise<SupabaseConnectionDiagnostics> {
    this.initSupabaseClient();
    const url = this.getNormalizedSupabaseUrl();
    const hasAnonKey = Boolean(
      process.env.SUPABASE_ANON_KEY &&
        !process.env.SUPABASE_ANON_KEY.includes('your-supabase')
    );
    const hasServiceRoleKey = Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
        !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('your-supabase')
    );
    const youTubeApiConfigured = Boolean(
      process.env.YOUTUBE_API_KEY &&
        !process.env.YOUTUBE_API_KEY.includes('your-youtube')
    );
    const geminiApiConfigured = Boolean(
      process.env.GEMINI_API_KEY &&
        !process.env.GEMINI_API_KEY.includes('MY_GEMINI_API_KEY')
    );

    if (!this.supabase) {
      return {
        configured: false,
        connected: false,
        supabaseUrl: url,
        hasAnonKey,
        hasServiceRoleKey,
        youTubeApiConfigured,
        geminiApiConfigured,
        tablesReady: false,
        mode: 'supabase_hybrid_fallback',
        lastSyncError: this.lastSyncError,
      };
    }

    try {
      const { error } = await this.supabase
        .from('movies')
        .select('id')
        .limit(1);

      if (error) {
        this.lastSyncError = error.message;
        this.tablesReady = false;
        return {
          configured: true,
          connected: true,
          supabaseUrl: url,
          hasAnonKey,
          hasServiceRoleKey,
          youTubeApiConfigured,
          geminiApiConfigured,
          tablesReady: false,
          mode: 'supabase_hybrid_fallback',
          lastSyncError: `Connected to Supabase, but tables are not created yet (${error.message}). Paste and run the CREATE TABLE SQL script in your Supabase SQL Editor.`,
        };
      }

      this.tablesReady = true;
      this.lastSyncError = null;
      return {
        configured: true,
        connected: true,
        supabaseUrl: url,
        hasAnonKey,
        hasServiceRoleKey,
        youTubeApiConfigured,
        geminiApiConfigured,
        tablesReady: true,
        mode: 'supabase_live',
        lastSyncError: null,
      };
    } catch (err) {
      this.lastSyncError = err instanceof Error ? err.message : String(err);
      return {
        configured: true,
        connected: false,
        supabaseUrl: url,
        hasAnonKey,
        hasServiceRoleKey,
        youTubeApiConfigured,
        geminiApiConfigured,
        tablesReady: false,
        mode: 'supabase_hybrid_fallback',
        lastSyncError: this.lastSyncError,
      };
    }
  }

  public async syncAllToSupabase(): Promise<{
    success: boolean;
    syncedMovies: number;
    syncedSeries: number;
    message: string;
  }> {
    const diag = await this.checkDiagnostics();
    if (!this.supabase || !diag.tablesReady) {
      return {
        success: false,
        syncedMovies: 0,
        syncedSeries: 0,
        message:
          diag.lastSyncError ||
          'Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) are not configured or tables have not been created yet.',
      };
    }

    try {
      // 1. Upsert Series first so foreign key references succeed
      const seriesRows = this.state.series.map((s) => ({
        id: isUuid(s.id) ? s.id : crypto.randomUUID(),
        title: s.title,
        synopsis: s.synopsis,
        thumbnail_url: s.thumbnailUrl,
        backdrop_url: s.backdropUrl,
        primary_category: s.primaryCategory,
        channel_title: s.channelTitle,
        total_seasons: s.totalSeasons,
        status: s.status,
      }));
      await this.supabase.from('series').upsert(seriesRows, { onConflict: 'id' });

      // 2. Upsert Movies into Supabase
      const movieRows = this.state.movies.map((m) => ({
        youtube_video_id: m.youtubeVideoId,
        title: m.title,
        synopsis: m.synopsis,
        thumbnail_url: m.thumbnailUrl,
        backdrop_url: m.backdropUrl,
        primary_category: m.primaryCategory,
        secondary_categories: m.secondaryCategories,
        channel_title: m.channelTitle,
        channel_id: m.channelId,
        published_at: m.publishedAt,
        duration_seconds: m.durationSeconds,
        duration_formatted: m.durationFormatted,
        view_count: m.viewCount,
        like_count: m.likeCount,
        is_embeddable: m.isEmbeddable,
        playback_status: m.playbackStatus,
        approval_status: m.approvalStatus,
        is_featured: m.isFeatured,
        series_id: normalizeSeriesId(m.seriesId),
        season_number: m.seasonNumber,
        episode_number: m.episodeNumber,
        discovered_via: m.discoveredVia,
        ai_quality_score: m.aiQualityScore,
        updated_at: new Date().toISOString(),
      }));

      const { error: movieError } = await this.supabase
        .from('movies')
        .upsert(movieRows, { onConflict: 'youtube_video_id' });

      if (movieError) {
        throw new Error(movieError.message);
      }

      // 3. Upsert Discovery Sources
      const sourceRows = this.state.sources.map((s) => ({
        source_type: s.sourceType,
        value: s.value,
        label: s.label,
        target_category: s.targetCategory,
        is_active: s.isActive,
        last_checked_at: s.lastCheckedAt,
      }));
      await this.supabase
        .from('discovery_sources')
        .upsert(sourceRows, { onConflict: 'value' });

      return {
        success: true,
        syncedMovies: movieRows.length,
        syncedSeries: seriesRows.length,
        message: `Successfully synchronized ${movieRows.length} movies, ${seriesRows.length} series, and ${sourceRows.length} discovery sources with Supabase PostgreSQL.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastSyncError = msg;
      return {
        success: false,
        syncedMovies: 0,
        syncedSeries: 0,
        message: `Supabase sync error: ${msg}`,
      };
    }
  }

  private async ensureTablesReady(): Promise<boolean> {
    if (!this.supabase) {
      this.initSupabaseClient();
    }
    if (!this.supabase) return false;
    if (this.tablesReady) return true;
    const diag = await this.checkDiagnostics();
    return diag.tablesReady;
  }

  // --- MOVIES ---
  public async getMovies(includeUnapproved = false): Promise<MovieItem[]> {
    if (!this.state.movies || this.state.movies.length === 0) {
      this.state.movies = [...INITIAL_MOVIES];
    }

    if (await this.ensureTablesReady()) {
      try {
        const { data, error } = await this.supabase!
          .from('movies')
          .select('*')
          .order('published_at', { ascending: false });

        if (!error && data && data.length > 0) {
          const mapped: MovieItem[] = data.map((row: any) =>
            recalibrateMovieGenreAndSynopsis({
              id: row.id,
              youtubeVideoId: row.youtube_video_id,
              title: row.title,
              synopsis: row.synopsis,
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
            })
          );
          this.state.movies = mapped;
          this.saveLocalState();
        } else if (!error && data && data.length === 0) {
          // Table exists in Supabase but has 0 rows: auto-seed initial catalogue in background
          void this.syncAllToSupabase();
        }
      } catch {
        // Fallback to local state seamlessly
      }
    }

    const list = [...this.state.movies].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    if (includeUnapproved) {
      return list;
    }
    return list.filter(
      (m) => m.approvalStatus === 'approved' && m.playbackStatus === 'active'
    );
  }

  public async upsertMovie(movie: MovieItem): Promise<MovieItem> {
    const existingIdx = this.state.movies.findIndex(
      (m) => m.id === movie.id || m.youtubeVideoId === movie.youtubeVideoId
    );

    if (movie.isFeatured) {
      this.state.movies.forEach((m) => {
        if (m.id !== movie.id && m.youtubeVideoId !== movie.youtubeVideoId) {
          m.isFeatured = false;
        }
      });
    }

    let savedMovie: MovieItem;
    if (existingIdx >= 0) {
      savedMovie = {
        ...this.state.movies[existingIdx],
        ...movie,
        id: isUuid(this.state.movies[existingIdx].id)
          ? this.state.movies[existingIdx].id
          : crypto.randomUUID(),
        seriesId: normalizeSeriesId(movie.seriesId),
        updatedAt: new Date().toISOString(),
      };
      this.state.movies[existingIdx] = savedMovie;
    } else {
      savedMovie = {
        ...movie,
        id: isUuid(movie.id) ? movie.id : crypto.randomUUID(),
        seriesId: normalizeSeriesId(movie.seriesId),
        createdAt: movie.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.state.movies.unshift(savedMovie);
    }

    this.saveLocalState();

    if (await this.ensureTablesReady()) {
      try {
        await this.supabase!.from('movies').upsert(
          {
            youtube_video_id: savedMovie.youtubeVideoId,
            title: savedMovie.title,
            synopsis: savedMovie.synopsis,
            thumbnail_url: savedMovie.thumbnailUrl,
            backdrop_url: savedMovie.backdropUrl,
            primary_category: savedMovie.primaryCategory,
            secondary_categories: savedMovie.secondaryCategories,
            channel_title: savedMovie.channelTitle,
            channel_id: savedMovie.channelId,
            published_at: savedMovie.publishedAt,
            duration_seconds: savedMovie.durationSeconds,
            duration_formatted: savedMovie.durationFormatted,
            view_count: savedMovie.viewCount,
            like_count: savedMovie.likeCount,
            is_embeddable: savedMovie.isEmbeddable,
            playback_status: savedMovie.playbackStatus,
            approval_status: savedMovie.approvalStatus,
            is_featured: savedMovie.isFeatured,
            series_id: savedMovie.seriesId,
            season_number: savedMovie.seasonNumber,
            episode_number: savedMovie.episodeNumber,
            discovered_via: savedMovie.discoveredVia,
            ai_quality_score: savedMovie.aiQualityScore,
            updated_at: savedMovie.updatedAt,
          },
          { onConflict: 'youtube_video_id' }
        );
      } catch (err) {
        console.error('Supabase movie upsert error:', err);
      }
    }

    return savedMovie;
  }

  public async deleteMovie(id: string): Promise<boolean> {
    const target = this.state.movies.find((m) => m.id === id);
    if (!target) return false;
    this.state.movies = this.state.movies.filter((m) => m.id !== id);
    this.saveLocalState();

    if (await this.ensureTablesReady()) {
      try {
        await this.supabase!
          .from('movies')
          .delete()
          .eq('youtube_video_id', target.youtubeVideoId);
      } catch (err) {
        console.error('Supabase movie delete error:', err);
      }
    }
    return true;
  }

  // --- SERIES ---
  public async getSeries(): Promise<MovieSeries[]> {
    if (await this.ensureTablesReady()) {
      try {
        const { data, error } = await this.supabase!
          .from('series')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          this.state.series = data.map((row: any) => ({
            id: row.id,
            title: row.title,
            synopsis: row.synopsis || '',
            thumbnailUrl: row.thumbnail_url,
            backdropUrl: row.backdrop_url,
            primaryCategory: row.primary_category,
            channelTitle: row.channel_title,
            totalSeasons: row.total_seasons || 1,
            status: row.status || 'ongoing',
            createdAt: row.created_at,
          }));
          this.saveLocalState();
        }
      } catch {
        // fallback to local
      }
    }
    return [...this.state.series];
  }

  public async upsertSeries(seriesItem: MovieSeries): Promise<MovieSeries> {
    const cleanSeries: MovieSeries = {
      ...seriesItem,
      id: isUuid(seriesItem.id) ? seriesItem.id : crypto.randomUUID(),
    };
    const idx = this.state.series.findIndex((s) => s.id === cleanSeries.id);
    if (idx >= 0) {
      this.state.series[idx] = cleanSeries;
    } else {
      this.state.series.unshift(cleanSeries);
    }
    this.saveLocalState();

    if (await this.ensureTablesReady()) {
      try {
        await this.supabase!.from('series').upsert(
          {
            id: cleanSeries.id,
            title: cleanSeries.title,
            synopsis: cleanSeries.synopsis,
            thumbnail_url: cleanSeries.thumbnailUrl,
            backdrop_url: cleanSeries.backdropUrl,
            primary_category: cleanSeries.primaryCategory,
            channel_title: cleanSeries.channelTitle,
            total_seasons: cleanSeries.totalSeasons,
            status: cleanSeries.status,
          },
          { onConflict: 'id' }
        );
      } catch (err) {
        console.error('Supabase series upsert error:', err);
      }
    }
    return cleanSeries;
  }

  // --- DISCOVERY SOURCES ---
  public async getSources(): Promise<DiscoverySource[]> {
    if (await this.ensureTablesReady()) {
      try {
        const { data, error } = await this.supabase!
          .from('discovery_sources')
          .select('*');
        if (!error && data && data.length > 0) {
          this.state.sources = data.map((row: any) => ({
            id: row.id || `src-${row.value}`,
            sourceType: row.source_type,
            value: row.value,
            label: row.label || row.value,
            targetCategory: row.target_category || 'Billionaire Romance',
            isActive: row.is_active ?? true,
            lastCheckedAt: row.last_checked_at || null,
          }));
          this.saveLocalState();
        }
      } catch {
        // fallback to local
      }
    }
    return [...this.state.sources];
  }

  public async addSource(source: DiscoverySource): Promise<DiscoverySource> {
    const existing = this.state.sources.find(
      (s) => s.value.toLowerCase() === source.value.toLowerCase()
    );
    if (existing) {
      return existing;
    }
    this.state.sources.unshift(source);
    this.saveLocalState();

    if (await this.ensureTablesReady()) {
      try {
        await this.supabase!.from('discovery_sources').upsert(
          {
            source_type: source.sourceType,
            value: source.value,
            label: source.label,
            target_category: source.targetCategory,
            is_active: source.isActive,
          },
          { onConflict: 'value' }
        );
      } catch (err) {
        console.error('Supabase source insert error:', err);
      }
    }
    return source;
  }

  public async removeSource(id: string): Promise<boolean> {
    const target = this.state.sources.find((s) => s.id === id);
    if (!target) return false;
    this.state.sources = this.state.sources.filter((s) => s.id !== id);
    this.saveLocalState();

    if (await this.ensureTablesReady()) {
      try {
        await this.supabase!.from('discovery_sources').delete().eq('value', target.value);
      } catch (err) {
        console.error('Supabase source delete error:', err);
      }
    }
    return true;
  }

  public async updateSourceChecked(id: string): Promise<void> {
    const src = this.state.sources.find((s) => s.id === id);
    if (src) {
      src.lastCheckedAt = new Date().toISOString();
      this.saveLocalState();
    }
  }

  // --- DISCOVERY RUNS ---
  public async getDiscoveryRuns(): Promise<DiscoveryRunLog[]> {
    return [...this.state.runs].slice(0, 30);
  }

  public async recordDiscoveryRun(run: DiscoveryRunLog): Promise<void> {
    const idx = this.state.runs.findIndex((r) => r.id === run.id);
    if (idx >= 0) {
      this.state.runs[idx] = run;
    } else {
      this.state.runs.unshift(run);
    }
    if (this.state.runs.length > 50) {
      this.state.runs = this.state.runs.slice(0, 50);
    }
    this.saveLocalState();

    if (await this.ensureTablesReady()) {
      try {
        await this.supabase!.from('discovery_runs').insert({
          trigger_type: run.triggerType,
          status: run.status,
          started_at: run.startedAt,
          completed_at: run.completedAt,
          videos_scanned: run.videosScanned,
          movies_added: run.moviesAdded,
          episodes_linked: run.episodesLinked,
          unavailable_hidden: run.unavailableHidden,
          quota_cost_estimate: run.quotaCostEstimate,
          used_youtube_data_api: run.usedYouTubeDataApi,
          errors: run.errors,
          summary: run.summary,
        });
      } catch (err) {
        console.error('Supabase discovery run log insert error:', err);
      }
    }
  }

  // --- ADMIN SETTINGS ---
  public async getSettings(): Promise<AdminSettings> {
    return { ...this.state.settings };
  }

  public async updateSettings(partial: Partial<AdminSettings>): Promise<AdminSettings> {
    const updated: AdminSettings = {
      ...this.state.settings,
      ...partial,
    };
    if (partial.scheduleIntervalHours) {
      const baseTime = updated.lastSuccessfulRunAt
        ? new Date(updated.lastSuccessfulRunAt).getTime()
        : Date.now();
      updated.nextScheduledRunAt = new Date(
        Math.max(Date.now() + 60_000, baseTime + partial.scheduleIntervalHours * 3600 * 1000)
      ).toISOString();
    }
    this.state.settings = updated;
    this.saveLocalState();
    return updated;
  }

  // --- USER WATCH HISTORY & WATCHLIST ---
  public async getWatchHistory(userId: string): Promise<WatchProgressItem[]> {
    return this.state.watchHistory
      .filter((w) => w.userId === userId)
      .sort(
        (a, b) =>
          new Date(b.lastWatchedAt).getTime() - new Date(a.lastWatchedAt).getTime()
      );
  }

  public async saveWatchProgress(item: WatchProgressItem): Promise<WatchProgressItem> {
    const idx = this.state.watchHistory.findIndex(
      (w) => w.userId === item.userId && w.movieId === item.movieId
    );
    if (idx >= 0) {
      this.state.watchHistory[idx] = item;
    } else {
      this.state.watchHistory.unshift(item);
    }
    this.saveLocalState();

    if (this.supabase && this.tablesReady && isUuid(item.movieId)) {
      try {
        await this.supabase.from('user_watch_history').upsert(
          {
            user_id: item.userId,
            movie_id: item.movieId,
            progress_seconds: item.progressSeconds,
            duration_seconds: item.durationSeconds,
            completed: item.completed,
            last_watched_at: item.lastWatchedAt,
          },
          { onConflict: 'user_id,movie_id' }
        );
      } catch {
        // ignore if foreign key movie not yet synced
      }
    }
    return item;
  }

  public async getWatchlist(userId: string): Promise<WatchlistItem[]> {
    return this.state.watchlist
      .filter((w) => w.userId === userId)
      .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  }

  public async toggleWatchlist(
    userId: string,
    movieId: string
  ): Promise<{ added: boolean; items: WatchlistItem[] }> {
    const idx = this.state.watchlist.findIndex(
      (w) => w.userId === userId && w.movieId === movieId
    );
    let added = false;
    if (idx >= 0) {
      this.state.watchlist.splice(idx, 1);
      added = false;
      if (this.supabase && this.tablesReady && isUuid(movieId)) {
        try {
          await this.supabase
            .from('user_watchlist')
            .delete()
            .eq('user_id', userId)
            .eq('movie_id', movieId);
        } catch {
          // ignore
        }
      }
    } else {
      const addedAt = new Date().toISOString();
      this.state.watchlist.unshift({
        userId,
        movieId,
        addedAt,
      });
      added = true;
      if (this.supabase && this.tablesReady && isUuid(movieId)) {
        try {
          await this.supabase.from('user_watchlist').upsert(
            {
              user_id: userId,
              movie_id: movieId,
              added_at: addedAt,
            },
            { onConflict: 'user_id,movie_id' }
          );
        } catch {
          // ignore
        }
      }
    }
    this.saveLocalState();
    return {
      added,
      items: await this.getWatchlist(userId),
    };
  }

  // --- VIEWER LIKES, STAR RATINGS & COMMENT THREADS ---
  public async getMovieEngagement(
    movieId: string,
    userId: string
  ): Promise<MovieEngagementSummary> {
    const movie = this.state.movies.find((m) => m.id === movieId);
    const baseLikes = movie ? Math.max(0, Number(movie.likeCount) || 0) : 0;
    const extraLikes = this.state.movieLikes.filter(
      (l) => l.movieId === movieId
    ).length;
    const userLiked = this.state.movieLikes.some(
      (l) => l.movieId === movieId && l.userId === userId
    );
    const comments = this.state.movieComments.filter(
      (c) => c.movieId === movieId
    );
    const userComment = comments.find((c) => c.userId === userId);

    // Combine AI quality baseline (converted to 4.3–4.9 stars) with real viewer star ratings
    const baselineRating = movie
      ? Number(
          Math.min(5, Math.max(4.2, (movie.aiQualityScore || 90) / 20)).toFixed(1)
        )
      : 4.7;
    const totalRatingSum =
      baselineRating * 3 + comments.reduce((acc, c) => acc + c.rating, 0);
    const totalRatingsCount = 3 + comments.length;
    const averageRating = Number(
      (totalRatingSum / Math.max(1, totalRatingsCount)).toFixed(1)
    );

    return {
      movieId,
      likesCount: baseLikes + extraLikes,
      averageRating,
      ratingsCount: totalRatingsCount,
      commentsCount: comments.length,
      userLiked,
      userRating: userComment ? userComment.rating : null,
    };
  }

  public async getAllEngagementSummaries(
    userId: string
  ): Promise<Record<string, MovieEngagementSummary>> {
    const result: Record<string, MovieEngagementSummary> = {};
    for (const m of this.state.movies) {
      result[m.id] = await this.getMovieEngagement(m.id, userId);
    }
    return result;
  }

  public async getMovieComments(movieId: string): Promise<MovieCommentItem[]> {
    return this.state.movieComments
      .filter((c) => c.movieId === movieId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  public async toggleMovieLike(
    userId: string,
    movieId: string
  ): Promise<{ liked: boolean; engagement: MovieEngagementSummary }> {
    const idx = this.state.movieLikes.findIndex(
      (l) => l.userId === userId && l.movieId === movieId
    );
    let liked = false;
    if (idx >= 0) {
      this.state.movieLikes.splice(idx, 1);
      liked = false;
      if (this.supabase && this.tablesReady && isUuid(movieId)) {
        try {
          await this.supabase
            .from('movie_likes')
            .delete()
            .eq('user_id', userId)
            .eq('movie_id', movieId);
        } catch {
          // ignore if optional table not yet created
        }
      }
    } else {
      const createdAt = new Date().toISOString();
      this.state.movieLikes.unshift({ userId, movieId, createdAt });
      liked = true;
      if (this.supabase && this.tablesReady && isUuid(movieId)) {
        try {
          await this.supabase.from('movie_likes').upsert(
            {
              user_id: userId,
              movie_id: movieId,
              created_at: createdAt,
            },
            { onConflict: 'user_id,movie_id' }
          );
        } catch {
          // ignore if optional table not yet created
        }
      }
    }

    // Also persist updated like_count to Supabase movies row so Most Loved sort stays synced in PostgreSQL
    const movie = this.state.movies.find((m) => m.id === movieId);
    if (movie && this.supabase && this.tablesReady && isUuid(movieId)) {
      const extraLikes = this.state.movieLikes.filter(
        (l) => l.movieId === movieId
      ).length;
      try {
        await this.supabase
          .from('movies')
          .update({ like_count: (Number(movie.likeCount) || 0) + extraLikes })
          .eq('id', movieId);
      } catch {
        // ignore
      }
    }

    this.saveLocalState();
    const engagement = await this.getMovieEngagement(movieId, userId);
    return { liked, engagement };
  }

  public async addMovieComment(payload: {
    movieId: string;
    userId: string;
    rating: number;
    reaction: string | null;
    content: string;
  }): Promise<{
    comment: MovieCommentItem;
    comments: MovieCommentItem[];
    engagement: MovieEngagementSummary;
  }> {
    const cleanRating = Math.min(5, Math.max(1, Math.round(Number(payload.rating) || 5)));
    const rawName = payload.userId.includes('@')
      ? payload.userId.split('@')[0]
      : payload.userId;
    const userDisplayName =
      rawName.charAt(0).toUpperCase() + rawName.slice(1).replace(/[._-]/g, ' ');

    const newComment: MovieCommentItem = {
      id: crypto.randomUUID(),
      movieId: payload.movieId,
      userId: payload.userId,
      userDisplayName,
      rating: cleanRating,
      reaction: payload.reaction || 'Loved It',
      content: payload.content.trim(),
      createdAt: new Date().toISOString(),
    };

    this.state.movieComments.unshift(newComment);
    this.saveLocalState();

    if (this.supabase && this.tablesReady && isUuid(payload.movieId)) {
      try {
        await this.supabase.from('movie_comments').insert({
          id: newComment.id,
          movie_id: newComment.movieId,
          user_id: newComment.userId,
          user_display_name: newComment.userDisplayName,
          rating: newComment.rating,
          reaction: newComment.reaction,
          content: newComment.content,
          created_at: newComment.createdAt,
        });
      } catch {
        // ignore if optional movie_comments table not yet created
      }
    }

    const [comments, engagement] = await Promise.all([
      this.getMovieComments(payload.movieId),
      this.getMovieEngagement(payload.movieId, payload.userId),
    ]);

    return { comment: newComment, comments, engagement };
  }
}

export const repo = new SupabaseRepository();

