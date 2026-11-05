import { redirect } from 'next/navigation';
import { getDocsActor } from '@/features/docs/server/docs-session';

export const dynamic = 'force-dynamic';

export default async function DocsIndexPage() {
  await getDocsActor();

  redirect('/docs/overview');
}
