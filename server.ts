import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { repo } from './src/server/supabaseRepo.ts';
import {
  formatDurationSeconds,
  lookupYouTubeVideo,
  runDiscoveryPipeline,
  verifyCatalogueHealth,
} from './src/server/youtubeDiscovery.ts';
import { MovieCategory, MovieItem, MovieSeries } from './src/types/cinema.ts';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

// Normalize Netlify Function paths so /.netlify/functions/api/* or stripped /* routes match /api/*
app.use((req, _res, next) => {
  if (req.url.startsWith('/.netlify/functions/api')) {
    const rest = req.url.slice('/.netlify/functions/api'.length);
    req.url = `/api${rest.startsWith('/') ? rest : `/${rest}`}`;
  } else if (
    !req.url.startsWith('/api/') &&
    (req.url.startsWith('/bootstrap') ||
      req.url.startsWith('/movies') ||
      req.url.startsWith('/engagement') ||
      req.url.startsWith('/watch-history') ||
      req.url.startsWith('/history') ||
      req.url.startsWith('/watchlist') ||
      req.url.startsWith('/auth') ||
      req.url.startsWith('/admin'))
  ) {
    req.url = `/api${req.url}`;
  }
  next();
});

let isDiscoveryRunning = false;

async function triggerScheduledDiscoveryIfNeeded(
  triggerType: 'scheduled' | 'startup' = 'scheduled'
): Promise<void> {
  if (isDiscoveryRunning) return;
  try {
    const diag = await repo.checkDiagnostics();
    if (diag.tablesReady && triggerType === 'startup') {
      await repo.syncAllToSupabase();
    }

    const settings = await repo.getSettings();
    const runs = await repo.getDiscoveryRuns();
    const now = Date.now();
    const nextDue = new Date(settings.nextScheduledRunAt).getTime();

    if (runs.length === 0 || now >= nextDue) {
      isDiscoveryRunning = true;
      await runDiscoveryPipeline(runs.length === 0 ? 'startup' : triggerType);
      if (diag.tablesReady) {
        await repo.syncAllToSupabase();
      }
    }
  } catch (err) {
    console.error('Background discovery trigger error:', err);
  } finally {
    isDiscoveryRunning = false;
  }
}

// --- PUBLIC STREAMING ROUTES ---

app.get('/api/bootstrap', async (req, res) => {
  try {
    const userId = (req.query.userId as string) || 'default-viewer';

    const [
      movies,
      series,
      watchHistory,
      watchlist,
      settings,
      diagnostics,
      engagementMap,
    ] = await Promise.all([
      repo.getMovies(false),
      repo.getSeries(),
      repo.getWatchHistory(userId),
      repo.getWatchlist(userId),
      repo.getSettings(),
      repo.checkDiagnostics(),
      repo.getAllEngagementSummaries(userId),
    ]);

    // Trigger non-blocking background discovery check if the 6-hour daily schedule is due
    void triggerScheduledDiscoveryIfNeeded('scheduled');

    res.json({
      movies,
      series,
      watchHistory,
      watchlist,
      settings,
      diagnostics,
      engagementMap,
      clientSupabaseConfig: {
        url: diagnostics.supabaseUrl,
        anonKey:
          process.env.SUPABASE_ANON_KEY &&
          !process.env.SUPABASE_ANON_KEY.includes('your-supabase')
            ? process.env.SUPABASE_ANON_KEY
            : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load streaming catalogue' });
  }
});

app.post('/api/daily-sync', async (_req, res) => {
  try {
    if (!isDiscoveryRunning) {
      isDiscoveryRunning = true;
      try {
        const runLog = await runDiscoveryPipeline('scheduled');
        const movies = await repo.getMovies(false);
        return res.json({
          synced: true,
          moviesAdded: runLog.moviesAdded,
          totalMovies: movies.length,
          movies,
        });
      } finally {
        isDiscoveryRunning = false;
      }
    }
    const movies = await repo.getMovies(false);
    res.json({
      synced: false,
      moviesAdded: 0,
      totalMovies: movies.length,
      movies,
    });
  } catch (error: any) {
    isDiscoveryRunning = false;
    res.status(500).json({ error: error.message || 'Daily sync failed' });
  }
});

app.post('/api/history/progress', async (req, res) => {
  try {
    const {
      userId = 'default-viewer',
      movieId,
      progressSeconds,
      durationSeconds,
    } = req.body;
    if (!movieId) {
      return res.status(400).json({ error: 'movieId is required' });
    }
    const prog = Math.max(0, Math.floor(Number(progressSeconds) || 0));
    const dur = Math.max(1, Math.floor(Number(durationSeconds) || 600));
    const completed = prog / dur >= 0.92;

    await repo.saveWatchProgress({
      userId,
      movieId,
      progressSeconds: prog,
      durationSeconds: dur,
      completed,
      lastWatchedAt: new Date().toISOString(),
    });

    const watchHistory = await repo.getWatchHistory(userId);
    res.json({ watchHistory });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save watch progress' });
  }
});

app.post('/api/watchlist/toggle', async (req, res) => {
  try {
    const { userId = 'default-viewer', movieId } = req.body;
    if (!movieId) {
      return res.status(400).json({ error: 'movieId is required' });
    }
    const result = await repo.toggleWatchlist(userId, movieId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update watchlist' });
  }
});

app.get('/api/movies/:id/engagement', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req.query.userId as string) || 'guest-viewer';
    const [engagement, comments] = await Promise.all([
      repo.getMovieEngagement(id, userId),
      repo.getMovieComments(id),
    ]);
    res.json({ engagement, comments });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || 'Failed to load movie engagement' });
  }
});

app.post('/api/movies/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId = 'guest-viewer' } = req.body;
    const result = await repo.toggleMovieLike(userId, id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to toggle like' });
  }
});

app.post('/api/movies/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      userId = 'guest-viewer',
      rating = 5,
      reaction = 'Loved It',
      content = '',
    } = req.body;
    if (!content.trim()) {
      return res.status(400).json({ error: 'Please write a short comment or review.' });
    }
    const result = await repo.addMovieComment({
      movieId: id,
      userId,
      rating: Number(rating) || 5,
      reaction,
      content,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to post comment' });
  }
});

app.post('/api/movies/:id/playback-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { playbackStatus, isEmbeddable } = req.body;
    const allMovies = await repo.getMovies(true);
    const target = allMovies.find((m) => m.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    const updated = await repo.upsertMovie({
      ...target,
      playbackStatus: playbackStatus || 'embed_restricted',
      isEmbeddable: isEmbeddable ?? false,
    });
    res.json({ movie: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update playback status' });
  }
});

// --- SUPABASE AUTHENTICATION & ADMIN GUARD ROUTES ---

app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { email } = req.body;
    const check = await repo.verifyRealEmailAddress(email || '');
    res.json(check);
  } catch (error: any) {
    res.status(500).json({ valid: false, error: error.message || 'Email verification failed' });
  }
});

app.post('/api/auth/resend-email', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await repo.resendSignupNotificationEmail(email || '');
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Could not resend email' });
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to resend email notification' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await repo.registerOrConfirmUser(email || '', password || '');
    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Registration failed',
        suggestedEmail: result.suggestedEmail,
      });
    }
    res.json({
      success: true,
      emailSent: result.emailSent ?? true,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to register user' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const result = await repo.resetUserPassword(email || '', newPassword || '');
    if (!result.success) {
      return res
        .status(400)
        .json({ error: result.error || 'Password reset failed' });
    }
    res.json({ success: true, message: result.message });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || 'Failed to reset password' });
  }
});

app.post('/api/auth/record-login', async (req, res) => {
  try {
    const { email, clientInfo } = req.body;
    const result = await repo.recordUserAuthEvent(
      email || '',
      'login',
      clientInfo || 'Client Login'
    );
    res.json({ success: result.success });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to record login event' });
  }
});

app.post('/api/auth/record-signup', async (req, res) => {
  try {
    const { email, clientInfo } = req.body;
    const result = await repo.recordUserAuthEvent(
      email || '',
      'signup',
      clientInfo || 'Client Signup'
    );
    res.json({ success: result.success });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to record signup event' });
  }
});

app.get('/api/auth/session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const verified = await repo.verifySupabaseAccessToken(token);
    res.json({
      authenticated: verified.valid,
      userId: verified.userId,
      email: verified.email,
      isAdmin: verified.isAdmin,
      error: verified.error,
    });
  } catch (error: any) {
    res.status(500).json({
      authenticated: false,
      userId: null,
      email: null,
      isAdmin: false,
      error: error.message,
    });
  }
});

const requireAdminAuth: express.RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

    const verified = await repo.verifySupabaseAccessToken(token);
    if (!verified.valid) {
      return res.status(401).json({
        error:
          'Authentication required. Please sign in with your Supabase account (okorotochukwu007@gmail.com) to access the Admin Console.',
      });
    }
    if (!verified.isAdmin) {
      return res.status(403).json({
        error: `Access denied for ${verified.email}. The Admin Console is strictly restricted to okorotochukwu007@gmail.com.`,
      });
    }
    next();
  } catch (error: any) {
    return res
      .status(401)
      .json({ error: error.message || 'Admin session verification failed.' });
  }
};

// --- ADMIN DASHBOARD & DISCOVERY ROUTES (Protected by Supabase Admin Session) ---
app.use('/api/admin', requireAdminAuth);

app.get('/api/admin/overview', async (_req, res) => {
  try {
    const [movies, series, sources, runs, settings, diagnostics, userStats] = await Promise.all([
      repo.getMovies(true),
      repo.getSeries(),
      repo.getSources(),
      repo.getDiscoveryRuns(),
      repo.getSettings(),
      repo.checkDiagnostics(),
      repo.getUserAuthStats(),
    ]);

    let sqlSchema = '';
    try {
      const schemaPath = path.resolve(process.cwd(), 'supabase', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        sqlSchema = fs.readFileSync(schemaPath, 'utf-8');
      }
    } catch {
      sqlSchema = '-- Unable to read supabase/schema.sql';
    }

    res.json({
      movies,
      series,
      sources,
      runs,
      settings,
      diagnostics,
      sqlSchema,
      isDiscoveryRunning,
      userStats,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load admin overview' });
  }
});

app.get('/api/admin/users', async (_req, res) => {
  try {
    const userStats = await repo.getUserAuthStats();
    res.json({ stats: userStats, ...userStats });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load user auth stats' });
  }
});

app.post('/api/admin/discover/run', async (_req, res) => {
  if (isDiscoveryRunning) {
    return res.status(409).json({ error: 'A discovery run is already in progress.' });
  }
  try {
    isDiscoveryRunning = true;
    const runLog = await runDiscoveryPipeline('manual');
    const [movies, settings, runs] = await Promise.all([
      repo.getMovies(true),
      repo.getSettings(),
      repo.getDiscoveryRuns(),
    ]);
    res.json({ runLog, movies, settings, runs });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Discovery run failed' });
  } finally {
    isDiscoveryRunning = false;
  }
});

app.post('/api/admin/catalogue/verify', async (_req, res) => {
  try {
    const result = await verifyCatalogueHealth();
    const movies = await repo.getMovies(true);
    res.json({ result, movies });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Catalogue verification failed' });
  }
});

app.post('/api/admin/youtube-lookup', async (req, res) => {
  try {
    const { urlOrId, preferredCategory } = req.body;
    if (!urlOrId) {
      return res.status(400).json({ error: 'Please provide a YouTube URL or Video ID.' });
    }
    const result = await lookupYouTubeVideo(urlOrId, preferredCategory);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ movie: result.movie });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'YouTube lookup failed' });
  }
});

app.post('/api/admin/movies', async (req, res) => {
  try {
    const payload = req.body as Partial<MovieItem>;
    if (!payload.youtubeVideoId || !payload.title) {
      return res
        .status(400)
        .json({ error: 'Both youtubeVideoId and title are required.' });
    }
    const durationSec = Number(payload.durationSeconds) || 540;
    const movie: MovieItem = {
      id: payload.id || `mov-${payload.youtubeVideoId}-${Date.now()}`,
      youtubeVideoId: payload.youtubeVideoId.trim(),
      title: payload.title.trim(),
      synopsis:
        payload.synopsis?.trim() ||
        'An atmospheric AI cinema story curated for AETHERIA.',
      thumbnailUrl:
        payload.thumbnailUrl?.trim() ||
        `https://i.ytimg.com/vi/${payload.youtubeVideoId.trim()}/hqdefault.jpg`,
      backdropUrl:
        payload.backdropUrl?.trim() ||
        `https://i.ytimg.com/vi/${payload.youtubeVideoId.trim()}/maxresdefault.jpg`,
      primaryCategory:
        (payload.primaryCategory as MovieCategory) || 'Billionaire Romance',
      secondaryCategories: (payload.secondaryCategories as MovieCategory[]) || [
        'Newly Released Movies',
      ],
      channelTitle: payload.channelTitle?.trim() || 'AI Cinema Creator',
      channelId: payload.channelId?.trim() || '',
      publishedAt: payload.publishedAt || new Date().toISOString(),
      durationSeconds: durationSec,
      durationFormatted:
        payload.durationFormatted || formatDurationSeconds(durationSec),
      viewCount: Number(payload.viewCount) || 0,
      likeCount: Number(payload.likeCount) || 0,
      isEmbeddable: payload.isEmbeddable ?? true,
      playbackStatus: payload.playbackStatus || 'active',
      approvalStatus: payload.approvalStatus || 'approved',
      isFeatured: Boolean(payload.isFeatured),
      seriesId: payload.seriesId || null,
      seasonNumber: payload.seasonNumber ? Number(payload.seasonNumber) : null,
      episodeNumber: payload.episodeNumber ? Number(payload.episodeNumber) : null,
      discoveredVia: payload.discoveredVia || 'manual',
      aiQualityScore: Number(payload.aiQualityScore) || 90,
      createdAt: payload.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await repo.upsertMovie(movie);
    const movies = await repo.getMovies(true);
    res.json({ movie: saved, movies });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save movie' });
  }
});

app.delete('/api/admin/movies/:id', async (req, res) => {
  try {
    await repo.deleteMovie(req.params.id);
    const movies = await repo.getMovies(true);
    res.json({ movies });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete movie' });
  }
});

app.post('/api/admin/series', async (req, res) => {
  try {
    const payload = req.body as Partial<MovieSeries>;
    if (!payload.title) {
      return res.status(400).json({ error: 'Series title is required.' });
    }
    const seriesItem: MovieSeries = {
      id: payload.id || `series-${Date.now()}`,
      title: payload.title.trim(),
      synopsis: payload.synopsis?.trim() || '',
      thumbnailUrl:
        payload.thumbnailUrl?.trim() ||
        'https://i.ytimg.com/vi/WhWc3b3KhnY/hqdefault.jpg',
      backdropUrl:
        payload.backdropUrl?.trim() ||
        'https://i.ytimg.com/vi/WhWc3b3KhnY/maxresdefault.jpg',
      primaryCategory:
        (payload.primaryCategory as MovieCategory) || 'Complete AI Movie Series',
      channelTitle: payload.channelTitle?.trim() || 'Aetheria Series Studio',
      totalSeasons: Number(payload.totalSeasons) || 1,
      status: payload.status || 'ongoing',
      createdAt: payload.createdAt || new Date().toISOString(),
    };
    await repo.upsertSeries(seriesItem);
    const series = await repo.getSeries();
    res.json({ seriesItem, series });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save series' });
  }
});

app.post('/api/admin/sources', async (req, res) => {
  try {
    const { sourceType, value, label, targetCategory } = req.body;
    if (!value || !sourceType) {
      return res.status(400).json({ error: 'Source type and value are required.' });
    }
    await repo.addSource({
      id: `src-${Date.now()}`,
      sourceType,
      value: value.trim(),
      label: label?.trim() || value.trim(),
      targetCategory: targetCategory || 'Billionaire Romance',
      isActive: true,
      lastCheckedAt: null,
    });
    const sources = await repo.getSources();
    res.json({ sources });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to add source' });
  }
});

app.delete('/api/admin/sources/:id', async (req, res) => {
  try {
    await repo.removeSource(req.params.id);
    const sources = await repo.getSources();
    res.json({ sources });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to remove source' });
  }
});

app.post('/api/admin/settings', async (req, res) => {
  try {
    const settings = await repo.updateSettings(req.body);
    res.json({ settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update admin settings' });
  }
});

app.post('/api/admin/supabase/sync', async (_req, res) => {
  try {
    const syncResult = await repo.syncAllToSupabase();
    const diagnostics = await repo.checkDiagnostics();
    res.json({ syncResult, diagnostics });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Supabase synchronization failed' });
  }
});

// --- EXTERNAL CRON WEBHOOK ENDPOINT (For Supabase pg_cron or Cloud Scheduler) ---
app.post('/api/cron/discover', async (req, res) => {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (
    configuredSecret &&
    configuredSecret !== 'your-cron-webhook-secret' &&
    req.headers['x-cron-secret'] !== configuredSecret
  ) {
    return res.status(401).json({ error: 'Unauthorized cron webhook request' });
  }

  if (isDiscoveryRunning) {
    return res.status(202).json({ status: 'already_running' });
  }

  try {
    isDiscoveryRunning = true;
    const runLog = await runDiscoveryPipeline('webhook');
    res.json({ status: 'completed', runLog });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Cron discovery failed' });
  } finally {
    isDiscoveryRunning = false;
  }
});

const IS_SERVERLESS_RUNTIME = Boolean(
  process.env.NETLIFY ||
    process.env.NETLIFY_FUNCTIONS_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
);

// Background scheduler loop while container is warm (non-serverless)
if (!IS_SERVERLESS_RUNTIME) {
  setInterval(() => {
    void triggerScheduledDiscoveryIfNeeded('scheduled');
  }, 5 * 60 * 1000);
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TK STORYWORLD Streaming Platform listening on http://localhost:${PORT}`);
    // Trigger initial startup discovery check asynchronously
    setTimeout(() => {
      void triggerScheduledDiscoveryIfNeeded('startup');
    }, 1500);
  });
}

if (!IS_SERVERLESS_RUNTIME) {
  void startServer();
}

export { app };

