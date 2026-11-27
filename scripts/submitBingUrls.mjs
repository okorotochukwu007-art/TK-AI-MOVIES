import fs from 'fs';
import path from 'path';

const SITE_ORIGIN = (
  process.env.CANONICAL_SITE_ORIGIN || 'https://www.tkstoryworld.name.ng'
).replace(/\/+$/, '');
const SITE_HOST = new URL(SITE_ORIGIN).hostname;
const INDEXNOW_KEY = (
  process.env.INDEXNOW_KEY || '9f4c2e7b1a8d4c3e8b5f6a2d0e7c1b9a'
).trim();
const BING_API_KEY = (process.env.BING_WEBMASTER_API_KEY || '').trim();
const DRY_RUN = process.argv.includes('--dry-run');

function extractSitemapUrls(sitemapPath) {
  if (!fs.existsSync(sitemapPath)) {
    throw new Error(`Sitemap not found at ${sitemapPath}. Run "npm run generate:sitemap" first.`);
  }
  const xml = fs.readFileSync(sitemapPath, 'utf-8');
  const urls = [];
  const seen = new Set();
  const re = /<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const loc = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
    if (loc && !seen.has(loc)) {
      seen.add(loc);
      urls.push(loc);
    }
  }
  return urls;
}

async function submitToIndexNow(urls) {
  const keyLocation = `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`;
  // IndexNow accepts up to 10,000 URLs per POST request
  const batchSize = 10000;
  let totalSubmitted = 0;

  for (let i = 0; i < urls.length; i += batchSize) {
    const chunk = urls.slice(i, i + batchSize);
    const payload = {
      host: SITE_HOST,
      key: INDEXNOW_KEY,
      keyLocation,
      urlList: chunk,
    };

    if (DRY_RUN) {
      console.log(
        `[IndexNow][DRY RUN] Would POST ${chunk.length} URLs to https://api.indexnow.org/IndexNow (keyLocation: ${keyLocation})`
      );
      totalSubmitted += chunk.length;
      continue;
    }

    const res = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });

    const bodyText = await res.text().catch(() => '');
    if (res.status === 200 || res.status === 202) {
      totalSubmitted += chunk.length;
      console.log(
        `[IndexNow] Success (HTTP ${res.status}): submitted ${chunk.length} URLs to Bing/Yandex/IndexNow.`
      );
    } else {
      console.warn(
        `[IndexNow] Returned HTTP ${res.status}: ${bodyText.slice(0, 300) || res.statusText}`
      );
      console.warn(
        `[IndexNow] Make sure ${keyLocation} is deployed and live on Cloudflare Pages first.`
      );
    }
  }

  return totalSubmitted;
}

async function submitToBingUrlApi(urls) {
  if (!BING_API_KEY) {
    console.log(
      '[Bing URL API] Skipped (BING_WEBMASTER_API_KEY not set — IndexNow already notifies Bing directly without an API key).'
    );
    return 0;
  }

  // Bing URL Submission API allows up to 500 URLs per SubmitUrlbatch call
  const batchSize = 500;
  let totalSubmitted = 0;

  for (let i = 0; i < urls.length; i += batchSize) {
    const chunk = urls.slice(i, i + batchSize);
    const endpoint = `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${encodeURIComponent(BING_API_KEY)}`;

    if (DRY_RUN) {
      console.log(
        `[Bing URL API][DRY RUN] Would submit batch of ${chunk.length} URLs to Bing Webmaster SubmitUrlbatch`
      );
      totalSubmitted += chunk.length;
      continue;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        siteUrl: `${SITE_ORIGIN}/`,
        urlList: chunk,
      }),
    });

    const bodyText = await res.text().catch(() => '');
    if (res.ok) {
      totalSubmitted += chunk.length;
      console.log(
        `[Bing URL API] Batch ${Math.floor(i / batchSize) + 1} accepted (HTTP ${res.status}): ${chunk.length} URLs.`
      );
    } else {
      console.warn(
        `[Bing URL API] Batch ${Math.floor(i / batchSize) + 1} returned HTTP ${res.status}: ${bodyText.slice(0, 300)}`
      );
      // Stop early if Bing daily quota is reached
      if (res.status === 400 || res.status === 429 || /quota/i.test(bodyText)) {
        break;
      }
    }
  }

  return totalSubmitted;
}

async function main() {
  const sitemapPath = path.resolve(process.cwd(), 'public', 'sitemap.xml');
  const urls = extractSitemapUrls(sitemapPath);
  console.log(
    `[SEO Submit] Loaded ${urls.length} canonical URLs from ${sitemapPath} for ${SITE_ORIGIN}`
  );

  await submitToIndexNow(urls);
  await submitToBingUrlApi(urls);
}

main().catch((err) => {
  console.error('[SEO Submit] Error:', err?.message || err);
  process.exit(1);
});
