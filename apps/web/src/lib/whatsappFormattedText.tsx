/**
 * Renders WhatsApp-style inline bold (`*text*`) for compose / template previews.
 */

import type { ReactElement, ReactNode } from "react";

const WHATSAPP_BOLD_RE = /\*([^*\n]+)\*/g;

/**
 * Splits text into plain and bold segments for React rendering.
 */
export function renderWhatsAppFormattedText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(WHATSAPP_BOLD_RE.source, "g");
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }
    const boldBody = match[1];
    if (boldBody !== undefined && boldBody.length > 0) {
      nodes.push(
        <strong key={`wa-bold-${String(key)}`} className="font-semibold">
          {boldBody}
        </strong>,
      );
      key += 1;
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

type WhatsAppFormattedTextProps = {
  text: string;
  className?: string;
};

/**
 * Paragraph that shows WhatsApp bold markers as visual bold in the UI preview.
 */
export function WhatsAppFormattedText({
  text,
  className,
}: WhatsAppFormattedTextProps): ReactElement {
  return <p className={className}>{renderWhatsAppFormattedText(text)}</p>;
}
