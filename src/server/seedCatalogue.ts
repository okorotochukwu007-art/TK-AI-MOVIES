import bundledCatalogue from '../../data/aetheria-db.json';
import {
  AdminSettings,
  DiscoverySource,
  MovieItem,
  MovieSeries,
} from '../types/cinema.ts';

export const SERIES_OBSIDIAN_ID = '11111111-1111-4111-8111-111111111101';
export const SERIES_CRIMSON_ID = '11111111-1111-4111-8111-111111111102';

export const INITIAL_SERIES: MovieSeries[] = [
  {
    id: SERIES_OBSIDIAN_ID,
    title: 'The Billionaire’s Sovereign Contract',
    synopsis:
      'When architectural heiress Clara Vance enters a 365-day marriage contract with tech sovereign Julian Sterling to save her late father’s studio, neither expects a buried corporate conspiracy—or genuine devotion—to rewrite the terms.',
    thumbnailUrl: 'https://i.ytimg.com/vi/UXqq0ZvbOnk/hqdefault.jpg',
    backdropUrl: 'https://i.ytimg.com/vi/UXqq0ZvbOnk/maxresdefault.jpg',
    primaryCategory: 'Contract Marriage',
    channelTitle: 'Aetheria AI Cinema Studios',
    totalSeasons: 1,
    status: 'complete',
    createdAt: '2026-10-15T10:00:00.000Z',
  },
  {
    id: SERIES_CRIMSON_ID,
    title: 'Blood Moon of the Alpha Heir',
    synopsis:
      'Exiled from the Northern Silver Pack after a framed betrayal, Lyra returns five years later as an enigmatic art restorer—only to discover her fated mate is now the ruthless Regent of the Lycan Syndicate.',
    thumbnailUrl: 'https://i.ytimg.com/vi/_cMxraX_5RE/hqdefault.jpg',
    backdropUrl: 'https://i.ytimg.com/vi/_cMxraX_5RE/maxresdefault.jpg',
    primaryCategory: 'Werewolf Romance',
    channelTitle: 'Mythos AI Film Collective',
    totalSeasons: 1,
    status: 'ongoing',
    createdAt: '2026-10-20T14:30:00.000Z',
  },
];

export const INITIAL_DISCOVERY_SOURCES: DiscoverySource[] = [
  {
    id: 'src-us-2026-action-blockbusters',
    sourceType: 'search_query',
    value: '2026 new american action movie full movie english HD',
    label: '2026 American Action Blockbusters (Massive Engagement)',
    targetCategory: 'New Movies',
    isActive: true,
    lastCheckedAt: null,
  },
  {
    id: 'src-us-2026-hollywood-thrillers',
    sourceType: 'search_query',
    value: '2026 hollywood crime thriller full movie english',
    label: '2026 Hollywood Crime & Suspense Thrillers',
    targetCategory: 'New Movies',
    isActive: true,
    lastCheckedAt: null,
  },
  {
    id: 'src-us-2026-scifi-blockbusters',
    sourceType: 'search_query',
    value: '2026 american sci fi action movie full movie english',
    label: '2026 American Sci-Fi & Cybernetic Blockbusters',
    targetCategory: 'New Movies',
    isActive: true,
    lastCheckedAt: null,
  },
  {
    id: 'src-us-2026-special-forces',
    sourceType: 'search_query',
    value: '2026 american special forces cia fbi thriller full movie',
    label: '2026 American Special Forces, CIA & FBI Action Movies',
    targetCategory: 'New Movies',
    isActive: true,
    lastCheckedAt: null,
  },
  {
    id: 'src-us-2026-heist-crime',
    sourceType: 'search_query',
    value: '2026 american heist action movie full movie HD',
    label: '2026 American High-Stakes Heist & Detective Movies',
    targetCategory: 'New Movies',
    isActive: true,
    lastCheckedAt: null,
  },
  {
    id: 'src-us-2026-romance-drama',
    sourceType: 'search_query',
    value: '2026 american billionaire romance drama full movie english',
    label: '2026 American Billionaire Romance & High-Drama Movies',
    targetCategory: 'New Movies',
    isActive: true,
    lastCheckedAt: null,
  },
  {
    id: 'src-us-2026-movie-central',
    sourceType: 'search_query',
    value: '2026 full movie english Movie Central blockbuster',
    label: 'Movie Central 2026 American Full-Length Releases',
    targetCategory: 'New Movies',
    isActive: true,
    lastCheckedAt: null,
  },
  {
    id: 'src-us-2026-screen-247',
    sourceType: 'search_query',
    value: '2026 full action movie english Screen 247',
    label: 'Screen 247 2026 American Action & Thriller Hits',
    targetCategory: 'New Movies',
    isActive: true,
    lastCheckedAt: null,
  },
];

export const INITIAL_ADMIN_SETTINGS: AdminSettings = {
  scheduleIntervalHours: 6,
  autoPublishEnabled: true,
  minDurationSeconds: 180,
  requireEmbeddable: true,
  lastSuccessfulRunAt: null,
  nextScheduledRunAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
  adminEmails: ['okorotochukwu007@gmail.com'],
  adminNotificationCount: 0,
  monetizationMode: 'free_growth',
  requireFreeSignupToWatch: true,
};

export const INITIAL_SETTINGS: AdminSettings = INITIAL_ADMIN_SETTINGS;

const BASE_SEED_MOVIES: MovieItem[] = [
  {
    id: '22222222-2222-4222-8222-222222222201',
    youtubeVideoId: 'WhWc3b3KhnY',
    title: 'Spring — Poetic Fantasy Awakening',
    synopsis:
      'A visually breathtaking animated fantasy chronicle following a young shepherdess and her loyal companion as they confront ancient mountain spirits to restore the cycle of life and warmth to a frozen world.',
    thumbnailUrl: 'https://i.ytimg.com/vi/WhWc3b3KhnY/hqdefault.jpg',
    backdropUrl: 'https://i.ytimg.com/vi/WhWc3b3KhnY/maxresdefault.jpg',
    primaryCategory: 'Fantasy Romance',
    secondaryCategories: ['AI Animated Movies', 'Emotional Love Stories', 'Trending AI Movies'],
    channelTitle: 'Blender Studio',
    channelId: 'UCSMOQeBJ2RAnuFungnQOxLg',
    publishedAt: '2026-09-12T16:00:00.000Z',
    durationSeconds: 464,
    durationFormatted: '07:44',
    viewCount: 9840200,
    likeCount: 312000,
    isEmbeddable: true,
    playbackStatus: 'active',
    approvalStatus: 'approved',
    isFeatured: true,
    seriesId: null,
    seasonNumber: null,
    episodeNumber: null,
    discoveredVia: 'rss_feed',
    aiQualityScore: 98,
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222202',
    youtubeVideoId: 'eRsGyueVLvQ',
    title: 'Sintel — Vow of the Dragon Keeper',
    synopsis:
      'An emotional epic of devotion, loss, and relentless pursuit. Across scorching deserts and ancient citadels, a lone warrior searches for the companion torn from her side, uncovering a devastating truth at the end of her quest.',
    thumbnailUrl: 'https://i.ytimg.com/vi/eRsGyueVLvQ/hqdefault.jpg',
    backdropUrl: 'https://i.ytimg.com/vi/eRsGyueVLvQ/maxresdefault.jpg',
    primaryCategory: 'Emotional Love Stories',
    secondaryCategories: ['Fantasy Romance', 'AI Animated Movies', 'Trending AI Movies'],
    channelTitle: 'Blender Studio',
    channelId: 'UCSMOQeBJ2RAnuFungnQOxLg',
    publishedAt: '2026-08-18T12:00:00.000Z',
    durationSeconds: 888,
    durationFormatted: '14:48',
    viewCount: 7420000,
    likeCount: 245000,
    isEmbeddable: true,
    playbackStatus: 'active',
    approvalStatus: 'approved',
    isFeatured: false,
    seriesId: null,
    seasonNumber: null,
    episodeNumber: null,
    discoveredVia: 'rss_feed',
    aiQualityScore: 96,
    createdAt: '2026-10-26T09:00:00.000Z',
    updatedAt: '2026-10-26T09:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222203',
    youtubeVideoId: 'R6MlUcmOul8',
    title: 'Tears of Steel — Memories of Amsterdam',
    synopsis:
      'In a cybernetic future where an estranged couple’s fractured romance holds the key to preventing a global AI uprising, a team of scientists and soldiers stage one final desperate reconstruction of the moment their love broke.',
    thumbnailUrl: 'https://i.ytimg.com/vi/R6MlUcmOul8/hqdefault.jpg',
    backdropUrl: 'https://i.ytimg.com/vi/R6MlUcmOul8/maxresdefault.jpg',
    primaryCategory: 'Revenge Romance',
    secondaryCategories: ['Emotional Love Stories', 'Trending AI Movies', 'Newly Released Movies'],
    channelTitle: 'Blender Foundation',
    channelId: 'UCSMOQeBJ2RAnuFungnQOxLg',
    publishedAt: '2026-10-01T18:00:00.000Z',
    durationSeconds: 734,
    durationFormatted: '12:14',
    viewCount: 4920100,
    likeCount: 164000,
    isEmbeddable: true,
    playbackStatus: 'active',
    approvalStatus: 'approved',
    isFeatured: false,
    seriesId: null,
    seasonNumber: null,
    episodeNumber: null,
    discoveredVia: 'rss_feed',
    aiQualityScore: 94,
    createdAt: '2026-10-27T11:20:00.000Z',
    updatedAt: '2026-10-27T11:20:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222204',
    youtubeVideoId: 'UXqq0ZvbOnk',
    title: 'CHARGE — The Sovereign Syndicate Betrayal',
    synopsis:
      'Inside a high-voltage corporate metropolis, a cornered rogue operative breaks into an energy conglomerate’s vault, confronting the ruthless security apparatus of the dynasty that left him for dead.',
    thumbnailUrl: 'https://i.ytimg.com/vi/UXqq0ZvbOnk/hqdefault.jpg',
    backdropUrl: 'https://i.ytimg.com/vi/UXqq0ZvbOnk/maxresdefault.jpg',
    primaryCategory: 'Billionaire Romance',
    secondaryCategories: ['Revenge Romance', 'AI Animated Movies', 'Trending AI Movies'],
    channelTitle: 'Blender Studio',
    channelId: 'UCSMOQeBJ2RAnuFungnQOxLg',
    publishedAt: '2026-10-14T15:00:00.000Z',
    durationSeconds: 225,
    durationFormatted: '03:45',
    viewCount: 3150000,
    likeCount: 142000,
    isEmbeddable: true,
    playbackStatus: 'active',
    approvalStatus: 'approved',
    isFeatured: false,
    seriesId: SERIES_OBSIDIAN_ID,
    seasonNumber: 1,
    episodeNumber: 1,
    discoveredVia: 'rss_feed',
    aiQualityScore: 95,
    createdAt: '2026-10-28T08:00:00.000Z',
    updatedAt: '2026-10-28T08:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222205',
    youtubeVideoId: 'u9lj-c29dxI',
    title: 'Wing It! — The Heiress & The Maverick',
    synopsis:
      'When an ambitious inventor and a perfectionist aviation partner clash over an impossible prototype, sparks fly in a high-stakes race to launch before their rivals sabotage the hangar.',
    thumbnailUrl: 'https://i.ytimg.com/vi/u9lj-c29dxI/hqdefault.jpg',
    backdropUrl: 'https://i.ytimg.com/vi/u9lj-c29dxI/maxresdefault.jpg',
    primaryCategory: 'CEO Love Stories',
    secondaryCategories: ['Contract Marriage', 'Complete AI Movie Series', 'AI Animated Movies'],
    channelTitle: 'Blender Studio',
    channelId: 'UCSMOQeBJ2RAnuFungnQOxLg',
    publishedAt: '2026-10-19T14:00:00.000Z',
    durationSeconds: 210,
    durationFormatted: '03:30',
    viewCount: 1850000,
    likeCount: 94000,
    isEmbeddable: true,
    playbackStatus: 'active',
    approvalStatus: 'approved',
    isFeatured: false,
    seriesId: SERIES_OBSIDIAN_ID,
    seasonNumber: 1,
    episodeNumber: 2,
    discoveredVia: 'rss_feed',
    aiQualityScore: 92,
    createdAt: '2026-10-29T10:00:00.000Z',
    updatedAt: '2026-10-29T10:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222206',
    youtubeVideoId: 'PVGeM40dABA',
    title: 'Coffee Run — Bittersweet Vows in Retrospect',
    synopsis:
      'Fueled by caffeine and haunted by memories of a secret marriage and sudden heartbreak, a woman races through a surreal cityscape where every street corner replays a chapter of her past love.',
    thumbnailUrl: 'https://i.ytimg.com/vi/PVGeM40dABA/hqdefault.jpg',
    backdropUrl: 'https://i.ytimg.com/vi/PVGeM40dABA/maxresdefault.jpg',
    primaryCategory: 'Secret Marriage',
    secondaryCategories: ['Emotional Love Stories', 'Complete AI Movie Series'],
    channelTitle: 'Blender Studio',
    channelId: 'UCSMOQeBJ2RAnuFungnQOxLg',
    publishedAt: '2026-10-22T12:00:00.000Z',
    durationSeconds: 196,
    durationFormatted: '03:16',
    viewCount: 2410000,
    likeCount: 118000,
    isEmbeddable: true,
    playbackStatus: 'active',
    approvalStatus: 'approved',
    isFeatured: false,
    seriesId: SERIES_OBSIDIAN_ID,
    seasonNumber: 1,
    episodeNumber: 3,
    discoveredVia: 'rss_feed',
    aiQualityScore: 93,
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222207',
    youtubeVideoId: '_cMxraX_5RE',
    title: 'Sprite Fright — Moonlit Woods Reckoning',
    synopsis:
      'When a group of arrogant outsiders trespass into an enchanted ancient forest, they awaken supernatural woodland guardians whose deceptive charm hides a fierce territorial vengeance.',
    thumbnailUrl: 'https://i.ytimg.com/vi/_cMxraX_5RE/hqdefault.jpg',
    backdropUrl: 'https://i.ytimg.com/vi/_cMxraX_5RE/maxresdefault.jpg',
    primaryCategory: 'Werewolf Romance',
    secondaryCategories: ['Fantasy Romance', 'AI Animated Movies', 'Newly Released Movies'],
    channelTitle: 'Blender Studio',
    channelId: 'UCSMOQeBJ2RAnuFungnQOxLg',
    publishedAt: '2026-10-25T20:00:00.000Z',
    durationSeconds: 629,
    durationFormatted: '10:29',
    viewCount: 5390000,
    likeCount: 229000,
    isEmbeddable: true,
    playbackStatus: 'active',
    approvalStatus: 'approved',
    isFeatured: false,
    seriesId: SERIES_CRIMSON_ID,
    seasonNumber: 1,
    episodeNumber: 1,
    discoveredVia: 'rss_feed',
    aiQualityScore: 95,
    createdAt: '2026-10-31T09:00:00.000Z',
    updatedAt: '2026-10-31T09:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222208',
    youtubeVideoId: 'Y-rmzh0PI3c',
    title: 'Cosmos Laundromat — The Second Life Contract',
    synopsis:
      'On a desolate island, a heartbroken soul is offered a mysterious contract by an enigmatic stranger dressed in a tailored suit: step through a portal to live out infinite lifetimes and find the destiny he lost.',
    thumbnailUrl: 'https://i.ytimg.com/vi/Y-rmzh0PI3c/hqdefault.jpg',
    backdropUrl: 'https://i.ytimg.com/vi/Y-rmzh0PI3c/maxresdefault.jpg',
    primaryCategory: 'Contract Marriage',
    secondaryCategories: ['Billionaire Romance', 'Emotional Love Stories', 'Newly Released Movies'],
    channelTitle: 'Blender Studio',
    channelId: 'UCSMOQeBJ2RAnuFungnQOxLg',
    publishedAt: '2026-10-28T17:00:00.000Z',
    durationSeconds: 730,
    durationFormatted: '12:10',
    viewCount: 4120000,
    likeCount: 185000,
    isEmbeddable: true,
    playbackStatus: 'active',
    approvalStatus: 'approved',
    isFeatured: false,
    seriesId: SERIES_CRIMSON_ID,
    seasonNumber: 1,
    episodeNumber: 2,
    discoveredVia: 'rss_feed',
    aiQualityScore: 96,
    createdAt: '2026-11-01T06:00:00.000Z',
    updatedAt: '2026-11-01T06:00:00.000Z',
  },
];

const OUTDATED_AI_SEED_REGEX =
  /\bai\b|ai-generated|ai generated|folktale|tales by|story hub|short film|blender|cartoon|animation short|fan-made|sintel|tears of steel|sprite fright|cosmos laundromat|coffee run|wing it/i;

const BUNDLED_MOVIES: MovieItem[] = Array.isArray(
  (bundledCatalogue as any)?.movies
)
  ? (((bundledCatalogue as any).movies as MovieItem[])
      .filter(
        (m) =>
          (m.durationSeconds || 0) >= 2400 &&
          !OUTDATED_AI_SEED_REGEX.test(
            `${m.title || ''} ${m.channelTitle || ''} ${m.synopsis || ''}`
          )
      )
      .map((m, idx) => {
        const minViews = 1850000 + ((idx * 423190) % 26000000);
        const viewCount = Math.max(Number(m.viewCount || 0), minViews);
        const likeCount = Math.max(
          Number(m.likeCount || 0),
          Math.round(viewCount * 0.055)
        );
        const commentsCount = Math.max(
          Number(m.commentsCount || 0),
          Math.round(viewCount * 0.0068)
        );
        const publishedAt = String(m.publishedAt || '').startsWith('2026')
          ? m.publishedAt
          : new Date(Date.now() - (idx + 1) * 6 * 3600 * 1000).toISOString();
        return {
          ...m,
          publishedAt,
          viewCount,
          likeCount,
          commentsCount,
        };
      }))
  : [];

export const INITIAL_MOVIES: MovieItem[] =
  BUNDLED_MOVIES.length > 0 ? BUNDLED_MOVIES : BASE_SEED_MOVIES;

