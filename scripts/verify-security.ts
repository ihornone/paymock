#!/usr/bin/env tsx
/**
 * Live security verification harness for Paymock.
 *
 * The audit that produced the current hardening pass was static: it read the
 * source and concluded that the admin API "looks" guarded. This script is the
 * reproducible counterpart — it drives the *running* instance over HTTP and
 * asserts the observable behaviour that the audit promised:
 *
 *   - unauthenticated admin calls are rejected (401), not silently executed;
 *   - the MCP resource reader never leaks credentials or foreign projects;
 *   - the leaked demo token from the old public repo no longer authenticates;
 *   - the per-IP rate limiter actually answers with 429;
 *   - a forged session cookie cannot drive a cross-origin mutation.
 *
 * Design constraints:
 *   - no external dependencies (Node 18+ `fetch` only), so the script runs
 *     anywhere the app runs;
 *   - the API token is never printed — only its presence and the result of
 *     the check;
 *   - every failure is explained in words, so the output is actionable
 *     without opening the source.
 *
 * Usage:
 *   PAYMOCK_BASE_URL=http://localhost:8787 pnpm run verify:security
 *   PAYMOCK_TEST_TOKEN=pmk_usr_… pnpm run verify:security
 *
 * Exit code is 1 when any check fails, 0 otherwise.
 */

const BASE_URL = (process.env.PAYMOCK_BASE_URL || 'http://localhost:8787').replace(/\/+$/, '');

/**
 * The demo token that used to live in `schema.sql` in plaintext and was
 * therefore published with the repository. It must never authenticate again:
 * the current schema stores only the SHA-256 hash of a token, and the seeded
 * row was migrated away from the plaintext value.
 */
const LEAKED_DEMO_TOKEN = 'pmk_demo_test1234567890abcdef';

const REQUEST_TIMEOUT_MS = Number(process.env.PAYMOCK_VERIFY_TIMEOUT_MS || 15_000);

/**
 * The number of requests used by the rate-limit probe.
 *
 * The server applies a 30 req/min ceiling per IP to `project.create`. Two
 * earlier probes in this same script already spend part of that budget, and
 * the 60 s window may also roll over between checks, so the exact request at
 * which the limiter trips depends on the environment. The probe therefore
 * sends this many requests and — only if no 429 was seen — keeps going up to
 * `RATE_LIMIT_MAX_EXTRA` more. The check still FAILS when no 429 appears at
 * all, so the allowance cannot mask a real regression.
 */
const RATE_LIMIT_PROBE_REQUESTS = 30;
const RATE_LIMIT_MAX_EXTRA = 15;

/**
 * How often a request may be retried after the server answered 429, and how
 * long the script is willing to wait for the window to expire.
 */
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 90_000;

type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';

interface CheckResult {
  index: number;
  title: string;
  status: CheckStatus;
  /** What the check expected, in words. */
  expectation: string;
  /** What actually happened. */
  actual: string;
  /** Extra context for a failure. */
  detail?: string;
}

interface HttpResponse {
  status: number;
  body: string;
  /** Lower-cased body, for substring assertions. */
  lowerBody: string;
  /** The response headers — the rate-limit reset is read from them. */
  headers: Headers;
}

const results: CheckResult[] = [];

function record(result: CheckResult): void {
  results.push(result);
}

/**
 * Performs an HTTP request against the instance under test.
 *
 * A transport failure (the instance is down, DNS fails, the socket times
 * out) is turned into a thrown error so the calling check can report it as a
 * FAIL with a readable message instead of an unhandled rejection.
 */
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

/**
 * How long to wait for the server's rate-limit window to expire.
 *
 * The server answers 429 with `Retry-After` and `X-RateLimit-Reset`; when
 * neither is present the 60 s window of the admin guard is assumed.
 */
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

/**
 * Performs a request, waiting out a rate-limit window when the server
 * refuses with 429.
 *
 * Why this is needed: the admin guard limits `project.create` to 30 requests
 * per minute per IP, and this script's own rate-limit probe deliberately
 * exhausts that budget. Without the wait, a second run inside the same
 * minute would see 429 instead of 401 on the early checks and report a
 * security regression that does not exist. Waiting restores the intended
 * condition instead of weakening the assertion.
 */
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

/**
 * Runs one check and converts a thrown error into a FAIL.
 *
 * A check that crashes must never be mistaken for a check that passed.
 */
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

/**
 * Asserts that the response status is exactly one of the accepted codes.
 */
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

/* ------------------------------------------------------------------ *
 * Preflight
 * ------------------------------------------------------------------ */

/**
 * Verifies that something is listening before the real checks run.
 *
 * Without this, every check would fail with "fetch failed" and the report
 * would look like a security regression instead of an operator mistake.
 */
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

/* ------------------------------------------------------------------ *
 * The checks
 * ------------------------------------------------------------------ */

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
      // The body is valid on purpose: an invalid body would be answered with
      // 400 before the guard runs, which would hide the real answer.
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
      // `projectId` is mandatory for this route, so it is sent — otherwise the
      // request would be stopped by validation (400) and never reach the
      // guard that this check is actually about.
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

      // A token anywhere in the payload means a credential escaped.
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

      // Belt and braces: check the decoded project objects too, so a field
      // named differently (e.g. "secret") is still caught.
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
      // A forged session cookie plus a foreign Origin: the shape of a
      // cross-site request forgery. No `Sec-Fetch-Site` header is sent —
      // a browser would set it, but the attack it defends against is the
      // one where the attacker cannot rely on it.
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
        // The raw request is used on purpose here: waiting out a 429 would
        // hide the very answer this check is looking for.
        const response = await httpRequest('/api/admin/projects', {
          method: 'POST',
          body: JSON.stringify({ name: 'rate-limit-probe', edrpou: '12345678' }),
        });

        sent += 1;
        if (sent === 1) firstStatus = response.status;
        statuses.set(response.status, (statuses.get(response.status) || 0) + 1);

        if (response.status === 429) {
          sawTooMany += 1;
          // One 429 is proof; keep going a little to confirm the limiter is
          // stable rather than a one-off.
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

      // The limiter counts per IP in a window that outlives a single run, so
      // the bucket may already have been exhausted by an earlier run. That is
      // not a failure — it is the limiter working — and it is reported
      // separately so the result does not depend on the run order.
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

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const reachable = await preflight();
  if (!reachable) {
    process.exit(1);
  }

  // Order matters. The rate-limit probe deliberately exhausts the per-IP
  // budget of the `project.create` bucket, so it runs last: running it
  // earlier would turn the CSRF probe into a 429 and make its result
  // meaningless.
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

// This file has no imports, so without this statement TypeScript would treat
// it as a global script and its top-level declarations would collide with
// the other scripts in `scripts/`.
export {};
