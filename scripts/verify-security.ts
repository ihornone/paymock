#!/usr/bin/env tsx

const BASE_URL = (process.env.PAYMOCK_BASE_URL || 'http://localhost:8787').replace(/\/+$/, '');

const LEAKED_DEMO_TOKEN = 'pmk_demo_test1234567890abcdef';

const REQUEST_TIMEOUT_MS = Number(process.env.PAYMOCK_VERIFY_TIMEOUT_MS || 15_000);

const RATE_LIMIT_PROBE_REQUESTS = 30;
const RATE_LIMIT_MAX_EXTRA = 15;

const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 90_000;

type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';

interface CheckResult {
  index: number;
  title: string;
  status: CheckStatus;
  expectation: string;
  actual: string;
  detail?: string;
}

interface HttpResponse {
  status: number;
  body: string;
  lowerBody: string;
  headers: Headers;
}

const results: CheckResult[] = [];

function record(result: CheckResult): void {
  results.push(result);
}

async function httpRequest(path: string, init: RequestInit = {}): Promise<HttpResponse> {
  const url = `${BASE_URL}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const body = await response.text();
    return {
      status: response.status,
      body,
      lowerBody: body.toLowerCase(),
      headers: response.headers,
    };
  } finally {
    clearTimeout(timer);
  }
}

function rateLimitResetMs(response: HttpResponse): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter && /^\d+$/.test(retryAfter.trim())) {
    return Math.min(Number(retryAfter.trim()) * 1000 + 1000, MAX_RATE_LIMIT_WAIT_MS);
  }

  const resetAt = response.headers.get('x-ratelimit-reset');
  if (resetAt && /^\d+$/.test(resetAt.trim())) {
    const deltaMs = Number(resetAt.trim()) * 1000 - Date.now();
    return Math.min(Math.max(deltaMs, 0) + 1000, MAX_RATE_LIMIT_WAIT_MS);
  }

  return MAX_RATE_LIMIT_WAIT_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function httpAllowingRateLimitRetry(
  path: string,
  init: RequestInit = {}
): Promise<HttpResponse> {
  let response = await httpRequest(path, init);
  let attempts = 0;

  while (response.status === 429 && attempts < MAX_RATE_LIMIT_RETRIES) {
    const waitMs = rateLimitResetMs(response);
    console.log(
      `      (the server is rate limiting this client — waiting ${Math.round(waitMs / 1000)}s for the window to reset)`
    );
    await sleep(waitMs);
    response = await httpRequest(path, init);
    attempts += 1;
  }

  return response;
}

async function runCheck(
  index: number,
  title: string,
  expectation: string,
  fn: () => Promise<Omit<CheckResult, 'index' | 'title' | 'expectation'>>
): Promise<void> {
  try {
    const outcome = await fn();
    record({ index, title, expectation, ...outcome });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    record({
      index,
      title,
      expectation,
      status: 'FAIL',
      actual: 'request failed',
      detail: message,
    });
  }
}

function expectStatus(
  response: HttpResponse,
  accepted: number[],
  what: string
): { ok: boolean; actual: string } {
  const ok = accepted.includes(response.status);
  return {
    ok,
    actual: `${response.status}${ok ? '' : ` (${what})`}`,
  };
}

async function preflight(): Promise<boolean> {
  try {
    await httpRequest('/');
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[ERROR] Cannot reach the instance at ${BASE_URL}: ${message}`);
    console.error('');
    console.error('Start it first, then re-run the verification:');
    console.error('  pnpm run dev            # local Next.js server on :8787');
    console.error('  pnpm run dev:worker     # wrangler dev (Workers runtime)');
    console.error('');
    console.error('Or point the script elsewhere:');
    console.error('  PAYMOCK_BASE_URL=https://your-deployment pnpm run verify:security');
    return false;
  }
}

async function checkUnauthenticatedAdminCalls(): Promise<void> {
  await runCheck(
    1,
    'POST /api/admin/projects without credentials is rejected',
    'HTTP 401',
    async () => {
      const response = await httpAllowingRateLimitRetry('/api/admin/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'security-probe', edrpou: '12345678' }),
      });
      const { ok, actual } = expectStatus(response, [401], 'an unauthenticated POST must not create a project');
      return {
        status: ok ? 'PASS' : 'FAIL',
        actual,
        detail: ok ? undefined : response.body.slice(0, 200),
      };
    }
  );

  await runCheck(
    2,
    'GET /api/admin/projects without credentials is rejected',
    'HTTP 401',
    async () => {
      const response = await httpAllowingRateLimitRetry('/api/admin/projects', { method: 'GET' });
      const { ok, actual } = expectStatus(response, [401], 'the project list must not be readable anonymously');
      return {
        status: ok ? 'PASS' : 'FAIL',
        actual,
        detail: ok ? undefined : response.body.slice(0, 200),
      };
    }
  );

  await runCheck(
    3,
    'PATCH /api/admin/projects without credentials is rejected',
    'HTTP 401',
    async () => {
      const response = await httpAllowingRateLimitRetry('/api/admin/projects', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'security-probe', name: 'security-probe' }),
      });
      const { ok, actual } = expectStatus(response, [401], 'a project must not be editable anonymously');
      return {
        status: ok ? 'PASS' : 'FAIL',
        actual,
        detail: ok ? undefined : response.body.slice(0, 200),
      };
    }
  );

  await runCheck(
    4,
    'DELETE /api/admin/projects without credentials is rejected',
    'HTTP 401',
    async () => {
      const response = await httpAllowingRateLimitRetry('/api/admin/projects?id=security-probe', { method: 'DELETE' });
      const { ok, actual } = expectStatus(response, [401], 'a project must not be deletable anonymously');
      return {
        status: ok ? 'PASS' : 'FAIL',
        actual,
        detail: ok ? undefined : response.body.slice(0, 200),
      };
    }
  );

  await runCheck(
    5,
    'POST /api/admin/projects/reset-token without credentials is rejected',
    'HTTP 401',
    async () => {
      const response = await httpAllowingRateLimitRetry('/api/admin/projects/reset-token', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'security-probe' }),
      });
      const { ok, actual } = expectStatus(response, [401], 'a token must not be rotatable anonymously');
      return {
        status: ok ? 'PASS' : 'FAIL',
        actual,
        detail: ok ? undefined : response.body.slice(0, 200),
      };
    }
  );

  await runCheck(
    6,
    'POST /api/account/tokens without credentials is rejected',
    'HTTP 401',
    async () => {
      const response = await httpAllowingRateLimitRetry('/api/account/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: 'security-probe' }),
      });
      const { ok, actual } = expectStatus(response, [401], 'no personal access token may be issued anonymously');
      return {
        status: ok ? 'PASS' : 'FAIL',
        actual,
        detail: ok ? undefined : response.body.slice(0, 200),
      };
    }
  );
}

async function checkMcpManifest(): Promise<void> {
  await runCheck(
    7,
    'GET /api/mcp without a token is rejected',
    'HTTP 401',
    async () => {
      const response = await httpAllowingRateLimitRetry('/api/mcp', { method: 'GET' });
      const { ok, actual } = expectStatus(response, [401], 'the MCP manifest must not be public');
      return {
        status: ok ? 'PASS' : 'FAIL',
        actual,
        detail: ok ? undefined : response.body.slice(0, 200),
      };
    }
  );
}

async function checkMcpResourceLeak(): Promise<void> {
  await runCheck(
    8,
    'POST /api/mcp resources/read paymock://projects leaks no credentials',
    'HTTP 200 without any token material in the payload',
    async () => {
      const token = process.env.PAYMOCK_TEST_TOKEN;
      if (!token || !token.trim()) {
        return {
          status: 'SKIP',
          actual: 'not run (PAYMOCK_TEST_TOKEN is not set)',
          detail:
            'Set PAYMOCK_TEST_TOKEN to a personal access token (pmk_usr_…) to check the MCP payload for credential leaks.',
        };
      }

      const response = await httpAllowingRateLimitRetry('/api/mcp', {
        method: 'POST',
        headers: { 'X-Token': token.trim() },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'resources/read',
          params: { uri: 'paymock://projects' },
        }),
      });

      if (response.status !== 200) {
        return {
          status: 'FAIL',
          actual: `${response.status}`,
          detail:
            response.status === 401
              ? 'The supplied token was rejected — check that PAYMOCK_TEST_TOKEN is a live personal access token.'
              : response.body.slice(0, 200),
        };
      }

      if (response.lowerBody.includes('pmk_')) {
        return {
          status: 'FAIL',
          actual: 'the response contains a token prefix',
          detail: 'A "pmk_" prefix was found in the MCP response — a credential is being serialised to the client.',
        };
      }

      if (response.lowerBody.includes('token_hash') || response.lowerBody.includes('webhook_secret')) {
        return {
          status: 'FAIL',
          actual: 'the response contains a secret column',
          detail: 'token_hash / webhook_secret must never leave the server.',
        };
      }

      try {
        const envelope = JSON.parse(response.body) as {
          result?: { contents?: Array<{ text?: string }> };
        };
        const text = envelope.result?.contents?.[0]?.text ?? '[]';
        const projects = JSON.parse(text) as Array<Record<string, unknown>>;

        const forbidden = ['token', 'token_hash', 'webhook_secret', 'secret'];
        for (const project of projects) {
          const leaked = forbidden.filter((key) => key in project);
          if (leaked.length > 0) {
            return {
              status: 'FAIL',
              actual: 'the response contains a secret field',
              detail: `Forbidden field(s) in the MCP project payload: ${leaked.join(', ')}`,
            };
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: 'FAIL',
          actual: 'the MCP response could not be parsed',
          detail: message,
        };
      }

      return {
        status: 'PASS',
        actual: '200, no token material and no secret fields in the payload',
      };
    }
  );
}

async function checkLeakedDemoToken(): Promise<void> {
  await runCheck(
    9,
    'GET /api/merchant/details rejects the leaked demo token',
    'HTTP 403',
    async () => {
      const response = await httpAllowingRateLimitRetry('/api/merchant/details', {
        method: 'GET',
        headers: { 'X-Token': LEAKED_DEMO_TOKEN },
      });
      const { ok, actual } = expectStatus(
        response,
        [403],
        'the demo token published in the repository must not authenticate'
      );
      return {
        status: ok ? 'PASS' : 'FAIL',
        actual,
        detail: ok
          ? undefined
          : `The leaked demo token was accepted (${response.status}). The seeded row still stores the plaintext token — re-seed it with a hashed token.`,
      };
    }
  );
}

async function checkCsrf(): Promise<void> {
  await runCheck(
    11,
    'POST /api/admin/projects with a forged cookie and a foreign Origin is rejected',
    'HTTP 403 or 401 (never 200)',
    async () => {
      const response = await httpAllowingRateLimitRetry('/api/admin/projects', {
        method: 'POST',
        headers: {
          Cookie: '__session=forged-session-value',
          Origin: 'https://evil.example',
        },
        body: JSON.stringify({ name: 'csrf-probe', edrpou: '12345678' }),
      });

      const ok = response.status === 403 || response.status === 401;
      return {
        status: ok ? 'PASS' : 'FAIL',
        actual: `${response.status}`,
        detail: ok
          ? undefined
          : `A cross-origin request with a forged cookie was answered with ${response.status} — the CSRF check did not fire.`,
      };
    }
  );
}

async function checkRateLimit(): Promise<void> {
  await runCheck(
    10,
    'POST /api/admin/projects is rate limited per IP',
    'at least one HTTP 429 in the burst',
    async () => {
      let sent = 0;
      let sawTooMany = 0;
      let firstStatus = 0;
      const statuses = new Map<number, number>();

      const maxRequests = RATE_LIMIT_PROBE_REQUESTS + RATE_LIMIT_MAX_EXTRA;

      while (sent < maxRequests) {
        const response = await httpRequest('/api/admin/projects', {
          method: 'POST',
          body: JSON.stringify({ name: 'rate-limit-probe', edrpou: '12345678' }),
        });

        sent += 1;
        if (sent === 1) firstStatus = response.status;
        statuses.set(response.status, (statuses.get(response.status) || 0) + 1);

        if (response.status === 429) {
          sawTooMany += 1;
          if (sawTooMany >= 3) break;
        }
      }

      const summary = [...statuses.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([code, count]) => `${code}x${count}`)
        .join(', ');

      if (sawTooMany === 0) {
        return {
          status: 'FAIL',
          actual: `${sent} requests, no 429 (${summary})`,
          detail:
            'The per-IP limiter never answered 429. An anonymous caller can hammer the endpoint without being throttled.',
        };
      }

      if (firstStatus === 429) {
        return {
          status: 'PASS',
          actual: `${sent} requests, ${sawTooMany} answered with 429 (${summary})`,
          detail:
            'The bucket was already exhausted when the burst started (the limiter keeps its counter between runs) — the limiter is active for this IP.',
        };
      }

      return {
        status: 'PASS',
        actual: `${sent} requests, ${sawTooMany} answered with 429 (${summary})`,
      };
    }
  );
}

function printResults(): void {
  console.log('');
  console.log('Paymock security verification');
  console.log(`Target: ${BASE_URL}`);
  console.log('');

  const ordered = [...results].sort((a, b) => a.index - b.index);

  for (const result of ordered) {
    const label = result.status === 'PASS' ? '[PASS]' : result.status === 'FAIL' ? '[FAIL]' : '[SKIP]';
    console.log(`${label} ${result.index}. ${result.title}`);
    console.log(`       expected: ${result.expectation}`);
    console.log(`       actual:   ${result.actual}`);

    if (result.detail) {
      console.log(`       detail:   ${result.detail}`);
    }
    console.log('');
  }

  const executed = results.filter((r) => r.status !== 'SKIP').length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log('----------------------------------------');
  console.log(`${passed}/${executed} passed`);

  if (failed > 0) {
    console.log(`${failed} failed`);
  }
  if (skipped > 0) {
    console.log(`${skipped} skipped`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const reachable = await preflight();
  if (!reachable) {
    process.exit(1);
  }

  await checkUnauthenticatedAdminCalls();
  await checkMcpManifest();
  await checkLeakedDemoToken();
  await checkCsrf();
  await checkMcpResourceLeak();
  await checkRateLimit();

  printResults();

  const failures = results.filter((r) => r.status === 'FAIL').length;
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`\n[FATAL] The verification script itself failed:\n${message}`);
  process.exit(1);
});

export {};
