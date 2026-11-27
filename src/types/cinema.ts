export const MOVIE_CATEGORIES = [
  'New Movies',
  '2026 Series Movies',
  'Action Movies',
  'Billionaire Romance',
  'CEO Love Stories',
  'Contract Marriage',
  'Secret Marriage',
  'Revenge Romance',
  'Emotional Love Stories',
  'Fantasy Romance',
  'Werewolf Romance',
  'AI Animated Movies',
  'Trending AI Movies',
  'Newly Released Movies',
  'Complete AI Movie Series',
] as const;

export type MovieCategory = (typeof MOVIE_CATEGORIES)[number];

export type PlaybackStatus = 'active' | 'unavailable' | 'embed_restricted' | 'private';
export type ApprovalStatus = 'approved' | 'pending' | 'rejected';
export type VideoSourcePlatform = 'youtube' | 'dailymotion' | 'vimeo' | 'archive';
export type DiscoveryOrigin =
  | 'youtube_api'
  | 'rss_feed'
  | 'manual'
  | 'dailymotion_api'
  | 'vimeo_api'
  | 'internet_archive_api'
  | 'tmdb_2026';

export interface MovieItem {
  id: string;
  youtubeVideoId: string;
  sourcePlatform?: VideoSourcePlatform;
  externalVideoId?: string;
  embedUrl?: string;
  releaseKind?: 'full_movie' | 'official_trailer';
  tmdbId?: number;
  releaseDate?: string;
  voteAverage?: number;
  watchProviders?: Array<{ name: string; url: string }>;
  title: string;
  synopsis: string;
  thumbnailUrl: string;
  backdropUrl: string;
  primaryCategory: MovieCategory;
  secondaryCategories: MovieCategory[];
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  durationSeconds: number;
  durationFormatted: string;
  viewCount: number;
  likeCount: number;
  commentsCount?: number;
  hookTag?: string;
  isEmbeddable: boolean;
  playbackStatus: PlaybackStatus;
  approvalStatus: ApprovalStatus;
  isFeatured: boolean;
  seriesId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  discoveredVia: DiscoveryOrigin;
  aiQualityScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface TmdbPremiereItem {
  id: string;
  tmdbId?: number;
  title: string;
  overview: string;
  releaseDate: string;
  releaseYear: string;
  posterUrl: string;
  backdropUrl: string;
  rating: number;
  genres: string[];
  region: 'global' | 'nollywood';
  sourcePlatform: VideoSourcePlatform;
  videoId: string | null;
  releaseKind: 'full_movie' | 'official_trailer';
  channelTitle?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  watchProviders: Array<{ name: string; url: string }>;
  sourceMode: 'tmdb_live' | 'live_cinema_fallback';
}

export interface TmdbPremieresResponse {
  mode: 'tmdb_live' | 'live_cinema_fallback';
  updatedAt: string;
  total: number;
  items: TmdbPremiereItem[];
}

export type SeriesGenreBucket =
  | 'nollywood'
  | 'crime_thriller'
  | 'action_scifi'
  | 'kdrama_asian'
  | 'horror_mystery';

export interface MovieSeries {
  id: string;
  title: string;
  synopsis: string;
  thumbnailUrl: string;
  backdropUrl: string;
  primaryCategory: MovieCategory;
  channelTitle: string;
  totalSeasons: number;
  status: 'ongoing' | 'complete';
  createdAt: string;
  releaseYear?: string;
  genreTag?: string;
  genreBucket?: SeriesGenreBucket;
  is2026Series?: boolean;
  totalViews?: number;
  rating?: number;
  hookTag?: string;
}

export interface DiscoverySource {
  id: string;
  sourceType: 'search_query' | 'youtube_channel';
  value: string;
  label: string;
  targetCategory: MovieCategory;
  isActive: boolean;
  lastCheckedAt: string | null;
}

export interface DiscoveryErrorEntry {
  timestamp: string;
  source: string;
  message: string;
  code?: string;
}

export interface DiscoveryRunLog {
  id: string;
  triggerType: 'scheduled' | 'manual' | 'webhook' | 'startup';
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  videosScanned: number;
  moviesAdded: number;
  episodesLinked: number;
  unavailableHidden: number;
  quotaCostEstimate: number;
  usedYouTubeDataApi: boolean;
  errors: DiscoveryErrorEntry[];
  summary: string;
}

export interface AdminSettings {
  scheduleIntervalHours: 6 | 12 | 24;
  discoveryIntervalHours?: number;
  autoPublishEnabled: boolean;
  minDurationSeconds: number;
  requireEmbeddable: boolean;
  lastSuccessfulRunAt: string | null;
  lastDiscoveryRunAt?: string | null;
  nextScheduledRunAt: string;
  adminEmails: string[];
  adminNotificationCount: number;
  monetizationMode?: 'free_growth' | 'paid_vip';
  requireFreeSignupToWatch?: boolean;
}

export interface WatchProgressItem {
  userId: string;
  movieId: string;
  progressSeconds: number;
  durationSeconds: number;
  completed: boolean;
  lastWatchedAt: string;
}

export interface WatchlistItem {
  userId: string;
  movieId: string;
  addedAt: string;
}

export interface MovieLikeItem {
  userId: string;
  movieId: string;
  createdAt: string;
}

export interface MovieCommentItem {
  id: string;
  movieId: string;
  userId: string;
  userDisplayName: string;
  rating: number; // 1 to 5 stars
  reaction: string | null;
  content: string;
  createdAt: string;
}

export interface MovieEngagementSummary {
  movieId: string;
  likesCount: number;
  averageRating: number;
  ratingsCount: number;
  commentsCount: number;
  userLiked: boolean;
  userRating: number | null;
}

export interface SupabaseConnectionDiagnostics {
  configured: boolean;
  connected: boolean;
  supabaseUrl: string | null;
  hasAnonKey: boolean;
  hasServiceRoleKey: boolean;
  youTubeApiConfigured: boolean;
  geminiApiConfigured: boolean;
  tablesReady: boolean;
  mode: 'supabase_live' | 'supabase_hybrid_fallback';
  lastSyncError: string | null;
}

export interface RegisteredUserRecord {
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt: string;
  loginCount: number;
  signupMethod: 'email_password' | 'supabase_auth' | 'admin';
  status: 'active' | 'unconfirmed';
  isAdmin: boolean;
  moviesWatchedCount?: number;
  watchlistCount?: number;
}

export interface UserAuthEvent {
  id: string;
  email: string;
  eventType: 'signup' | 'login' | 'logout';
  timestamp: string;
  clientInfo?: string;
}

export interface UserAuthStats {
  totalUsers: number;
  totalSignups: number;
  totalLogins: number;
  activeToday: number;
  users: RegisteredUserRecord[];
  recentEvents: UserAuthEvent[];
}

export type MovieAvailabilityStatus =
  | 'FULL_MOVIE_AVAILABLE'
  | 'TRAILER_AVAILABLE'
  | 'EXTERNAL_STREAMING'
  | 'COMING_SOON';

export type SearchSortOption = 'latest' | 'trending' | 'popular' | 'top_rated';

export type SearchQueryMode =
  | 'exact_title'
  | 'typo_or_partial'
  | 'category'
  | 'plot_description'
  | 'trending_or_latest'
  | 'non_movie';

export interface ExternalCatalogMovieItem {
  id: string;
  tmdbId: number;
  title: string;
  releaseDate: string;
  releaseYear: string;
  overview: string;
  posterUrl?: string;
  backdropUrl?: string;
  rating: number;
  voteCount: number;
  popularity: number;
  genres: string[];
  availabilityStatus: MovieAvailabilityStatus;
  matchedInAppMovieId?: string;
  trailerVideoId?: string;
  externalWatchUrl: string;
  justWatchUrl: string;
  matchReason?: string;
}

export interface SearchSuggestionItem {
  text: string;
  kind: 'category' | 'movie_title' | 'correction' | 'trending';
  subtitle?: string;
  releaseYear?: string;
  posterUrl?: string;
  rating?: number;
  availabilityStatus?: MovieAvailabilityStatus;
  inAppMovieId?: string;
}

export interface SearchAnalyticsRecord {
  query: string;
  normalizedQuery: string;
  correctedQuery?: string;
  queryMode: SearchQueryMode;
  detectedCategory?: string | null;
  inAppCount: number;
  playableExternalCount: number;
  catalogCount: number;
  zeroResults: boolean;
  timestamp: string;
}

export interface SearchAnalyticsSummary {
  totalSearches: number;
  zeroResultCount: number;
  externalDiscoveriesTotal: number;
  verifiedPlayableSourcesTotal: number;
  topSearchedTitles: Array<{ query: string; count: number; lastSearchedAt: string }>;
  topSearchedGenres: Array<{ genre: string; count: number }>;
  zeroResultQueries: Array<{ query: string; count: number; lastSearchedAt: string }>;
  popularSuggestions: string[];
  recentSearches: SearchAnalyticsRecord[];
}



