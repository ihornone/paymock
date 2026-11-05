'use client';

import dynamic from 'next/dynamic';

const PageContent = dynamic(
  () => import('./overview-content').then((mod) => mod.PageContent),
  { ssr: false }
);

export default function Page() {
  return <PageContent />;
}
