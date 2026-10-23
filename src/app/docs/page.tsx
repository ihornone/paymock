import { redirect } from 'next/navigation';
import { requireDocsSession } from '@/features/docs/server/docs-session';

/**
 * The documentation is an account-scoped surface, so the page is rendered
 * per request: a static build would put the whole contract of the platform
 * into publicly reachable files.
 */
export const dynamic = 'force-dynamic';

export default async function DocsIndexPage() {
  // An anonymous visitor never reaches the articles.
  await requireDocsSession();

  redirect('/docs/overview');
}
