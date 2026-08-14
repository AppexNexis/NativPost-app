import { Info, Lightbulb, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Fragment } from 'react';

import { Kbd } from '@/components/ui/kbd';
import type { GuideBlock, GuideSection } from '@/lib/learn/types';
import { cn } from '@/utils/Helpers';

/**
 * Inline formatting for guide copy — a deliberately small subset:
 *
 *   **bold**   `code`   [label](href)
 *
 * Parsed with one pass over a combined pattern so the three can be mixed in a
 * sentence. Anything else is rendered literally; guide text is authored by the
 * team, not user input, so there is nothing to sanitise beyond React's own
 * escaping (we never set innerHTML).
 */
const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

export function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE_PATTERN).filter(Boolean);

  return parts.map((part, i) => {
    const key = `${i}-${part.slice(0, 12)}`;

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      const external = /^https?:\/\//.test(href!);
      return external
        ? (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
            >
              {label}
            </a>
          )
        : (
            <Link
              key={key}
              href={href!}
              className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
            >
              {label}
            </Link>
          );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

const CALLOUT_STYLES = {
  info: {
    icon: Info,
    wrap: 'border-sky-500/25 bg-sky-500/[0.07]',
    icon_: 'text-sky-600 dark:text-sky-400',
  },
  tip: {
    icon: Lightbulb,
    wrap: 'border-emerald-500/25 bg-emerald-500/[0.07]',
    icon_: 'text-emerald-600 dark:text-emerald-400',
  },
  warn: {
    icon: TriangleAlert,
    wrap: 'border-amber-500/30 bg-amber-500/[0.08]',
    icon_: 'text-amber-600 dark:text-amber-400',
  },
} as const;

function Block({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case 'p':
      return <p className="text-body leading-relaxed text-muted-foreground">{renderInline(block.text)}</p>;

    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          className={cn(
            'space-y-2 pl-5 text-body leading-relaxed text-muted-foreground',
            block.ordered ? 'list-decimal' : 'list-disc',
          )}
        >
          {block.items.map((item, i) => (
            <li key={i} className="pl-1 marker:text-muted-foreground/50">{renderInline(item)}</li>
          ))}
        </Tag>
      );
    }

    case 'steps':
      return (
        <ol className="space-y-4">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3.5">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-foreground">{renderInline(item.title)}</p>
                <p className="mt-0.5 text-body leading-relaxed text-muted-foreground">{renderInline(item.text)}</p>
              </div>
            </li>
          ))}
        </ol>
      );

    case 'callout': {
      const style = CALLOUT_STYLES[block.tone];
      const Icon = style.icon;
      return (
        <div className={cn('flex gap-3 rounded-xl border p-4', style.wrap)}>
          <Icon className={cn('mt-0.5 size-4 shrink-0', style.icon_)} />
          <p className="min-w-0 text-body leading-relaxed text-foreground/90">{renderInline(block.text)}</p>
        </div>
      );
    }

    case 'code':
      return (
        <div className="overflow-x-auto rounded-xl border bg-muted/40">
          <pre className="p-4 text-[13px] leading-relaxed">
            <code className="font-mono text-foreground">{block.code}</code>
          </pre>
        </div>
      );

    case 'table':
      return (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[420px] text-left text-body">
            <thead className="bg-muted/40">
              <tr>
                {block.head.map(h => (
                  <th key={h} className="px-4 py-2.5 text-meta font-semibold uppercase tracking-wide text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5 align-top text-muted-foreground">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'shortcuts':
      return (
        <div className="divide-y rounded-xl border">
          {block.items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex shrink-0 gap-1">
                {item.keys.map(k => <Kbd key={k}>{k}</Kbd>)}
              </span>
              <span className="min-w-0 text-body text-muted-foreground">{renderInline(item.label)}</span>
            </div>
          ))}
        </div>
      );

    default:
      return null;
  }
}

export function GuideBody({ sections }: { sections: GuideSection[] }) {
  return (
    <div className="space-y-10">
      {sections.map(section => (
        <section key={section.id} id={section.id} className="scroll-mt-24">
          <h2 className="mb-4 font-display text-heading text-foreground">{section.heading}</h2>
          <div className="space-y-4">
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
