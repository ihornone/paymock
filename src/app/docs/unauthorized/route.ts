import { NextResponse } from 'next/server';

/**
 * The answer to an unauthenticated documentation request.
 *
 * The documentation pages redirect here when the request carries no valid
 * session. The response is a real 401 (not a 200 page with a message), so
 * an automated client sees the refusal instead of a successful response, and
 * the article content is never part of the body.
 */

const UNAUTHORIZED_HTML = `<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>401 — Потрібна авторизація · Paymock Docs</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background: #0b0d12;
        color: #e6e8ee;
      }
      main {
        max-width: 32rem;
        padding: 2.5rem;
        text-align: center;
      }
      h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
      p { font-size: 0.875rem; line-height: 1.6; color: #9aa1b1; margin: 0 0 1.5rem; }
      a {
        display: inline-block;
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
        background: #2563eb;
        color: #fff;
        font-size: 0.875rem;
        text-decoration: none;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.8125rem;
        color: #c7cddb;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>401 · Потрібна авторизація</h1>
      <p>
        Документація Paymock описує внутрішній контракт платформи, тому вона доступна
        лише авторизованому акаунту. Увійдіть через Clerk або передайте
        персональний токен акаунта (<code>X-Token: pmk_usr_…</code>) у запиті.
      </p>
      <a href="/">Перейти до панелі керування</a>
    </main>
  </body>
</html>`;

export async function GET() {
  return new NextResponse(UNAUTHORIZED_HTML, {
    status: 401,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      // The documentation must not end up in a search index.
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
