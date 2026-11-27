import fs from 'fs';
import path from 'path';

const SITE_ORIGIN = 'https://www.tkstoryworld.name.ng';
const OUTDATED_AI_SEED_REGEX =
  /\bai\b|ai-generated|ai generated|folktale|tales by|story hub|short film|blender|cartoon|animation short|fan-made|sintel|tears of steel|sprite fright|cosmos laundromat|coffee run|wing it/i;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toIsoDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function cleanText(text, maxLen = 320) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trim()}…`;
}

function extractQuotedField(block, fieldName) {
  // Matches single-quoted or double-quoted string literals across optional newline
  const re = new RegExp(
    `${fieldName}\\s*:\\s*(?:'((?:\\\\'|[^'])*)'|"((?:\\\\"|[^"])*)")`,
    's'
  );
  const match = re.exec(block);
  if (!match) return '';
  const raw = match[1] !== undefined ? match[1] : match[2] || '';
  return raw.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ');
}

function extractNumberField(block, fieldName) {
  const re = new RegExp(`${fieldName}\\s*:\\s*(\\d+)`);
  const match = re.exec(block);
  return match ? Number(match[1]) : 0;
}

function extractSeries2026Episodes(seriesFilePath) {
  if (!fs.existsSync(seriesFilePath)) return [];
  const src = fs.readFileSync(seriesFilePath, 'utf-8');
  const results = [];
  const blockRegex = /makeEpisodeMovie\(\{([\s\S]*?)\}\)/g;
  let match;
  while ((match = blockRegex.exec(src)) !== null) {
    const block = match[1];
    const uuidSuffix = extractQuotedField(block, 'uuidSuffix');
    const youtubeVideoId = extractQuotedField(block, 'youtubeVideoId');
    const title = extractQuotedField(block, 'title');
    if (!uuidSuffix || !title) continue;

    const id = `33333333-2026-4111-8111-${uuidSuffix.padStart(12, '0')}`;
    const synopsis = extractQuotedField(block, 'synopsis');
    const publishedAt = extractQuotedField(block, 'publishedAt');
    const channelTitle = extractQuotedField(block, 'channelTitle');
    const durationSeconds = extractNumberField(block, 'durationSeconds');
    const viewCount = extractNumberField(block, 'viewCount');

    results.push({
      id,
      title,
      synopsis,
      youtubeVideoId,
      sourcePlatform: 'youtube',
      thumbnailUrl: youtubeVideoId
        ? `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`
        : '',
      backdropUrl: youtubeVideoId
        ? `https://i.ytimg.com/vi/${youtubeVideoId}/maxresdefault.jpg`
        : '',
      primaryCategory: '2026 Series Movies',
      secondaryCategories: ['New Movies'],
      channelTitle,
      publishedAt,
      lastmod: toIsoDate(publishedAt),
      durationSeconds,
      viewCount,
      isFeatured: true,
      isEpisode: true,
    });
  }
  return results;
}

function normalizeRawVideoId(movie) {
  const raw = String(movie.externalVideoId || movie.youtubeVideoId || '').trim();
  if (raw.startsWith('dm:')) return { p: 'dailymotion', vid: raw.slice(3) };
  if (raw.startsWith('vm:')) return { p: 'vimeo', vid: raw.slice(3) };
  if (raw.startsWith('ia:')) return { p: 'archive', vid: raw.slice(3) };
  const p =
    movie.sourcePlatform === 'dailymotion' ||
    movie.sourcePlatform === 'vimeo' ||
    movie.sourcePlatform === 'archive'
      ? movie.sourcePlatform
      : 'youtube';
  return { p, vid: raw };
}

function slugifyMovieTitle(title) {
  const raw = String(title || '')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/《([^》]*)》/g, ' $1 ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!raw) return 'watch-movie';
  if (raw.length <= 64) return raw;
  const sliced = raw.slice(0, 64);
  const lastDash = sliced.lastIndexOf('-');
  const trimmed = lastDash > 32 ? sliced.slice(0, lastDash) : sliced;
  return trimmed.replace(/-+$/g, '') || 'watch-movie';
}

function getMovieShortId(id) {
  const clean = String(id || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  return clean ? clean.slice(-8) : 'film';
}

function buildMovieSlug(title, id) {
  return `${slugifyMovieTitle(title)}-${getMovieShortId(id)}`;
}

function toCompactSeoEntry(movie) {
  const { p, vid } = normalizeRawVideoId(movie);
  const cleanTitle = cleanText(movie.title, 140);
  const entry = {
    t: cleanTitle,
    sl: buildMovieSlug(cleanTitle, movie.id),
  };
  const syn = cleanText(movie.synopsis, 320);
  if (syn) entry.s = syn;
  if (movie.backdropUrl) entry.img = movie.backdropUrl;
  if (movie.thumbnailUrl && movie.thumbnailUrl !== movie.backdropUrl) {
    entry.th = movie.thumbnailUrl;
  }
  if (movie.primaryCategory) entry.cat = movie.primaryCategory;
  if (Array.isArray(movie.secondaryCategories) && movie.secondaryCategories.length > 0) {
    entry.cats = movie.secondaryCategories.slice(0, 3);
  }
  if (movie.channelTitle) entry.ch = cleanText(movie.channelTitle, 80);
  const pub = movie.publishedAt || movie.releaseDate || movie.createdAt || movie.updatedAt;
  if (pub) entry.pub = pub;
  if (Number(movie.durationSeconds) > 0) entry.dur = Math.round(Number(movie.durationSeconds));
  if (Number(movie.viewCount) > 0) entry.v = Math.round(Number(movie.viewCount));
  if (p !== 'youtube') entry.p = p;
  if (vid) entry.vid = vid;
  if (movie.isEpisode || movie.seriesId) entry.ep = true;
  return entry;
}

function generateSitemap() {
  const rootDir = process.cwd();
  const dbPath = path.resolve(rootDir, 'data', 'aetheria-db.json');
  const seriesPath = path.resolve(
    rootDir,
    'src',
    'server',
    'series2026Catalogue.ts'
  );
  const outputPath = path.resolve(rootDir, 'public', 'sitemap.xml');
  const seoIndexPath = path.resolve(rootDir, 'public', 'seo-movies.json');

  const entries = [];
  const seoMovieMap = {};
  const seenIds = new Set();

  let latestDate = toIsoDate(new Date().toISOString());

  // 1. Verified 2026 series episodes bundled in series2026Catalogue
  for (const ep of extractSeries2026Episodes(seriesPath)) {
    if (!ep.id || seenIds.has(ep.id)) continue;
    seenIds.add(ep.id);
    const compact = toCompactSeoEntry(ep);
    seoMovieMap[ep.id] = compact;
    entries.push({
      loc: `${SITE_ORIGIN}/movie/${encodeURIComponent(compact.sl)}`,
      lastmod: ep.lastmod || latestDate,
      changefreq: 'weekly',
      priority: '0.8',
    });
  }

  // 2. Published, active, embeddable movies from data/aetheria-db.json
  if (fs.existsSync(dbPath)) {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    const movies = Array.isArray(db?.movies) ? db.movies : [];

    for (const m of movies) {
      if (!m || typeof m.id !== 'string' || !m.id.trim()) continue;
      if (m.approvalStatus !== 'approved') continue;
      if (m.playbackStatus !== 'active') continue;
      if (m.isEmbeddable === false) continue;

      const cleanId = m.id.trim();

      // Always index approved active movies in seo-movies.json so deep links get rich SEO tags
      if (!seoMovieMap[cleanId]) {
        seoMovieMap[cleanId] = toCompactSeoEntry(m);
      }

      if ((Number(m.durationSeconds) || 0) < 2400) continue;

      const textBlob = `${m.title || ''} ${m.channelTitle || ''} ${m.synopsis || ''}`;
      if (OUTDATED_AI_SEED_REGEX.test(textBlob)) continue;

      if (seenIds.has(cleanId)) continue;
      seenIds.add(cleanId);

      const lastmod =
        toIsoDate(m.updatedAt) ||
        toIsoDate(m.publishedAt) ||
        toIsoDate(m.createdAt) ||
        latestDate;

      if (lastmod && (!latestDate || lastmod > latestDate)) {
        latestDate = lastmod;
      }

      entries.push({
        loc: `${SITE_ORIGIN}/movie/${encodeURIComponent(seoMovieMap[cleanId].sl)}`,
        lastmod,
        changefreq: 'weekly',
        priority: m.isFeatured ? '0.8' : '0.7',
      });
    }
  }

  const SEO_CATEGORY_LANDING_PATHS = [
    '/nollywood',
    '/2026-series',
    '/action-movies',
    '/new-movies',
    '/trending-movies',
    '/billionaire-romance',
    '/ceo-love-stories',
    '/contract-marriage',
    '/revenge-romance',
    '/emotional-love-stories',
    '/fantasy-romance',
    '/categories',
  ];

  // Keep well within Google's 50,000 URL limit per sitemap file
  const cappedEntries = entries.slice(0, 49999 - SEO_CATEGORY_LANDING_PATHS.length);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${escapeXml(`${SITE_ORIGIN}/`)}</loc>`,
    `    <lastmod>${escapeXml(latestDate)}</lastmod>`,
    '    <changefreq>daily</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
  ];

  for (const catPath of SEO_CATEGORY_LANDING_PATHS) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(`${SITE_ORIGIN}${catPath}`)}</loc>`);
    lines.push(`    <lastmod>${escapeXml(latestDate)}</lastmod>`);
    lines.push('    <changefreq>daily</changefreq>');
    lines.push('    <priority>0.9</priority>');
    lines.push('  </url>');
  }

  for (const item of cappedEntries) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(item.loc)}</loc>`);
    if (item.lastmod) {
      lines.push(`    <lastmod>${escapeXml(item.lastmod)}</lastmod>`);
    }
    lines.push(`    <changefreq>${item.changefreq}</changefreq>`);
    lines.push(`    <priority>${item.priority}</priority>`);
    lines.push('  </url>');
  }

  lines.push('</urlset>', '');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  fs.writeFileSync(seoIndexPath, JSON.stringify(seoMovieMap), 'utf-8');

  console.log(
    `[Sitemap] Generated ${outputPath} (${cappedEntries.length + SEO_CATEGORY_LANDING_PATHS.length + 1} canonical URLs) and ${seoIndexPath} (${Object.keys(seoMovieMap).length} SEO movie entries).`
  );
}

generateSitemap();
