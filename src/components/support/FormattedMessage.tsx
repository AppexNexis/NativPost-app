'use client';

/**
 * FormattedMessage — renders assistant replies as readable text.
 *
 * Models emit light markdown (`**bold**`, `- bullets`, `1.` lists) even when
 * told not to, and raw asterisks in a chat bubble look broken. The system
 * prompts now ask for plain text, so this is the safety net for what slips
 * through rather than a full markdown engine.
 *
 * Deliberately NOT react-markdown:
 *   - It pulls the remark/unified tree into the client bundle for a chat
 *     bubble that needs bold, bullets and paragraphs.
 *   - The output surface here is narrow and known.
 *
 * Everything is built as React elements — never `dangerouslySetInnerHTML`.
 * This text comes from a model that can be steered by user input, so HTML
 * injection is a real concern, not a theoretical one.
 */

import type { ReactNode } from 'react';

/** Split a line on `**bold**` and return React nodes. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Split keeps the delimiters' contents via the capture group.
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) =>
    // Odd indices are the captured (bolded) segments.
    i % 2 === 1
      ? <strong key={`${keyPrefix}-b${i}`} className="font-semibold">{part}</strong>
      : <span key={`${keyPrefix}-t${i}`}>{part}</span>,
  );
}

// The separator and the captured text must not both be able to match a space,
// or the two quantifiers can swap characters and backtrack polynomially. `.`
// matches spaces, so `\s+(.*)` is ambiguous — requiring the capture to start
// with a non-space (`\S`) makes each character's owner unambiguous.
//
// Worth the care: this runs over model output, which a user can steer with
// their own input, so a pathological line is reachable rather than theoretical.
// `\*(?!\*)` so a line that OPENS with bold ("**Blitz** does X") isn't read as
// a bullet — that swallowed the first asterisk and rendered "*Blitz** does X".
// Bold at the start of a line is common in exactly the output this parses.
const BULLET = /^[ \t]*(?:[-•]|\*(?!\*))[ \t]*(\S.*)$/;
const NUMBERED = /^[ \t]*(\d+)[.)][ \t]*(\S.*)$/;

export function FormattedMessage({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];

  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!listBuffer || listBuffer.items.length === 0) {
      listBuffer = null;
      return;
    }
    const { ordered, items } = listBuffer;
    const cls = 'ml-4 list-outside space-y-1';
    blocks.push(
      ordered
        ? (
            <ol key={key} className={`${cls} list-decimal`}>
              {items.map((item, i) => (
                <li key={`${key}-i${i}`}>{renderInline(item, `${key}-i${i}`)}</li>
              ))}
            </ol>
          )
        : (
            <ul key={key} className={`${cls} list-disc`}>
              {items.map((item, i) => (
                <li key={`${key}-i${i}`}>{renderInline(item, `${key}-i${i}`)}</li>
              ))}
            </ul>
          ),
    );
    listBuffer = null;
  };

  lines.forEach((line, idx) => {
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);

    if (bullet?.[1] !== undefined) {
      if (listBuffer && listBuffer.ordered) {
        flushList(`l${idx}`);
      }
      listBuffer = listBuffer ?? { ordered: false, items: [] };
      listBuffer.items.push(bullet[1]);
      return;
    }

    if (numbered?.[2] !== undefined) {
      if (listBuffer && !listBuffer.ordered) {
        flushList(`l${idx}`);
      }
      listBuffer = listBuffer ?? { ordered: true, items: [] };
      listBuffer.items.push(numbered[2]);
      return;
    }

    flushList(`l${idx}`);

    if (line.trim() === '') {
      return; // blank lines just separate blocks; spacing is handled by the wrapper
    }
    blocks.push(
      <p key={`p${idx}`}>{renderInline(line, `p${idx}`)}</p>,
    );
  });

  flushList('l-end');

  return <div className="space-y-2 leading-relaxed">{blocks}</div>;
}
