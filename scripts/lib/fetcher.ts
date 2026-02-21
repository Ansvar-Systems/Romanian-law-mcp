/**
 * Rate-limited HTTP client for Romania's official legal portal.
 *
 * Source:
 *   https://legislatie.just.ro/Public/DetaliiDocument/{documentId}
 *
 * - 1200ms minimum delay between requests (government server friendly)
 * - explicit User-Agent for ingestion provenance
 * - retries for transient 429/5xx failures
 */

const USER_AGENT =
  'Ansvar-Law-MCP/1.0 (+https://github.com/Ansvar-Systems/Romanian-law-mcp; legal-data-ingestion)';
const MIN_DELAY_MS = 1200;

let lastRequestTime = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastRequestTime = Date.now();
}

export interface FetchResult {
  status: number;
  body: string;
  url: string;
  contentType: string;
}

export async function fetchLegislation(url: string, maxRetries = 3): Promise<FetchResult> {
  await applyRateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    const body = await response.text();

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        const backoffMs = (attempt + 1) * 1500;
        console.log(`  HTTP ${response.status} for ${url}; retrying in ${backoffMs}ms`);
        await sleep(backoffMs);
        continue;
      }
    }

    return {
      status: response.status,
      body,
      url: response.url,
      contentType: response.headers.get('content-type') ?? '',
    };
  }

  throw new Error(`Unable to fetch ${url} after ${maxRetries + 1} attempts`);
}
