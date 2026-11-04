import Link from 'next/link';

import { SITE } from '@/shared/config/site';

/**
 * Legal / contact footer — sits in the gray zone *below* the app frame and
 * stays visible on every screen of the shared shell (dashboard and docs
 * alike): the privacy policy must be reachable before a user ever signs in.
 */
export function SiteFooter() {
  return (
    <footer className="shrink-0 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Link
          href="/privacy"
          className="hover:text-foreground transition-colors"
        >
          Політика конфіденційності
        </Link>
        <span aria-hidden="true">·</span>
        <a
          href={`mailto:${SITE.supportEmail}`}
          className="hover:text-foreground transition-colors"
        >
          {SITE.supportEmail}
        </a>
        <span aria-hidden="true">·</span>
        <a
          href={SITE.repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
