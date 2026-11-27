import {
  MovieItem,
  SearchSuggestionItem,
} from '../types/cinema.ts';

export interface MovieCategoryDefinition {
  id: string;
  label: string;
  aliases: string[];
  tmdbGenreIds?: number[];
  originCountries?: string[];
  originalLanguage?: string;
  inAppKeywords: string[];
  /** High-precision keywords that confirm a movie truly belongs to this genre even if its primaryCategory is generic. */
  strictAnchorKeywords?: string[];
  /** In-app categories that must be excluded from this genre unless strictAnchorKeywords match cleanly. */
  excludeCategories?: string[];
  /** Patterns that immediately disqualify off-genre or mismatched uploads for this category. */
  excludePatterns?: RegExp[];
  youtubeQuery: string;
  dailymotionQuery: string;
  isTrendingOrLatest?: boolean;
}

export const SUPPORTED_MOVIE_CATEGORIES: MovieCategoryDefinition[] = [
  {
    id: 'horror',
    label: 'Horror Movies',
    aliases: ['horror', 'scary', 'ghost', 'haunted', 'slasher', 'demon', 'zombie', 'supernatural horror', 'spooky'],
    tmdbGenreIds: [27],
    inAppKeywords: [
      'horror',
      'horror movie',
      'horror film',
      'scary movie',
      'haunted',
      'haunting',
      'ghost story',
      'ghost movie',
      'demon',
      'demonic',
      'zombie',
      'zombies',
      'exorcist',
      'exorcism',
      'conjuring',
      'slasher',
      'paranormal',
      'poltergeist',
      'possession',
      'possessed',
      'evil spirit',
      'supernatural horror',
      'monster horror',
      'vampire horror',
      'bloody horror',
      'occult',
      'undead',
    ],
    strictAnchorKeywords: [
      'horror',
      'slasher',
      'exorcist',
      'exorcism',
      'conjuring',
      'haunted',
      'paranormal',
      'poltergeist',
      'demonic',
      'zombie',
      'scary movie',
    ],
    excludeCategories: [
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
      'emotional love stories',
      'ai animated movies',
      'fantasy romance',
    ],
    excludePatterns: [
      /\b(disney|pixar|dreamworks|nickelodeon|cartoon|kids\s+movie|kids\s+animation|animated\s+family|werewolf\s+romance|alpha\s+king|rejected\s+luna|crippled\s+alpha|mate\s+bond|billionaire|contract\s+marriage|ceo\s+romance|rom-com|love\s+story|love\s+and\s+hope|ghost\s+sniper|ghost\s+recon|ghost\s+protocol|ghost\s+squad|special\s+forces)\b/i,
    ],
    youtubeQuery: '2026 horror full movie english',
    dailymotionQuery: 'horror full movie english',
  },
  {
    id: 'action',
    label: 'Action Movies',
    aliases: ['action', 'martial arts', 'fighting', 'combat', 'heist', 'assassin', 'spy', 'superhero'],
    tmdbGenreIds: [28],
    inAppKeywords: [
      'action movies',
      'action movie',
      'action film',
      'action thriller',
      'action',
      'martial arts',
      'kung fu',
      'heist',
      'assassin',
      'hitman',
      'operative',
      'tactical',
      'warfare',
      'gunfight',
      'mercenary',
      'commando',
      'special forces',
      'vigilante',
      'superhero',
    ],
    strictAnchorKeywords: ['action', 'martial arts', 'assassin', 'heist', 'gunfight', 'mercenary', 'commando', 'vigilante'],
    excludeCategories: [
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
      'emotional love stories',
    ],
    excludePatterns: [
      /\b(billionaire\s+romance|contract\s+marriage|ceo\s+love|werewolf\s+romance|rejected\s+luna)\b/i,
    ],
    youtubeQuery: '2026 action full movie english',
    dailymotionQuery: 'action full movie english',
  },
  {
    id: 'romance',
    label: 'Romantic Movies',
    aliases: ['romance', 'romantic', 'love', 'love story', 'love stories', 'romcom', 'rom-com', 'billionaire romance'],
    tmdbGenreIds: [10749],
    inAppKeywords: [
      'romance',
      'romantic',
      'love story',
      'love stories',
      'rom-com',
      'romcom',
      'billionaire romance',
      'ceo love',
      'contract marriage',
      'secret marriage',
      'werewolf romance',
      'emotional love',
      'falling in love',
      'wedding',
      'bride',
    ],
    strictAnchorKeywords: ['romance', 'romantic', 'love story', 'rom-com', 'romcom', 'contract marriage', 'billionaire romance'],
    excludePatterns: [
      /\b(horror|slasher|zombie|exorcist|conjuring|demonic|gore|serial\s+killer)\b/i,
    ],
    youtubeQuery: '2026 romance full movie english',
    dailymotionQuery: 'romance full movie english',
  },
  {
    id: 'comedy',
    label: 'Comedy Movies',
    aliases: ['comedy', 'funny', 'comedies', 'humor', 'humour', 'hilarious', 'laugh'],
    tmdbGenreIds: [35],
    inAppKeywords: ['comedy', 'comedies', 'funny', 'hilarious', 'comedic', 'parody', 'slapstick', 'rom-com', 'romcom'],
    strictAnchorKeywords: ['comedy', 'comedies', 'funny', 'hilarious', 'parody', 'rom-com'],
    excludeCategories: ['werewolf romance'],
    excludePatterns: [
      /\b(horror|slasher|exorcist|zombie|demonic|serial\s+killer|tragic\s+heartbreak)\b/i,
    ],
    youtubeQuery: '2026 comedy full movie english',
    dailymotionQuery: 'comedy full movie english',
  },
  {
    id: 'thriller',
    label: 'Thriller Movies',
    aliases: ['thriller', 'suspense', 'psychological thriller', 'mystery thriller'],
    tmdbGenreIds: [53],
    inAppKeywords: [
      'thriller',
      'suspense',
      'psychological thriller',
      'crime thriller',
      'survival thriller',
      'hostage',
      'kidnapped',
      'kidnap',
      'manhunt',
      'conspiracy',
      'serial killer',
      'stalker',
    ],
    strictAnchorKeywords: ['thriller', 'suspense', 'hostage', 'manhunt', 'serial killer', 'stalker'],
    excludeCategories: [
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
      'ai animated movies',
    ],
    excludePatterns: [
      /\b(disney|pixar|cartoon|kids\s+movie|werewolf\s+romance|billionaire\s+romance|contract\s+marriage)\b/i,
    ],
    youtubeQuery: '2026 thriller full movie english',
    dailymotionQuery: 'thriller full movie english',
  },
  {
    id: 'adventure',
    label: 'Adventure Movies',
    aliases: ['adventure', 'quest', 'expedition', 'journey', 'explorer'],
    tmdbGenreIds: [12],
    inAppKeywords: [
      'adventure',
      'expedition',
      'treasure hunt',
      'explorer',
      'uncharted',
      'epic quest',
      'jungle adventure',
      'survival adventure',
    ],
    strictAnchorKeywords: ['adventure', 'expedition', 'treasure hunt', 'explorer'],
    excludeCategories: [
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
    ],
    youtubeQuery: '2026 adventure full movie english',
    dailymotionQuery: 'adventure full movie english',
  },
  {
    id: 'sci-fi',
    label: 'Science Fiction Movies',
    aliases: ['sci-fi', 'scifi', 'sci fi', 'science fiction', 'cyberpunk', 'space', 'alien', 'futuristic', 'dystopian'],
    tmdbGenreIds: [878],
    inAppKeywords: [
      'sci-fi',
      'scifi',
      'science fiction',
      'cyberpunk',
      'outer space',
      'spaceship',
      'spacecraft',
      'extraterrestrial',
      'alien invasion',
      'alien',
      'mecha',
      'cyborg',
      'android',
      'robot',
      'time travel',
      'dystopian',
      'futuristic',
      'interstellar',
    ],
    strictAnchorKeywords: ['sci-fi', 'scifi', 'science fiction', 'cyberpunk', 'spaceship', 'alien', 'dystopian', 'time travel'],
    excludeCategories: [
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
      'emotional love stories',
    ],
    youtubeQuery: '2026 sci-fi full movie english',
    dailymotionQuery: 'sci-fi full movie english',
  },
  {
    id: 'drama',
    label: 'Drama Movies',
    aliases: ['drama', 'dramatic', 'emotional', 'melodrama'],
    tmdbGenreIds: [18],
    inAppKeywords: [
      'drama',
      'dramatic',
      'emotional',
      'family drama',
      'heartbreak',
      'betrayal',
      'divorce',
      'orphan',
      'sacrifice',
      'melodrama',
    ],
    strictAnchorKeywords: ['drama', 'melodrama', 'family drama', 'emotional'],
    youtubeQuery: '2026 drama full movie english',
    dailymotionQuery: 'drama full movie english',
  },
  {
    id: 'animation',
    label: 'Animation Movies',
    aliases: ['animation', 'animated', 'anime', 'cartoon', '3d animated'],
    tmdbGenreIds: [16],
    inAppKeywords: ['animated', 'animation', 'anime', '3d animated', 'cartoon', 'disney animation', 'pixar', 'ai animated movies'],
    strictAnchorKeywords: ['animated', 'animation', 'anime', 'cartoon', 'pixar'],
    youtubeQuery: '2026 animated full movie english',
    dailymotionQuery: 'animated full movie english',
  },
  {
    id: 'documentary',
    label: 'Documentary Movies',
    aliases: ['documentary', 'documentaries', 'docu', 'true story doc'],
    tmdbGenreIds: [99],
    inAppKeywords: ['documentary', 'documentaries', 'docuseries', 'biographical documentary', 'historical documentary'],
    strictAnchorKeywords: ['documentary', 'documentaries'],
    youtubeQuery: '2026 full documentary movie',
    dailymotionQuery: 'documentary full movie',
  },
  {
    id: 'nollywood',
    label: 'Nollywood Movies',
    aliases: ['nollywood', 'nigerian', 'nigeria', 'yoruba', 'lagos', 'naija'],
    originCountries: ['NG'],
    inAppKeywords: [
      'nollywood',
      'nigerian',
      'lagos',
      'nigeria',
      'yoruba',
      'naija',
      'ruth kadiri',
      'sonia uche',
      'maurice sam',
      'chidi dike',
      'uche montana',
      'bimbo ademoye',
      'funke akindele',
      'mercy johnson',
      'clinton joshua',
    ],
    strictAnchorKeywords: ['nollywood', 'nigerian', 'yoruba', 'lagos', 'naija', 'ruth kadiri', 'sonia uche', 'maurice sam'],
    youtubeQuery: '2026 latest nigerian nollywood full movie',
    dailymotionQuery: 'nollywood 2026 full movie',
  },
  {
    id: 'bollywood',
    label: 'Bollywood Movies',
    aliases: ['bollywood', 'indian', 'hindi'],
    originCountries: ['IN'],
    originalLanguage: 'hi',
    inAppKeywords: ['bollywood', 'indian movie', 'indian film', 'hindi movie', 'hindi full movie', 'hindi'],
    strictAnchorKeywords: ['bollywood', 'hindi', 'indian movie'],
    youtubeQuery: '2026 bollywood hindi full movie english subtitles',
    dailymotionQuery: 'bollywood full movie',
  },
  {
    id: 'hollywood',
    label: 'Hollywood Movies',
    aliases: ['hollywood', 'american', 'usa movies', 'us movies'],
    originCountries: ['US'],
    originalLanguage: 'en',
    inAppKeywords: ['hollywood', 'american movie', 'american film', 'hollywood full movie'],
    strictAnchorKeywords: ['hollywood', 'american movie', 'american film'],
    excludeCategories: [
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
      'ai animated movies',
    ],
    excludePatterns: [
      /\b(nollywood|nigerian|yoruba|bollywood|hindi\s+dubbed|tamil|telugu)\b/i,
    ],
    youtubeQuery: '2026 american full movie english',
    dailymotionQuery: '2026 hollywood full movie english',
  },
  {
    id: 'african',
    label: 'African Movies',
    aliases: ['african', 'africa', 'ghanaian', 'ghana', 'south african', 'kenyan', 'nollywood african'],
    originCountries: ['NG', 'ZA', 'GH', 'KE', 'EG'],
    inAppKeywords: ['african', 'nigerian', 'nollywood', 'lagos', 'ghana', 'ghanaian', 'south african', 'kenyan', 'yoruba', 'african folktale'],
    strictAnchorKeywords: ['african', 'nollywood', 'nigerian', 'ghanaian', 'yoruba'],
    youtubeQuery: '2026 latest african nollywood full movie',
    dailymotionQuery: 'african nollywood full movie',
  },
  {
    id: 'family',
    label: 'Family Movies',
    aliases: ['family', 'kids', 'children', 'all ages'],
    tmdbGenreIds: [10751],
    inAppKeywords: ['family movie', 'family film', 'kids movie', 'children', 'all ages', 'disney', 'pixar', 'animated family', 'family adventure'],
    strictAnchorKeywords: ['family movie', 'kids movie', 'disney', 'pixar', 'animated family'],
    excludeCategories: [
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
    ],
    excludePatterns: [
      /\b(horror|slasher|zombie|exorcist|demonic|gore|serial\s+killer|assassin|cheating|affair|werewolf\s+romance|billionaire)\b/i,
    ],
    youtubeQuery: '2026 family full movie english',
    dailymotionQuery: 'family full movie english',
  },
  {
    id: 'crime',
    label: 'Crime Movies',
    aliases: ['crime', 'gangster', 'mafia', 'detective', 'cartel', 'underworld'],
    tmdbGenreIds: [80],
    inAppKeywords: ['crime', 'mafia', 'cartel', 'syndicate', 'detective', 'heist', 'gangster', 'underworld', 'homicide', 'serial killer'],
    strictAnchorKeywords: ['crime', 'mafia', 'cartel', 'gangster', 'detective', 'heist'],
    excludeCategories: [
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
      'ai animated movies',
    ],
    youtubeQuery: '2026 crime thriller full movie english',
    dailymotionQuery: 'crime full movie english',
  },
  {
    id: 'historical',
    label: 'Historical Movies',
    aliases: ['historical', 'history', 'period drama', 'ancient', 'epic history', 'war history'],
    tmdbGenreIds: [36],
    inAppKeywords: ['historical', 'ancient empire', 'dynasty', 'medieval', 'roman empire', 'period drama', 'historical epic'],
    strictAnchorKeywords: ['historical', 'period drama', 'dynasty', 'medieval', 'ancient empire'],
    excludeCategories: [
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
    ],
    youtubeQuery: '2026 historical epic full movie english',
    dailymotionQuery: 'historical full movie english',
  },
  {
    id: 'fantasy',
    label: 'Fantasy Movies',
    aliases: ['fantasy', 'magic', 'magical', 'dragon', 'werewolf', 'mythology', 'enchanted'],
    tmdbGenreIds: [14],
    inAppKeywords: ['fantasy', 'dragon', 'sorcerer', 'wizard', 'enchanted', 'magical kingdom', 'mythology', 'dark fantasy', 'fantasy romance', 'werewolf'],
    strictAnchorKeywords: ['fantasy', 'dragon', 'wizard', 'sorcerer', 'enchanted', 'mythology'],
    youtubeQuery: '2026 fantasy full movie english',
    dailymotionQuery: 'fantasy full movie english',
  },
  {
    id: 'mystery',
    label: 'Mystery Movies',
    aliases: ['mystery', 'whodunit', 'investigation'],
    tmdbGenreIds: [9648],
    inAppKeywords: ['mystery', 'whodunit', 'detective', 'investigation', 'cold case', 'murder mystery', 'unsolved'],
    strictAnchorKeywords: ['mystery', 'whodunit', 'detective', 'murder mystery', 'investigation'],
    excludeCategories: [
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
    ],
    youtubeQuery: '2026 mystery thriller full movie english',
    dailymotionQuery: 'mystery full movie english',
  },
  {
    id: 'war',
    label: 'War Movies',
    aliases: ['war', 'military', 'soldier', 'battlefield'],
    tmdbGenreIds: [10752],
    inAppKeywords: ['war movie', 'war film', 'warfare', 'military', 'special forces', 'soldier', 'battlefield', 'world war', 'ww2', 'wwii'],
    strictAnchorKeywords: ['war movie', 'war film', 'warfare', 'battlefield', 'world war', 'military'],
    excludeCategories: [
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
    ],
    youtubeQuery: '2026 war action full movie english',
    dailymotionQuery: 'war full movie english',
  },
  {
    id: 'trending',
    label: 'Trending Movies',
    aliases: ['trending', 'popular', 'hot', 'top movies', 'best movies', 'most watched'],
    inAppKeywords: ['trending', 'new movies'],
    youtubeQuery: '2026 trending full movie english',
    dailymotionQuery: '2026 full movie english',
    isTrendingOrLatest: true,
  },
  {
    id: 'series',
    label: '2026 Series Movies',
    aliases: [
      'series',
      'series movies',
      'movie series',
      '2026 series',
      '2026 series movies',
      'tv series',
      'tv show',
      'tv shows',
      'web series',
      'limited series',
      'mini series',
      'miniseries',
      'k-drama',
      'kdrama',
      'k-drama series',
      'korean drama',
      'korean series',
      'nollywood series',
      'nigerian series',
      'action series',
      'crime series',
      'thriller series',
      'horror series',
      'sci-fi series',
      'drama series',
      'episodes',
      'season 1',
    ],
    inAppKeywords: [
      '2026 series movies',
      'series',
      's01',
      'episode',
      'season',
      'limited series',
      'k-drama',
      'nollywood series',
      'crime series',
      'thriller series',
      'horror series',
      'sci-fi series',
    ],
    strictAnchorKeywords: [
      '2026 series movies',
      'series',
      's01 e01',
      's01 e02',
      'episode',
      'season 1',
      'season 2',
      'season 3',
      'limited series',
    ],
    excludeCategories: [
      'complete ai movie series',
      'werewolf romance',
      'billionaire romance',
      'ceo love stories',
      'contract marriage',
      'secret marriage',
      'ai animated movies',
    ],
    youtubeQuery: '2026 series episode 1 full english',
    dailymotionQuery: '2026 series episode 1 full',
  },
  {
    id: 'latest',
    label: 'Latest 2026 Movies',
    aliases: ['latest', 'new', 'recent', 'just dropped', 'new releases', 'upcoming', '2026'],
    inAppKeywords: ['2026', 'new movies', 'newly released'],
    youtubeQuery: '2026 latest full movie english',
    dailymotionQuery: '2026 full movie english',
    isTrendingOrLatest: true,
  },
];

// Curated canonical dictionary of heavily searched popular movie titles for instant typo correction & autocomplete
export const POPULAR_MOVIE_CANONICAL_TITLES: string[] = [
  'Avengers',
  'Avengers: Endgame',
  'Avengers: Infinity War',
  'Avengers: Doomsday',
  'Spider-Man',
  'Spider-Man: Brand New Day',
  'Spider-Man: No Way Home',
  'Spider-Man: Across the Spider-Verse',
  'Fast & Furious',
  'Fast X',
  'The Odyssey',
  'Practical Magic 2',
  'Sinners',
  'John Wick',
  'Inception',
  'Interstellar',
  'The Dark Knight',
  'Black Panther',
  'Avatar',
  'Avatar: Fire and Ash',
  'Dune: Part Two',
  'Gladiator II',
  'The Conjuring',
  'Insidious',
  'A Quiet Place',
  'Deadpool & Wolverine',
  'Mission: Impossible',
  'Jurassic World Rebirth',
  'Superman',
  'The Batman',
  'Anikulapo',
  'Jagun Jagun',
  'A Tribe Called Judah',
  'King of Boys',
  'Brotherhood',
  'The Black Book',
  'Gangs of Lagos',
  'Omo Ghetto: The Saga',
  'Train to Busan',
  'Parasite',
  'RRR',
  'Jawan',
  'Pathaan',
  'Titanic',
  'The Godfather',
  'Spirited Away',
  'Inside Out 2',
  'Moana 2',
  'Frozen',
  'The Lion King',
  'Mufasa: The Lion King',
  'Wicked',
  'Smile 2',
  'Nosferatu',
  '28 Years Later',
  'Final Destination Bloodlines',
  'F1',
  'Thunderbolts*',
  'Captain America: Brave New World',
  'The Fantastic Four: First Steps',
  'The Remarried Empress',
  'Koleoso',
  'The Brokenwood Cases',
  'The Silence',
  'Liar',
  'The Other Half',
  'Extra Love',
  'New Lagos',
  'Payback',
  'The Rules',
  'Mirage',
  'Tripped',
];

const STRICT_NON_MOVIE_REGEX =
  /\b(recipe|how to cook|cook rice|bake cake|bitcoin|crypto price|ethereum price|forex trading|weather forecast|python tutorial|javascript tutorial|react tutorial|coding tutorial|football highlights|premier league table|champions league table|live score|song lyrics|lyrics video|mp3 download|audio song|official song|music album|full album|spotify playlist|stock price|symptom|medical diagnosis|podcast episode|full podcast|news article|breaking news|cnn live|bbc news|stand-up podcast)\b/i;

const STANDALONE_MUSIC_REGEX =
  /\b(song|songs|music|lyrics|mp3|album|playlist|mixtape|audio track|singer|rapper|dj mix)\b/i;

const MOVIE_CONTEXT_REGEX =
  /\b(movie|movies|film|films|cinema|series|episode|season|k-drama|kdrama|trailer|documentary|biopic|musical film|soundtrack movie)\b/i;

export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Optimal String Alignment (Damerau-Levenshtein) edit distance supporting transpositions, insertions, deletions, substitutions.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > 4) return Math.abs(m - n);

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

/**
 * Strict fuzzy word matcher: allows typos without falsely matching unrelated words sharing a few letters.
 */
export function isFuzzyWordMatch(queryWord: string, targetWord: string): boolean {
  const q = queryWord.toLowerCase();
  const t = targetWord.toLowerCase();
  if (q === t) return true;
  if (q.length < 3 || t.length < 3) return false;
  if (t.startsWith(q) && q.length >= 3) return true;

  const maxLen = Math.max(q.length, t.length);
  const maxDist = maxLen <= 4 ? 1 : maxLen <= 8 ? 2 : 3;
  if (Math.abs(q.length - t.length) > maxDist) return false;

  const dist = damerauLevenshtein(q, t);
  if (dist > maxDist) return false;

  // Require first character match OR strong character overlap to prevent unrelated matches
  const sameStart = q[0] === t[0] || (q.length > 1 && t.length > 1 && q[0] === t[1] && q[1] === t[0]);
  const similarity = 1 - dist / maxLen;
  return sameStart ? similarity >= 0.65 : similarity >= 0.78;
}

/**
 * Computes phrase similarity between a possibly misspelled query and a movie title (0..1).
 */
export function computeTitleSimilarity(rawQuery: string, candidateTitle: string): number {
  const qNorm = normalizeSearchText(rawQuery).replace(/\b(movie|movies|film|films|full|watch)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const tNorm = normalizeSearchText(candidateTitle);
  if (!qNorm || !tNorm) return 0;
  if (qNorm === tNorm) return 1;
  if (tNorm.startsWith(qNorm) && qNorm.length >= 4) return 0.94;
  if (tNorm.includes(qNorm) && qNorm.length >= 4) return 0.88;

  // Compare whole compact strings (catches "Spidarman" vs "Spider-Man" -> "spidarman" vs "spiderman")
  const qCompact = qNorm.replace(/\s+/g, '');
  const tCompact = tNorm.replace(/\s+/g, '');
  const compactMax = Math.max(qCompact.length, tCompact.length);
  if (compactMax >= 4 && Math.abs(qCompact.length - tCompact.length) <= 3) {
    const cDist = damerauLevenshtein(qCompact, tCompact);
    const cSim = 1 - cDist / compactMax;
    if (cSim >= 0.76 && (qCompact[0] === tCompact[0] || cSim >= 0.84)) {
      return Math.min(0.95, cSim);
    }
  }

  // Token-by-token fuzzy alignment
  const qTokens = qNorm.split(' ').filter((w) => w.length >= 2);
  const tTokens = tNorm.split(' ').filter((w) => w.length >= 2);
  if (qTokens.length === 0 || tTokens.length === 0) return 0;

  let matchedWeight = 0;
  for (const qt of qTokens) {
    let best = 0;
    for (const tt of tTokens) {
      if (qt === tt) {
        best = 1;
        break;
      }
      if (isFuzzyWordMatch(qt, tt)) {
        const d = damerauLevenshtein(qt, tt);
        best = Math.max(best, 1 - d / Math.max(qt.length, tt.length));
      }
    }
    matchedWeight += best;
  }

  const coverage = matchedWeight / qTokens.length;
  const lengthRatio = Math.min(qTokens.length, tTokens.length) / Math.max(qTokens.length, tTokens.length);
  if (coverage < 0.72) return 0;
  return coverage * (0.75 + 0.25 * lengthRatio);
}

/**
 * Deterministic typo correction against known popular movies, categories, and in-app titles.
 */
export function findTypoCorrection(
  rawQuery: string,
  extraTitles: string[] = []
): { corrected: string; confidence: number; kind: 'movie_title' | 'category' } | null {
  const cleaned = rawQuery.trim();
  const qNorm = normalizeSearchText(cleaned);
  if (!qNorm || qNorm.length < 3) return null;

  // Check if query is a misspelled category first (e.g. "harror movies", "nolywood", "comdey")
  const catMatch = detectMovieCategoryIntent(cleaned);
  if (catMatch.category && catMatch.wasTypoCorrected) {
    return {
      corrected: catMatch.category.label,
      confidence: 0.9,
      kind: 'category',
    };
  }

  // Avoid rewriting long plot descriptions
  if (isPlotDescriptionQuery(cleaned)) return null;

  const pool = Array.from(new Set([...POPULAR_MOVIE_CANONICAL_TITLES, ...extraTitles]));
  let bestMatch: { title: string; score: number } | null = null;

  for (const title of pool) {
    const tNorm = normalizeSearchText(title);
    if (!tNorm || tNorm === qNorm) return null; // Already exact match!
    const sim = computeTitleSimilarity(cleaned, title);
    if (sim >= 0.76 && (!bestMatch || sim > bestMatch.score)) {
      bestMatch = { title, score: sim };
    }
  }

  if (bestMatch && normalizeSearchText(bestMatch.title) !== qNorm) {
    return {
      corrected: bestMatch.title,
      confidence: bestMatch.score,
      kind: 'movie_title',
    };
  }

  return null;
}

/**
 * Strict Cinema-Only gate: allows feature movies and movie/TV series while rejecting songs, podcasts, news, recipes, tutorials, etc.
 */
export function detectNonMovieQuery(rawQuery: string): {
  isNonMovie: boolean;
  reason: string | null;
} {
  const clean = rawQuery.trim();
  if (!clean) return { isNonMovie: false, reason: null };

  if (STRICT_NON_MOVIE_REGEX.test(clean)) {
    if (/\b(song|lyrics|mp3|album|playlist|podcast)\b/i.test(clean)) {
      return {
        isNonMovie: true,
        reason:
          'TK STORYWORLD is exclusively for movies and series — music, songs, and podcasts are excluded. Search any movie, 2026 series, genre, or plot instead.',
      };
    }
    return {
      isNonMovie: true,
      reason:
        'TK STORYWORLD Search is exclusively for movies and series across all genres worldwide. Try searching a movie or series title, genre (e.g. Horror Movies, 2026 Series), or plot.',
    };
  }

  if (STANDALONE_MUSIC_REGEX.test(clean) && !MOVIE_CONTEXT_REGEX.test(clean)) {
    return {
      isNonMovie: true,
      reason:
        'Music tracks, albums, and artists are excluded because TK STORYWORLD searches strictly for movies and series. Try a movie or series title, genre, or story description.',
    };
  }

  return { isNonMovie: false, reason: null };
}

/**
 * Detects whether the user is describing a movie plot instead of typing a title.
 */
export function isPlotDescriptionQuery(rawQuery: string): boolean {
  const clean = rawQuery.trim().toLowerCase();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;

  const plotMarkers =
    /\b(about a|about two|about people|about someone|movie about|film about|movie where|film where|story where|story about|who discovers|who falls in love|who becomes|trapped in|moves into|haunted house|another family|despite their|looking for a movie|can't remember the name|forgot the name|plot where)\b/i;

  if (plotMarkers.test(clean)) return true;
  if (words.length >= 6 && /\b(who|where|when|after|tries to|must|survive|escape|discovers|falls|becomes|haunted|secret|family|hospital)\b/i.test(clean)) {
    return true;
  }
  return false;
}

export interface AdvancedSearchIntent {
  rawQuery: string;
  coreTitle: string;
  industry?: 'nollywood' | 'hollywood' | 'bollywood' | 'korean' | 'chinese' | 'african' | 'british';
  countryHint?: string;
  actorHint?: string;
  yearHint?: string;
  themes: string[];
  isPlotSearch: boolean;
  isCategorySearch: boolean;
}

export function parseAdvancedSearchIntent(rawQuery: string): AdvancedSearchIntent {
  const clean = rawQuery.trim();
  const lower = clean.toLowerCase();

  let industry: AdvancedSearchIntent['industry'];
  let countryHint: string | undefined;

  if (/\b(nollywood|nigerian|nigeria|naija|yoruba|lagos)\b/i.test(lower)) {
    industry = 'nollywood';
    countryHint = 'NG';
  } else if (/\b(hollywood|american|usa|us movies)\b/i.test(lower)) {
    industry = 'hollywood';
    countryHint = 'US';
  } else if (/\b(bollywood|indian|india|hindi)\b/i.test(lower)) {
    industry = 'bollywood';
    countryHint = 'IN';
  } else if (/\b(korean|k-drama|kdrama)\b/i.test(lower)) {
    industry = 'korean';
    countryHint = 'KR';
  } else if (/\b(chinese|china)\b/i.test(lower)) {
    industry = 'chinese';
    countryHint = 'CN';
  } else if (/\b(african|ghana|ghanaian|south african|kenyan)\b/i.test(lower)) {
    industry = 'african';
  } else if (/\b(british|uk|england)\b/i.test(lower)) {
    industry = 'british';
    countryHint = 'GB';
  }

  let actorHint: string | undefined;
  if (/\b(tyler\s+perry|tyler\s+peri)\b/i.test(lower)) actorHint = 'Tyler Perry';
  else if (/\b(jason\s+statham)\b/i.test(lower)) actorHint = 'Jason Statham';
  else if (/\b(ruth\s+kadiri)\b/i.test(lower)) actorHint = 'Ruth Kadiri';
  else if (/\b(sonia\s+uche)\b/i.test(lower)) actorHint = 'Sonia Uche';
  else if (/\b(maurice\s+sam)\b/i.test(lower)) actorHint = 'Maurice Sam';
  else if (/\b(chidi\s+dike)\b/i.test(lower)) actorHint = 'Chidi Dike';
  else if (/\b(uche\s+montana)\b/i.test(lower)) actorHint = 'Uche Montana';
  else if (/\b(bimbo\s+ademoye)\b/i.test(lower)) actorHint = 'Bimbo Ademoye';
  else if (/\b(funke\s+akindele)\b/i.test(lower)) actorHint = 'Funke Akindele';

  const yearMatch = lower.match(/\b(202[0-7]|201\d|200\d|19\d{2})\b/);
  const yearHint = yearMatch?.[1];

  const themes: string[] = [];
  if (/\b(billionaire|rich men|rich man|wealthy)\b/i.test(lower)) themes.push('billionaire');
  if (/\b(village|rural|traditional|african village)\b/i.test(lower)) themes.push('village');
  if (/\b(christian|gospel|faith|church)\b/i.test(lower)) themes.push('christian');
  if (/\b(family|emotional family|parents|children)\b/i.test(lower)) themes.push('family');
  if (/\b(romance|romantic|love)\b/i.test(lower)) themes.push('romance');
  if (/\b(action|fight|combat)\b/i.test(lower)) themes.push('action');

  const isPlotSearch = isPlotDescriptionQuery(clean);

  let core = clean
    .replace(/\b(nollywood|nigerian|nigeria|naija|yoruba|lagos|hollywood|american|usa|bollywood|indian|india|hindi|korean|k-drama|kdrama|chinese|china|african|ghana|british|uk)\b/gi, ' ')
    .replace(/\b(tyler\s+perry|tyler\s+peri|jason\s+statham|ruth\s+kadiri|sonia\s+uche|maurice\s+sam|chidi\s+dike|uche\s+montana|bimbo\s+ademoye|funke\s+akindele)\b/gi, ' ')
    .replace(/\b(show me|i want the|find the|movie made in|movie from|movies about|movies where|latest|full movie|english|subtitles|movie|film|movies|films)\b/gi, ' ')
    .replace(new RegExp(String(yearHint || ''), 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const isCategorySearch = !core || core.length < 2 || isPlotSearch || /^(movies|films|series|drama|action|romance|horror|comedy|nollywood|hollywood|bollywood)$/i.test(core);

  return {
    rawQuery: clean,
    coreTitle: core.length >= 2 ? core : clean,
    industry,
    countryHint,
    actorHint,
    yearHint,
    themes,
    isPlotSearch,
    isCategorySearch,
  };
}

/**
 * Detects whether the query is a genre/category search (including with typos like "harror movies" or "nolywood")
 * and extracts optional sort hints (latest, trending, popular, top rated) and year.
 */
export function detectMovieCategoryIntent(rawQuery: string): {
  category: MovieCategoryDefinition | null;
  wasTypoCorrected: boolean;
  preferredSort: 'latest' | 'trending' | 'popular' | 'top_rated';
  yearHint?: string;
} {
  const clean = rawQuery.trim();
  const normalized = normalizeSearchText(clean);

  const yearMatch = normalized.match(/\b(202[0-7]|201\d|200\d|19\d{2})\b/);
  const yearHint = yearMatch?.[1];

  let preferredSort: 'latest' | 'trending' | 'popular' | 'top_rated' = 'latest';
  if (/\b(trending|viral|hot)\b/i.test(normalized)) preferredSort = 'trending';
  else if (/\b(most popular|popular|most watched)\b/i.test(normalized)) preferredSort = 'popular';
  else if (/\b(top rated|best rated|highest rated|critically acclaimed)\b/i.test(normalized)) {
    preferredSort = 'top_rated';
  }

  // Never misclassify a plot description like "A horror movie about people trapped in a hospital" as a pure category browse!
  if (isPlotDescriptionQuery(clean)) {
    return { category: null, wasTypoCorrected: false, preferredSort, yearHint };
  }

  // Strip generic wrappers ("movies", "film", "latest", "2026", "free", "full", etc.) to inspect core category words
  const stripped = normalized
    .replace(
      /\b(movies?|films?|cinema|full|hd|free|watch|stream|best|top|rated|most|popular|trending|latest|new|recent|upcoming|just|dropped|all|list|of|in|202[0-7]|201\d)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  // If stripped is empty, user searched something like "new movies 2026", "trending movies", "latest movies"
  if (!stripped) {
    if (/\b(trending|popular|top rated|best)\b/i.test(normalized)) {
      const trendingCat = SUPPORTED_MOVIE_CATEGORIES.find((c) => c.id === 'trending') || null;
      return { category: trendingCat, wasTypoCorrected: false, preferredSort: preferredSort === 'latest' ? 'trending' : preferredSort, yearHint };
    }
    if (/\b(new|latest|recent|just dropped|upcoming|2026|2025)\b/i.test(normalized)) {
      const latestCat = SUPPORTED_MOVIE_CATEGORIES.find((c) => c.id === 'latest') || null;
      return { category: latestCat, wasTypoCorrected: false, preferredSort: 'latest', yearHint };
    }
    return { category: null, wasTypoCorrected: false, preferredSort, yearHint };
  }

  // Exact alias match first
  for (const cat of SUPPORTED_MOVIE_CATEGORIES) {
    if (cat.isTrendingOrLatest) continue;
    for (const alias of cat.aliases) {
      if (stripped === normalizeSearchText(alias)) {
        return { category: cat, wasTypoCorrected: false, preferredSort, yearHint };
      }
    }
  }

  // Fuzzy alias match for single/two-word misspelled categories (e.g. "harror", "horor", "nolywood", "comdey", "thriler", "scifi")
  const strippedWords = stripped.split(' ').filter(Boolean);
  if (strippedWords.length <= 2) {
    for (const cat of SUPPORTED_MOVIE_CATEGORIES) {
      if (cat.isTrendingOrLatest) continue;
      for (const alias of cat.aliases) {
        const aliasNorm = normalizeSearchText(alias);
        if (aliasNorm.includes(' ')) {
          if (computeTitleSimilarity(stripped, aliasNorm) >= 0.8) {
            return { category: cat, wasTypoCorrected: true, preferredSort, yearHint };
          }
        } else if (strippedWords.length === 1 && isFuzzyWordMatch(strippedWords[0], aliasNorm)) {
          return { category: cat, wasTypoCorrected: strippedWords[0] !== aliasNorm, preferredSort, yearHint };
        }
      }
    }
  }

  return { category: null, wasTypoCorrected: false, preferredSort, yearHint };
}

const PLOT_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'about', 'into', 'where', 'who', 'when', 'that', 'this', 'their',
  'his', 'her', 'its', 'they', 'them', 'has', 'have', 'had', 'is', 'are', 'was', 'were',
  'movie', 'movies', 'film', 'films', 'story', 'watch', 'full', 'free', 'new', 'latest',
  'looking', 'find', 'search', 'name', 'title', 'remember',
]);

/**
 * Filters out clickbait review/spoiler/recap/analysis/explained/reaction/compilation videos
 * so only genuine watchable movies (or official trailers where requested) surface in search.
 */
const CLICKBAIT_REVIEW_TITLE_REGEX =
  /(?:\b(?:review|reviews|reviews\s+spoiler|spoiler\s+review|spoilers?\s+explained|analysis\s*(?:&|and)\s*facts?|facts?\s*(?:&|and)\s*analysis|movie\s+analysis|ending\s+explained|plot\s+explained|story\s+explained|full\s+movie\s+explained|movie\s+explained|explained\s+in\s+\w+|recap|movie\s+recap|reaction|reacts\s+to|pitch\s+meeting|honest\s+trailers?|easter\s+eggs|breakdown|summary\s+in\s+\d+|concept\s+trailer|fan\s+trailer|fan-made|fake\s+trailer|trailer\s+compilation|top\s+\d+\s+(?:best|scariest|horror|action|new|upcoming)?\s*movies|best\s+upcoming)\b|\|\s*(?:review|analysis|explained|recap|facts?|spoiler)\b)/i;

export function isClickbaitOrReviewVideo(title: string, snippet = ''): boolean {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return true;
  if (CLICKBAIT_REVIEW_TITLE_REGEX.test(cleanTitle)) return true;
  // Also catch explicit review/recap declarations right at the opening of the description
  const snippetHead = (snippet || '').slice(0, 160);
  if (
    /\b(reviews?\s+spoiler|analysis\s*(?:&|and)\s*facts?|ending\s+explained|movie\s+recap|spoiler\s+review|in\s+this\s+review\s+we)\b/i.test(
      snippetHead
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Extracts a normalized canonical title key for deduplicating different uploads of the exact same movie
 * (e.g., two different uploads of "Buddy (2026) Full Movie in English | ...").
 */
export function extractCanonicalMovieKey(rawTitle: string): string {
  const head = (rawTitle || '')
    .split(/\s*[|｜]\s*/)[0]
    .replace(/\((?:19\d{2}|20[0-2]\d)\)/g, ' ')
    .replace(/\[(?:full|hd|4k|1080p|new|202\d)[^\]]*\]/gi, ' ')
    .replace(
      /\b(full\s+movie|full\s+hd|in\s+english|english\s+dub(?:bed)?|english\s+subtitles?|official\s+trailer|new\s+movie|latest\s+movie|movie\s+hd|4k|1080p|720p|uhd|hd|free\s+movie|202[0-7])\b/gi,
      ' '
    )
    .replace(/\s+[-–—:]\s*$/, '')
    .trim();

  const norm = normalizeSearchText(head);
  return norm.length >= 2 ? norm : normalizeSearchText(rawTitle || '');
}

/**
 * Strict word-boundary phrase check on already-normalized space-separated text
 * (prevents "ai" matching "maid", "war" matching "award", or "dark" matching unrelated dramas).
 */
const NORMALIZED_PHRASE_CACHE = new Map<string, string>();

function getNormalizedPhraseCached(phrase: string): string {
  let cached = NORMALIZED_PHRASE_CACHE.get(phrase);
  if (cached !== undefined) return cached;
  cached = normalizeSearchText(phrase);
  if (NORMALIZED_PHRASE_CACHE.size < 1000) {
    NORMALIZED_PHRASE_CACHE.set(phrase, cached);
  }
  return cached;
}

export function hasWordBoundaryPhrase(normalizedHaystack: string, phrase: string): boolean {
  const pNorm = getNormalizedPhraseCached(phrase);
  if (!normalizedHaystack || !pNorm) return false;
  return ` ${normalizedHaystack} `.includes(` ${pNorm} `);
}

export function isTokenMatch(haystackWord: string, queryToken: string): boolean {
  if (haystackWord === queryToken) return true;
  if (haystackWord.startsWith(queryToken) || queryToken.startsWith(haystackWord)) {
    if (queryToken.length >= 3 || haystackWord.length >= 3) return true;
  }
  if (haystackWord === queryToken + 's' || haystackWord === queryToken + 'es' || haystackWord + 's' === queryToken) {
    return true;
  }
  if (haystackWord.includes(queryToken) && queryToken.length >= 4) {
    return true;
  }
  if (isFuzzyWordMatch(queryToken, haystackWord)) {
    return true;
  }
  return false;
}

/**
 * Strictly validates whether a movie (in-app or external stream) genuinely belongs to a requested category.
 * Rejects clickbait/review videos, off-genre categories (e.g. Werewolf Romance or Disney Animation on Horror),
 * and accidental substring hits.
 */
export function matchesCategoryStrictly(
  item: {
    title: string;
    synopsis?: string;
    primaryCategory?: string;
    secondaryCategories?: string[];
    hookTag?: string;
    channelTitle?: string;
  },
  category: MovieCategoryDefinition,
  precomputed?: {
    titleNorm: string;
    primaryCatNorm: string;
    catNorm: string;
    synopsisNorm: string;
    rawCombined: string;
    isClickbait: boolean;
  }
): { matched: boolean; score: number } {
  if (precomputed ? precomputed.isClickbait : isClickbaitOrReviewVideo(item.title, item.synopsis)) {
    return { matched: false, score: 0 };
  }

  if (category.isTrendingOrLatest) {
    return { matched: true, score: 50 };
  }

  const rawCombined =
    precomputed?.rawCombined ??
    `${item.title || ''} ${item.primaryCategory || ''} ${(item.secondaryCategories || []).join(' ')} ${item.hookTag || ''} ${item.synopsis || ''}`;

  // 1. Immediate exclusion patterns (e.g. Disney/Pixar/Werewolf Romance/Billionaire Romance on Horror)
  if (category.excludePatterns?.some((rx) => rx.test(rawCombined))) {
    return { matched: false, score: 0 };
  }

  const titleNorm = precomputed?.titleNorm ?? normalizeSearchText(item.title || '');
  const primaryCatNorm = precomputed?.primaryCatNorm ?? normalizeSearchText(item.primaryCategory || '');
  const catNorm =
    precomputed?.catNorm ??
    normalizeSearchText(
      `${item.primaryCategory || ''} ${(item.secondaryCategories || []).join(' ')} ${item.hookTag || ''}`
    );
  const synopsisNorm =
    precomputed?.synopsisNorm ?? normalizeSearchText(`${item.synopsis || ''} ${item.channelTitle || ''}`);

  // 2. Check excluded in-app categories (e.g. Werewolf Romance / AI Animated Movies / CEO Love Stories on Horror)
  const isExcludedCategory = Boolean(
    category.excludeCategories?.some(
      (ex) => primaryCatNorm === getNormalizedPhraseCached(ex) || hasWordBoundaryPhrase(catNorm, ex)
    )
  );

  const anchorKeywords = category.strictAnchorKeywords || category.inAppKeywords.slice(0, 6);
  const hasStrongTitleAnchor = anchorKeywords.some((kw) => hasWordBoundaryPhrase(titleNorm, kw));

  if (isExcludedCategory && !hasStrongTitleAnchor) {
    return { matched: false, score: 0 };
  }

  // 3. Strict word-boundary scoring across category, title, and synopsis
  let score = 0;
  let titleOrCatHits = 0;
  let synopsisHits = 0;

  for (const kw of category.inAppKeywords) {
    if (hasWordBoundaryPhrase(catNorm, kw)) {
      score += 42;
      titleOrCatHits += 1;
    } else if (hasWordBoundaryPhrase(titleNorm, kw)) {
      score += 36;
      titleOrCatHits += 1;
    } else if (hasWordBoundaryPhrase(synopsisNorm, kw)) {
      score += 18;
      synopsisHits += 1;
    }
  }

  // Require at least one category/title word-boundary match OR two distinct synopsis word-boundary hits
  const matched = titleOrCatHits >= 1 || synopsisHits >= 2 || score >= 34;
  return { matched, score: matched ? score : 0 };
}

/**
 * Extracts a reliable 4-digit release year for 3-tier ranking (2026 First -> Trending Next -> Deep Impression).
 */
export function getMovieYearNumber(movie: {
  title?: string;
  releaseDate?: string;
  releaseYear?: string;
  publishedAt?: string;
}): number {
  const relYr = Number(String(movie.releaseYear || movie.releaseDate || '').slice(0, 4));
  if (Number.isFinite(relYr) && relYr >= 1900 && relYr <= 2028) {
    return relYr;
  }

  const titleYears = String(movie.title || '').match(/\b(19\d{2}|20[0-2]\d)\b/g);
  if (titleYears && titleYears.length > 0) {
    const maxTitleYr = Math.max(...titleYears.map(Number));
    if (maxTitleYr >= 1900 && maxTitleYr <= 2028) {
      return maxTitleYr;
    }
  }

  const pubYr = Number(String(movie.publishedAt || '').slice(0, 4));
  if (Number.isFinite(pubYr) && pubYr >= 1900 && pubYr <= 2028) {
    return pubYr;
  }
  return 0;
}

/**
 * Computes a movie's impression & engagement strength for ranking within each tier.
 */
export function computeMovieImpressionScore(movie: {
  viewCount?: number;
  likeCount?: number;
  commentsCount?: number;
  voteAverage?: number;
  aiQualityScore?: number;
}): number {
  const views = Math.max(0, Number(movie.viewCount || 0));
  const likes = Math.max(0, Number(movie.likeCount || 0));
  const comments = Math.max(0, Number(movie.commentsCount || 0));
  const rating = Number(movie.voteAverage || (movie.aiQualityScore ? movie.aiQualityScore / 10 : 7.5));
  return views + likes * 15 + comments * 100 + rating * 150000;
}

/**
 * Computes the user's exact 3-Tier Discovery Priority:
 * - Tier 3 (highest): 2026 Movies First
 * - Tier 2 (next):    Trending Movies (recent 2024–2025 high-momentum or viral hits)
 * - Tier 1 (next):    Deep-Impression Movies (highest views, ratings & audience impact)
 */
export function getThreeTierPriority(movie: {
  title?: string;
  releaseDate?: string;
  releaseYear?: string;
  publishedAt?: string;
  hookTag?: string;
  viewCount?: number;
  likeCount?: number;
  commentsCount?: number;
  voteAverage?: number;
  aiQualityScore?: number;
  popularity?: number;
  voteCount?: number;
}): { tier: 3 | 2 | 1; rankScore: number } {
  const year = getMovieYearNumber(movie);
  const impression =
    typeof movie.popularity === 'number' || typeof movie.voteCount === 'number'
      ? Math.log10(Math.max(1, Number(movie.voteCount || 0) + 1)) * 260 +
        Number(movie.popularity || 0) * 14 +
        Number(movie.voteAverage || 0) * 35
      : computeMovieImpressionScore(movie);

  // Tier 1 (priority 3): 2026 movies first, ordered by highest impression/popularity
  if (year === 2026) {
    return { tier: 3, rankScore: impression };
  }

  // Tier 2 (priority 2): Trending movies next (recent 2024–2025 releases or explicitly trending/viral hits)
  const hasTrendingTag = /\b(trending|viral|hot|most\s+watched|buzzing|must\s+watch)\b/i.test(
    movie.hookTag || ''
  );
  const hasHighRecentMomentum =
    (year === 2025 || year === 2024) &&
    ((typeof movie.popularity === 'number' && movie.popularity >= 12) ||
      Number(movie.viewCount || 0) >= 250000 ||
      hasTrendingTag);

  if (hasHighRecentMomentum || (year >= 2025 && year < 2026)) {
    const trendingMomentum =
      typeof movie.popularity === 'number'
        ? Number(movie.popularity || 0) * 18 +
          Math.log10(Math.max(1, Number(movie.voteCount || 0) + 1)) * 140 +
          Number(movie.voteAverage || 0) * 25
        : impression + (year === 2025 ? 250000 : 0);
    return { tier: 2, rankScore: trendingMomentum };
  }

  // Tier 3 (priority 1): Deep-impression classics & high-impact hits
  const deepImpression =
    typeof movie.voteCount === 'number'
      ? Math.log10(Math.max(1, Number(movie.voteCount || 0) + 1)) * 340 +
        Number(movie.voteAverage || 0) * 50 +
        Math.min(250, Number(movie.popularity || 0) * 4)
      : impression;
  return { tier: 1, rankScore: deepImpression };
}

export function compareMoviesByThreeTierPriority(
  a: MovieItem & { releaseYear?: string },
  b: MovieItem & { releaseYear?: string }
): number {
  const tierA = getThreeTierPriority(a);
  const tierB = getThreeTierPriority(b);
  if (tierB.tier !== tierA.tier) return tierB.tier - tierA.tier;
  if (tierB.rankScore !== tierA.rankScore) return tierB.rankScore - tierA.rankScore;
  return (
    new Date(b.releaseDate || b.publishedAt).getTime() -
    new Date(a.releaseDate || a.publishedAt).getTime()
  );
}

interface PrecomputedMovieIndex {
  titleNorm: string;
  primaryCatNorm: string;
  catNorm: string;
  synopsisNorm: string;
  rawCombined: string;
  titleWords: string[];
  allWords: string[];
  canonKey: string;
  year: number;
  isClickbait: boolean;
}

const MOVIE_SEARCH_INDEX_CACHE = new WeakMap<MovieItem, PrecomputedMovieIndex>();

function getMovieSearchIndex(m: MovieItem): PrecomputedMovieIndex {
  const cached = MOVIE_SEARCH_INDEX_CACHE.get(m);
  if (cached) return cached;

  const isClickbait = isClickbaitOrReviewVideo(m.title, m.synopsis);
  const titleNorm = normalizeSearchText(m.title);
  const primaryCatNorm = normalizeSearchText(m.primaryCategory || '');
  const catNorm = normalizeSearchText(
    `${m.primaryCategory} ${(m.secondaryCategories || []).join(' ')} ${m.hookTag || ''}`
  );
  const synopsisNorm = normalizeSearchText(`${m.synopsis} ${m.channelTitle}`);
  const rawCombined = `${m.title || ''} ${m.primaryCategory || ''} ${(m.secondaryCategories || []).join(' ')} ${m.hookTag || ''} ${m.synopsis || ''}`;
  const titleWords = titleNorm.split(' ').filter((w) => w.length >= 2);
  const allWords = `${titleNorm} ${catNorm} ${synopsisNorm}`
    .split(' ')
    .filter((w) => w.length >= 3);
  const canonKey = extractCanonicalMovieKey(m.title);
  const year = getMovieYearNumber(m);

  const entry: PrecomputedMovieIndex = {
    titleNorm,
    primaryCatNorm,
    catNorm,
    synopsisNorm,
    rawCombined,
    titleWords,
    allWords,
    canonKey,
    year,
    isClickbait,
  };
  MOVIE_SEARCH_INDEX_CACHE.set(m, entry);
  return entry;
}

interface FastTitleIndex {
  titleNorm: string;
  canonKey: string;
  year: number;
  isClickbait: boolean;
}

const FAST_TITLE_INDEX_CACHE = new WeakMap<MovieItem, FastTitleIndex>();

function getFastTitleIndex(m: MovieItem): FastTitleIndex {
  const cached = FAST_TITLE_INDEX_CACHE.get(m);
  if (cached) return cached;
  const entry: FastTitleIndex = {
    titleNorm: normalizeSearchText(m.title),
    canonKey: extractCanonicalMovieKey(m.title),
    year: getMovieYearNumber(m),
    isClickbait: isClickbaitOrReviewVideo(m.title, ''),
  };
  FAST_TITLE_INDEX_CACHE.set(m, entry);
  return entry;
}

// Pre-normalize static category and popular title lists once at module load for sub-millisecond keystrokes
const PREINDEXED_CATEGORIES = SUPPORTED_MOVIE_CATEGORIES.map((cat) => ({
  cat,
  labelNorm: normalizeSearchText(cat.label),
  aliasesNorm: cat.aliases.map((a) => normalizeSearchText(a)),
}));

const PREINDEXED_POPULAR_TITLES = POPULAR_MOVIE_CANONICAL_TITLES.map((title) => {
  const tNorm = normalizeSearchText(title);
  return {
    title,
    tNorm,
    firstWord: tNorm.split(' ')[0] || '',
  };
});

/**
 * Intelligent in-app catalogue ranker supporting strict genre/category matching, exact/fuzzy titles,
 * plot descriptions, canonical-title deduplication, clickbait rejection, and 3-tier ranking
 * (2026 First -> Trending Next -> Deep Impression).
 */
export function rankInAppMoviesForQuery(
  movies: MovieItem[],
  rawQuery: string,
  options: {
    correctedQuery?: string;
    sort?: 'latest' | 'trending' | 'popular' | 'top_rated';
  } = {}
): MovieItem[] {
  const clean = rawQuery.trim();
  if (!clean) return [];

  const effectiveQuery = (options.correctedQuery || clean).trim();
  const intent = parseAdvancedSearchIntent(effectiveQuery);
  const searchTitleQuery = intent.coreTitle;
  const catIntent = detectMovieCategoryIntent(intent.isCategorySearch ? effectiveQuery : searchTitleQuery);
  const isPlot = intent.isPlotSearch;
  const qNorm = normalizeSearchText(searchTitleQuery);
  const qTokens = qNorm
    .split(' ')
    .filter((w) => w.length >= 2 && !PLOT_STOPWORDS.has(w));

  const scored: Array<{ movie: MovieItem; score: number; relevanceBand: number; canonKey: string }> = [];

  for (const m of movies) {
    const idx = getMovieSearchIndex(m);
    // Always exclude clickbait review/analysis/spoiler/recap videos from search results
    if (idx.isClickbait) {
      continue;
    }

    const { titleNorm, catNorm, synopsisNorm, titleWords, allWords } = idx;

    let score = 0;
    let relevanceBand = 1;

    // 1. Strict Category / Genre search scoring (never bleed unrelated movies via generic "2026"/"Movies" tokens!)
    if (catIntent.category) {
      if (catIntent.category.isTrendingOrLatest) {
        score = 50;
        if (catIntent.category.id === 'latest' && idx.year === 2026) {
          score += 35;
        }
      } else {
        const strictCheck = matchesCategoryStrictly(m, catIntent.category, idx);
        if (!strictCheck.matched) {
          continue;
        }
        score = strictCheck.score;
      }

      // If user requested a specific older year (e.g. "Horror Movies 2021"), enforce it strictly;
      // for 2026 or unspecified year, keep all strictly matching genre movies so 3-tier order runs (2026 -> Trending -> Deep Impression)
      if (catIntent.yearHint && catIntent.yearHint !== '2026') {
        if (String(idx.year) !== catIntent.yearHint) {
          continue;
        }
      }
    } else {
      // 2. Exact / substring / fuzzy / token similarity match (only for non-category queries)
      if (qNorm.length >= 2) {
        const titleSim = computeTitleSimilarity(effectiveQuery, m.title);
        if (titleNorm === qNorm) {
          score += 180;
          relevanceBand = 3;
        } else if (titleNorm.startsWith(qNorm)) {
          score += 130;
          relevanceBand = 3;
        } else if (hasWordBoundaryPhrase(titleNorm, qNorm) || titleNorm.includes(qNorm)) {
          score += 115;
          relevanceBand = 2;
        } else if (titleSim >= 0.68) {
          score += Math.round(titleSim * 110);
          relevanceBand = 2;
        }
      }

      // 3. Token & similarity scoring (Strict title matching for title queries; Synopsis matching only for plot descriptions)
      if (qTokens.length > 0) {
        let exactTokenHits = 0;
        let fuzzyTokenHits = 0;
        for (const tok of qTokens) {
          const matchedTitle = titleWords.some((tw) => isTokenMatch(tw, tok)) || hasWordBoundaryPhrase(titleNorm, tok) || titleNorm.includes(tok);
          const matchedCat = catNorm.includes(tok) || hasWordBoundaryPhrase(catNorm, tok);
          const matchedSynopsis = isPlot && (synopsisNorm.includes(tok) || hasWordBoundaryPhrase(synopsisNorm, tok));

          if (matchedTitle) {
            exactTokenHits += 1;
            score += 35;
          } else if (matchedCat) {
            exactTokenHits += 1;
            score += 20;
          } else if (matchedSynopsis) {
            exactTokenHits += 1;
            score += 24;
          } else if (
            tok.length >= 4 &&
            titleWords.some((tw) => tw[0] === tok[0] && isFuzzyWordMatch(tok, tw))
          ) {
            fuzzyTokenHits += 1;
            score += 18;
          } else if (
            isPlot &&
            tok.length >= 5 &&
            allWords.some((aw) => aw[0] === tok[0] && isFuzzyWordMatch(tok, aw))
          ) {
            fuzzyTokenHits += 1;
            score += 10;
          }
        }

        const totalMatched = exactTokenHits + fuzzyTokenHits;
        const totalTokens = qTokens.length;
        const minRequired = isPlot ? Math.max(1, Math.ceil(totalTokens * 0.4)) : Math.min(totalTokens, Math.max(1, Math.ceil(totalTokens * 0.5)));

        if (!isPlot && exactTokenHits === 0 && score < 100) {
          score = 0;
        } else if (totalMatched < minRequired && score < 70) {
          score = 0;
        }
      }

      // Apply advanced intent constraints (industry, actor, themes)
      const isNollywood = String(m.primaryCategory || '') === 'Nollywood Movies' || (m.secondaryCategories || []).includes('Nollywood Movies' as any) || /\b(nollywood|nigerian|yoruba|lagos|naija)\b/i.test(`${m.primaryCategory || ''} ${(m.secondaryCategories || []).join(' ')} ${m.synopsis || ''} ${m.channelTitle || ''}`);
      const isBollywood = String(m.primaryCategory || '') === 'Bollywood Movies' || /\b(bollywood|hindi|indian)\b/i.test(`${m.primaryCategory || ''} ${m.synopsis || ''} ${m.channelTitle || ''}`);
      const isHollywood = String(m.primaryCategory || '') === 'Hollywood Movies' || /\b(hollywood|american)\b/i.test(`${m.primaryCategory || ''} ${m.synopsis || ''} ${m.channelTitle || ''}`);

      if (intent.industry === 'nollywood') {
        if (isNollywood) score += 65;
        else if (score > 0) score -= 60;
      } else if (intent.industry === 'bollywood') {
        if (isBollywood) score += 65;
        else if (score > 0) score -= 60;
      } else if (intent.industry === 'hollywood') {
        if (isHollywood) score += 55;
        else if (score > 0) score -= 30;
      }

      if (intent.actorHint) {
        const actorNorm = normalizeSearchText(intent.actorHint);
        const combinedMeta = normalizeSearchText(`${m.title} ${m.synopsis} ${m.channelTitle}`);
        if (combinedMeta.includes(actorNorm)) {
          score += 75;
        } else if (score > 0 && intent.coreTitle.length < 3) {
          score -= 50;
        }
      }

      if (intent.themes.length > 0) {
        const combinedMeta = normalizeSearchText(`${m.title} ${m.primaryCategory} ${(m.secondaryCategories || []).join(' ')} ${m.hookTag || ''} ${m.synopsis || ''}`);
        let themeHits = 0;
        for (const th of intent.themes) {
          if (combinedMeta.includes(th)) themeHits++;
        }
        if (themeHits > 0) {
          score += themeHits * 40;
        }
      }
    }

    if (score >= 28) {
      scored.push({ movie: m, score, relevanceBand, canonKey: idx.canonKey });
    }
  }

  const sortMode = options.sort || (catIntent.category ? catIntent.preferredSort : 'latest');

  scored.sort((a, b) => {
    // For title/plot searches, keep exact/strong title matches ahead of loose matches
    if (!catIntent.category && b.relevanceBand !== a.relevanceBand) {
      return b.relevanceBand - a.relevanceBand;
    }

    if (sortMode === 'top_rated') {
      const rateDiff =
        (b.movie.voteAverage || b.movie.aiQualityScore / 10) -
        (a.movie.voteAverage || a.movie.aiQualityScore / 10);
      if (Math.abs(rateDiff) > 0.05) return rateDiff;
      return computeMovieImpressionScore(b.movie) - computeMovieImpressionScore(a.movie);
    }

    if (sortMode === 'popular') {
      const impDiff = computeMovieImpressionScore(b.movie) - computeMovieImpressionScore(a.movie);
      if (impDiff !== 0) return impDiff;
    }

    if (sortMode === 'trending') {
      const yrA = getMovieYearNumber(a.movie);
      const yrB = getMovieYearNumber(b.movie);
      const recentA = yrA >= 2025 ? 1 : 0;
      const recentB = yrB >= 2025 ? 1 : 0;
      if (recentB !== recentA) return recentB - recentA;
      const impDiff = computeMovieImpressionScore(b.movie) - computeMovieImpressionScore(a.movie);
      if (impDiff !== 0) return impDiff;
    }

    // Default ('latest'): 2026 First -> Trending Next -> Deep Impression
    const tierDiff = compareMoviesByThreeTierPriority(a.movie, b.movie);
    if (tierDiff !== 0) return tierDiff;
    return b.score - a.score;
  });

  // Deduplicate strictly by videoId, id, AND canonical core movie title so the same film never appears twice
  const deduped: MovieItem[] = [];
  const seenVideoIds = new Set<string>();
  const seenCanonicalTitles = new Set<string>();

  for (const { movie, canonKey } of scored) {
    const vidKey = movie.youtubeVideoId || movie.id;
    if (seenVideoIds.has(vidKey)) continue;
    if (canonKey && seenCanonicalTitles.has(canonKey)) continue;

    seenVideoIds.add(vidKey);
    if (canonKey) seenCanonicalTitles.add(canonKey);
    deduped.push(movie);
  }

  return deduped;
}

/**
 * Generates instant zero-latency search suggestions as the user types (sub-millisecond fast path:
 * uses pre-normalized static lists and lightweight title cache, deferring fuzzy edit-distance only
 * when fast prefix/substring matches return fewer than 3 hits).
 */
export function buildLocalSearchSuggestions(
  rawQuery: string,
  inAppMovies: MovieItem[]
): SearchSuggestionItem[] {
  const clean = rawQuery.trim();
  const qNorm = normalizeSearchText(clean);
  if (!qNorm || qNorm.length < 2) return [];

  const suggestions: SearchSuggestionItem[] = [];
  const seen = new Set<string>();

  const pushUnique = (item: SearchSuggestionItem) => {
    const key = normalizeSearchText(item.text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    suggestions.push(item);
  };

  // 1. Category / Genre completions using pre-normalized static table (zero regex allocation!)
  for (const { cat, labelNorm, aliasesNorm } of PREINDEXED_CATEGORIES) {
    const aliasHit = aliasesNorm.some(
      (aNorm) => aNorm.startsWith(qNorm) || qNorm.startsWith(aNorm)
    );

    if (labelNorm.startsWith(qNorm) || aliasHit) {
      pushUnique({
        text: cat.label,
        kind: 'category',
        subtitle: 'Category · 2026 & Trending first',
      });
      if (!cat.isTrendingOrLatest) {
        pushUnique({
          text: `${cat.label} 2026`,
          kind: 'category',
          subtitle: '2026 New Releases',
        });
        pushUnique({
          text: `Latest ${cat.label}`,
          kind: 'category',
          subtitle: 'Newest releases first',
        });
        pushUnique({
          text: `Trending ${cat.label}`,
          kind: 'trending',
          subtitle: 'Trending now',
        });
      }
      if (suggestions.length >= 5) break;
    }
  }

  // 2. Fast lightweight in-app title completions (avoids heavy synopsis indexing on keystroke!)
  const seenCanon = new Set<string>();
  let inAppCount = 0;
  for (const m of inAppMovies) {
    if (inAppCount >= 4) break;
    const idx = getFastTitleIndex(m);
    if (idx.isClickbait) continue;
    if (idx.titleNorm.startsWith(qNorm) || idx.titleNorm.includes(qNorm)) {
      if (idx.canonKey && seenCanon.has(idx.canonKey)) continue;
      if (idx.canonKey) seenCanon.add(idx.canonKey);
      inAppCount += 1;
      const yr = idx.year ? String(idx.year) : '';
      pushUnique({
        text: m.title,
        kind: 'movie_title',
        subtitle: `${m.primaryCategory}${yr ? ` · ${yr}` : ''}`,
        releaseYear: yr,
        posterUrl: m.thumbnailUrl,
        rating: m.voteAverage || Number(((m.aiQualityScore || 88) / 10).toFixed(1)),
        availabilityStatus: 'FULL_MOVIE_AVAILABLE',
        inAppMovieId: m.id,
      });
    }
  }

  // 3. Fast prefix/substring/compressed-prefix pass over pre-normalized Popular Global Titles
  const qCompact = qNorm.replace(/\s+/g, '');
  const isCompressedPrefix = (queryCompact: string, tFirstWord: string): boolean => {
    if (queryCompact.length < 3 || !tFirstWord || tFirstWord[0] !== queryCompact[0]) {
      return false;
    }
    if (tFirstWord.length < queryCompact.length || tFirstWord.length > queryCompact.length + 5) {
      return false;
    }
    let qi = 0;
    for (let ti = 0; ti < tFirstWord.length && qi < queryCompact.length; ti++) {
      if (tFirstWord[ti] === queryCompact[qi]) qi++;
    }
    return qi === queryCompact.length;
  };

  for (const { title, tNorm, firstWord } of PREINDEXED_POPULAR_TITLES) {
    if (suggestions.length >= 8) break;
    if (
      tNorm.startsWith(qNorm) ||
      tNorm.includes(qNorm) ||
      isCompressedPrefix(qCompact, firstWord)
    ) {
      pushUnique({
        text: title,
        kind: 'movie_title',
        subtitle: 'Global Cinema',
      });
    }
  }

  // 4. Only run edit-distance typo correction if fast passes found < 3 matches (keeps typing < 1ms!)
  if (qNorm.length >= 4 && suggestions.length < 3) {
    const typo = findTypoCorrection(clean);
    if (typo && normalizeSearchText(typo.corrected) !== qNorm) {
      suggestions.unshift({
        text: typo.corrected,
        kind: 'correction',
        subtitle: `Did you mean "${typo.corrected}"?`,
      });
    }
  }

  return suggestions.slice(0, 8);
}
