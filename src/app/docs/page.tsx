import { redirect } from 'next/navigation';
import { getDocsActor } from '@/features/docs/server/docs-session';

/**
 * The documentation is a public surface: every article is readable without
 * a session. The page is still rendered per request, because the articles
 * interpolate the deployment's own base URL.
 */
export const dynamic = 'force-dynamic';

export default async function DocsIndexPage() {
  // Never throws for an anonymous visitor — the docs stay open.
  await getDocsActor();

  redirect('/docs/overview');
}
