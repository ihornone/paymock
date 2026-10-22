'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only page shell.
 *
 * The dashboard pages are rendered in the browser only. Server-rendering them
 * pulled the whole dashboard component tree — and the Clerk SDK it imports —
 * into the Worker bundle, where it was evaluated on every cold start of every
 * request, including pure API calls.
 */
const PageContent = dynamic(
  () => import('./profile-content').then((mod) => mod.PageContent),
  { ssr: false }
);

export default function Page() {
  return <PageContent />;
}
