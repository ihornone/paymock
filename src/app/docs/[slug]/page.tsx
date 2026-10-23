import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { DOCS_ARTICLES } from '@/features/docs/articles';
import { DocsShell } from '@/features/docs/components/docs-shell';
import { DocContentViewer } from '@/features/docs/components/doc-content-viewer';
import { requireDocsSession } from '@/features/docs/server/docs-session';

interface DocsPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * The documentation is an account-scoped surface.
 *
 * The page is rendered per request (`force-dynamic`) and only after the
 * session check: a static build would put the whole contract of the
 * platform — including the account-scoped endpoints — into publicly
 * reachable files. `generateStaticParams` is deliberately absent for the
 * same reason.
 */
export const dynamic = 'force-dynamic';

export default async function DocArticlePage({ params }: DocsPageProps) {
  // The article content is only rendered for an authenticated account.
  await requireDocsSession();

  const { slug } = await params;
  const article = DOCS_ARTICLES[slug];

  if (!article) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8787';
  const host = new URL(baseUrl).host;

  const rawMarkdown = article.content
    .replace(/{{BASE_URL}}/g, baseUrl)
    .replace(/{{HOST}}/g, host);

  const htmlContent = marked.parse(rawMarkdown) as string;

  // Group articles for sidebar
  const categories: Record<string, typeof DOCS_ARTICLES[string][]> = {};
  for (const item of Object.values(DOCS_ARTICLES)) {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  }

  // Calculate prev and next articles
  const articleList = Object.values(DOCS_ARTICLES);
  const currentIndex = articleList.findIndex((a) => a.slug === slug);
  const prevArticle = currentIndex > 0 ? articleList[currentIndex - 1] : null;
  const nextArticle =
    currentIndex >= 0 && currentIndex < articleList.length - 1
      ? articleList[currentIndex + 1]
      : null;

  return (
    <DocsShell
      slug={slug}
      categories={categories}
      currentArticle={article}
      prevArticle={prevArticle}
      nextArticle={nextArticle}
    >
      <DocContentViewer htmlContent={htmlContent} />
    </DocsShell>
  );
}
