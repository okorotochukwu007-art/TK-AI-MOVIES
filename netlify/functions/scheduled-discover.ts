process.env.NETLIFY_FUNCTIONS_ENV = 'true';

import { repo } from '../../src/server/supabaseRepo.ts';
import { runDiscoveryPipeline } from '../../src/server/youtubeDiscovery.ts';

export const handler = async () => {
  try {
    const diag = await repo.checkDiagnostics();
    const runLog = await runDiscoveryPipeline('scheduled');
    if (diag.tablesReady) {
      await repo.syncAllToSupabase();
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'completed',
        moviesAdded: runLog.moviesAdded,
        summary: runLog.summary,
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Scheduled discovery failed',
      }),
    };
  }
};
