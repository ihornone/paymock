'use client';

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Copy, Check, ChevronDown } from 'lucide-react';

interface DocContentViewerProps {
  htmlContent: string;
}

export function DocContentViewer({ htmlContent }: DocContentViewerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    // 1. Enhance and restyle all <details> accordion elements
    const detailElements = containerRef.current.querySelectorAll('details');
    detailElements.forEach((detail) => {
      if (detail.dataset.enhanced === 'true') return;
      detail.dataset.enhanced = 'true';

      detail.className =
        'details-card group my-3.5 rounded-xl border border-border/80 bg-card/50 shadow-sm transition-all duration-200 overflow-hidden';

      const summary = detail.querySelector('summary');
      if (summary) {
        summary.className =
          'flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5 cursor-pointer select-none transition-colors hover:bg-muted/30 focus-visible:outline-none list-none';

        // Extract error code badge and message text
        const codeSpan = summary.querySelector('span');
        const codeText = codeSpan?.textContent?.trim() || '';

        let messageText = '';
        if (codeSpan) {
          codeSpan.remove();
          messageText = summary.textContent?.trim() || '';
        } else {
          messageText = summary.textContent?.trim() || '';
        }

        // Clean up summary HTML
        summary.innerHTML = '';

        // Left container: Badge + Error Title
        const leftBox = document.createElement('div');
        leftBox.className = 'flex items-center gap-2.5 sm:gap-3 flex-wrap min-w-0';

        if (codeText) {
          const badge = document.createElement('span');
          const isWarning = codeText.includes('TIMEOUT') || codeText.includes('429');
          badge.className = isWarning
            ? 'inline-flex items-center rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] sm:text-xs font-mono font-semibold text-amber-400 tracking-wide shadow-xs shrink-0'
            : 'inline-flex items-center rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[11px] sm:text-xs font-mono font-semibold text-rose-400 tracking-wide shadow-xs shrink-0';
          badge.textContent = codeText;
          leftBox.appendChild(badge);
        }

        const titleSpan = document.createElement('span');
        titleSpan.className = 'text-xs sm:text-sm font-medium text-foreground tracking-tight';
        titleSpan.textContent = messageText;
        leftBox.appendChild(titleSpan);

        summary.appendChild(leftBox);

        // Right container: Lucide ChevronDown Icon
        const chevronWrapper = document.createElement('div');
        chevronWrapper.className =
          'text-muted-foreground transition-transform duration-200 shrink-0 ml-2 group-open:rotate-180';
        const chevronRoot = createRoot(chevronWrapper);
        chevronRoot.render(<ChevronDown className="h-4 w-4" />);
        summary.appendChild(chevronWrapper);
      }

      // Wrap details inner body in styled container
      const bodyWrapper = document.createElement('div');
      bodyWrapper.className =
        'details-body border-t border-border/60 bg-muted/15 p-4 sm:p-5 space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed';

      // Move all non-summary children into bodyWrapper
      const childNodes = Array.from(detail.childNodes);
      childNodes.forEach((child) => {
        if (child !== summary) {
          bodyWrapper.appendChild(child);
        }
      });
      detail.appendChild(bodyWrapper);
    });

    // 2. Find all <pre> elements in markdown content
    const preElements = containerRef.current.querySelectorAll('pre');

    preElements.forEach((pre) => {
      // Avoid duplicate wrappers if re-rendered
      if (pre.parentElement?.classList.contains('code-block-wrapper')) return;

      const codeElement = pre.querySelector('code');
      const textToCopy = codeElement ? codeElement.innerText : pre.innerText;

      // Extract language if specified in class (e.g. language-http -> HTTP)
      let langName = '';
      if (codeElement) {
        const langClass = Array.from(codeElement.classList).find((c) => c.startsWith('language-'));
        if (langClass) {
          langName = langClass.replace('language-', '').toUpperCase();
        }
      }

      // Check if inside details for tighter styling
      const isInsideDetails = pre.closest('.details-body') !== null;

      // Create outer wrapper
      const wrapper = document.createElement('div');
      wrapper.className = isInsideDetails
        ? 'code-block-wrapper relative my-3 rounded-xl border border-border/80 bg-zinc-950 overflow-hidden shadow-xs'
        : 'code-block-wrapper relative my-5 rounded-xl border border-border bg-zinc-950 overflow-hidden shadow-sm';

      // Create header bar
      const headerBar = document.createElement('div');
      headerBar.className =
        'flex items-center justify-between px-4 py-2 border-b border-border/60 bg-zinc-900/60 text-xs text-muted-foreground select-none';

      const langSpan = document.createElement('span');
      langSpan.className = 'font-mono text-[11px] font-semibold text-zinc-400 tracking-wider';
      langSpan.textContent = langName || 'CODE';
      headerBar.appendChild(langSpan);

      // Create container for Lucide Copy Button
      const copyBtnContainer = document.createElement('div');
      headerBar.appendChild(copyBtnContainer);

      const CopyButtonComponent = () => {
        const [copied, setCopied] = React.useState(false);

        const handleCopy = async () => {
          try {
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch (err) {
            console.error('Failed to copy code:', err);
          }
        };

        return (
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer font-sans font-medium"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Скопійовано</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Копіювати</span>
              </>
            )}
          </button>
        );
      };

      const copyRoot = createRoot(copyBtnContainer);
      copyRoot.render(<CopyButtonComponent />);

      // Restyle pre element
      pre.className = isInsideDetails
        ? 'm-0 p-3.5 sm:p-4 overflow-x-auto text-[12px] sm:text-[13px] leading-relaxed font-mono text-zinc-100 bg-transparent'
        : 'm-0 p-4 sm:p-5 overflow-x-auto text-[12px] sm:text-[13px] leading-relaxed font-mono text-zinc-100 bg-transparent';

      if (codeElement) {
        codeElement.className = 'font-mono block leading-relaxed';
      }

      // Replace pre with wrapper containing header and pre
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(headerBar);
      wrapper.appendChild(pre);
    });
  }, [htmlContent]);

  return (
    <div
      ref={containerRef}
      className="prose-doc max-w-none"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
