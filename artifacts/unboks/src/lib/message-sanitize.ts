/**
 * Message content sanitizer for the Appointments → "View conversation"
 * decision-context pane.
 *
 * Operators in Appointments don't want to read raw email dumps. They
 * want the actual scheduling conversation: who proposed which slot,
 * who confirmed it, when the meeting is. Email noise (signatures,
 * quoted reply history, confidentiality disclaimers, mobile-client
 * footers) buries that signal and makes the pane feel like a forensic
 * tool instead of a decision aid.
 *
 * This module strips the noise heuristically. The heuristics are
 * conservative: we'd rather leave a noisy line in than chop off a real
 * sentence. Each rule targets a documented, common pattern.
 *
 * No em dashes in user-facing strings produced from this file (em
 * dashes inside this file's code-comment prose are fine).
 */

/**
 * Strip common email noise from a single message body.
 *
 * Rules applied, in order:
 *   1. Quoted reply history. The "On <date>, <name> wrote:" prefix and
 *      everything after it. Outlook and Gmail both produce this.
 *   2. Forwarded-message blocks ("---------- Forwarded message ---------"
 *      and similar) and everything after.
 *   3. ">"-quoted lines (consecutive blocks).
 *   4. Mobile-client footers ("Sent from my iPhone", "Sent from my
 *      Samsung Galaxy", "Get Outlook for iOS", etc.).
 *   5. Standard signature delimiter ("\n-- \n" or "\n--\n") and
 *      everything after.
 *   6. Confidentiality / legal disclaimers. Detected by a paragraph that
 *      contains any of: "confidential", "privileged", "intended
 *      recipient", "disclaimer", "notice:" near a tail block.
 *   7. Sign-off + signature block. Detected by a closing word ("Best
 *      regards", "Kind regards", "Regards", "Thanks", "Sincerely",
 *      "Cheers", "Best", "BR", "KR", "Mvh") on its own line followed
 *      by a short tail (typically name/title/company).
 *
 * Whitespace is normalised: 3+ consecutive newlines collapse to 2,
 * leading/trailing whitespace is trimmed.
 */
export function sanitizeMessageContent(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  let text = raw.replace(/\r\n/g, "\n");

  // 1. "On <date>... wrote:" reply prefix and everything after.
  text = text.replace(/\n?\s*On\s[\s\S]{1,400}?\swrote:[\s\S]*$/m, "");

  // 2. Forwarded-message blocks.
  text = text.replace(
    /\n?-{3,}\s*Forwarded message\s*-{3,}[\s\S]*$/i,
    "",
  );
  text = text.replace(/\n?Begin forwarded message:[\s\S]*$/i, "");

  // 3. > quoted lines (consecutive runs).
  text = text.replace(/(?:^[ \t]*>.*(?:\n|$))+/gm, "");

  // 4. Mobile-client footers. Match the line and anything trailing.
  text = text.replace(
    /\n?\s*(?:Sent from my [^\n]+|Get Outlook for (?:iOS|Android)|Sent via [^\n]+|Sent from (?:my )?(?:iPhone|iPad|Android|mobile|BlackBerry|Samsung[^\n]*)).*$/im,
    "",
  );

  // 5. Standard signature delimiter "-- " on its own line.
  text = text.replace(/\n--\s*\n[\s\S]*$/m, "");

  // 6. Confidentiality / legal disclaimers. We require both a tail
  //    location AND a strong keyword to avoid eating real content.
  text = text.replace(
    /\n{1,}[^\n]{0,400}\b(?:confidential|legally privileged|intended recipient(?:s)?|this (?:e?-?mail|message) (?:and (?:any|all))? ?(?:attachments?)? ?(?:is|are|may be) confidential|disclaimer|please notify the sender)\b[\s\S]*$/i,
    "",
  );

  // 7. Sign-off + signature block. We deliberately restrict this to
  //    email-style closings that essentially never appear in chat
  //    messages ("Best regards", "Kind regards", "Sincerely", etc.).
  //    Bare "Thanks", "Regards", "Cheers", "BR", "KR" are common in
  //    chat (e.g. "Thanks\nSee you tomorrow at 14:00") so we do NOT
  //    strip after them — false positives would chop real scheduling
  //    content. The closing sits on its own line (optional leading
  //    whitespace) and is followed by a short tail block.
  text = text.replace(
    /\n{1,2}[ \t]*(?:Best\s+regards|Kind\s+regards|Warm\s+regards|Sincerely|Yours\s+sincerely|Yours\s+truly|Mit\s+freundlichen\s+Gr(?:ü|u)ßen|Med\s+venlig\s+hilsen|Mvh)[,.!]?\s*\n[\s\S]{0,400}$/i,
    "",
  );

  // Final whitespace pass.
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/**
 * Convenience: strip noise AND collapse the result to a single line for
 * compact previews. Empty input returns "".
 */
export function sanitizeAndCompact(raw: string): string {
  const cleaned = sanitizeMessageContent(raw);
  return cleaned.replace(/\s+/g, " ").trim();
}
