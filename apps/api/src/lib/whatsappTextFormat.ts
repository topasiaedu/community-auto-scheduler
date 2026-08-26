/**
 * Normalizes outbound message text for WhatsApp clients.
 * WhatsApp bold uses single asterisks (`*text*`); Markdown `**text**` is left literal otherwise.
 */

/**
 * Converts Markdown bold markers to WhatsApp bold markers.
 * Existing WhatsApp `*text*` markers are left unchanged.
 */
export function normalizeWhatsAppText(text: string): string {
  return text.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
}
