import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { DOCS_ARTICLES } from '@/src/features/docs/articles';
import { DocsShell } from '@/components/docs/docs-shell';
import { DocContentViewer } from '@/components/docs/doc-content-viewer';

interface DocsPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return Object.keys(DOCS_ARTICLES).map((slug) => ({ slug }));
}

export default async function DocArticlePage({ params }: DocsPageProps) {
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

  return (
    <DocsShell slug={slug} categories={categories}>
      <style dangerouslySetInnerHTML={{ __html: `
        .prose-doc h1 { font-size: 1.75rem; font-weight: 700; border-bottom: 1px solid hsl(var(--border)); padding-bottom: 0.875rem; margin-bottom: 1.25rem; color: hsl(var(--foreground)); line-height: 1.3; }
        @media (min-width: 640px) { .prose-doc h1 { font-size: 2rem; } }
        .prose-doc h2 { font-size: 1.35rem; font-weight: 600; margin-top: 2.25rem; margin-bottom: 0.875rem; color: hsl(var(--foreground)); }
        .prose-doc h3 { font-size: 1.15rem; font-weight: 600; margin-top: 1.75rem; margin-bottom: 0.625rem; color: hsl(var(--foreground)); }
        .prose-doc p { font-size: 0.9rem; line-height: 1.7; color: hsl(var(--muted-foreground)); margin-bottom: 1.25rem; word-break: break-word; }
        .prose-doc ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1.25rem; font-size: 0.9rem; line-height: 1.6; color: hsl(var(--muted-foreground)); }
        .prose-doc li { margin-bottom: 0.45rem; }
        .prose-doc code:not(pre code) { background-color: hsl(var(--secondary)); color: hsl(var(--foreground)); padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.825rem; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .prose-doc blockquote { border-left: 3px solid hsl(var(--primary)); padding-left: 1.25rem; margin: 1.25rem 0; font-style: italic; color: hsl(var(--muted-foreground)); }
        .prose-doc table { width: 100%; border-collapse: collapse; margin: 1.25rem 0 1.75rem 0; font-size: 0.825rem; display: block; overflow-x: auto; }
        .prose-doc th { border: 1px solid hsl(var(--border)); background-color: hsl(var(--muted)); padding: 0.625rem 0.875rem; text-align: left; font-weight: 600; }
        .prose-doc td { border: 1px solid hsl(var(--border)); padding: 0.625rem 0.875rem; color: hsl(var(--muted-foreground)); }
        .prose-doc details { border: 1px solid hsl(var(--border)); border-radius: 0.75rem; background-color: hsl(var(--card) / 0.5); margin: 0.875rem 0; overflow: hidden; transition: all 0.2s ease; }
        .prose-doc details[open] { background-color: hsl(var(--card)); border-color: hsl(var(--border)); box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.2); }
        .prose-doc summary { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.875rem 1.125rem; font-size: 0.875rem; font-weight: 500; cursor: pointer; user-select: none; list-style: none; transition: background-color 0.15s ease; }
        .prose-doc summary::-webkit-details-marker { display: none; }
        .prose-doc details summary:hover { background-color: hsl(var(--muted) / 0.3); }
        .prose-doc details[open] summary { border-bottom: 1px solid hsl(var(--border) / 0.6); background-color: hsl(var(--muted) / 0.2); }
      ` }} />
      <DocContentViewer htmlContent={htmlContent} />
    </DocsShell>
  );
}
