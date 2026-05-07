// ---------------------------------------------------------------------------
// Email body parser
// ---------------------------------------------------------------------------
//
// Email bodies arriving from the backend often look like one giant flat blob
// because newlines were stripped, signatures were concatenated, and a long
// legal disclaimer was tacked on at the end. The Inbox detail pane was
// rendering this raw string verbatim, which read as a "word dump".
//
// This module splits a raw email body into three readable pieces so the
// detail UI can present them with proper hierarchy:
//
//   - body:       the actual message the sender wrote
//   - signature:  the sign-off / contact card (muted, secondary)
//   - disclaimer: the confidentiality / legal footer (collapsed by default)
//
// Parsing is best-effort and conservative. If we can't confidently detect a
// boundary we leave the text in `body` so we never lose content. The renderer
// always falls back to whitespace-preserving prose.

export interface ParsedEmail {
  body: string;
  signature: string | null;
  disclaimer: string | null;
}

// Phrases that almost always indicate the start of a confidentiality /
// disclaimer footer. Matched case-insensitively against the FULL string
// (not just line starts) because the source text may have lost its
// newlines in transit.
const DISCLAIMER_MARKERS: RegExp[] = [
  /confidentiality\s+warning\s*:/i,
  /confidentiality\s+notice\s*:?/i,
  /this\s+(?:e-?mail|message)(?:\s+and\s+any\s+attachments)?\s+(?:is|are|may\s+be)/i,
  /this\s+message\s+and\s+any\s+attachments/i,
  /if\s+you\s+(?:are\s+)?not\s+the\s+intended\s+recipient/i,
  /^\s*disclaimer\s*:/im,
  /written\s+with\s+chat\s*gpt/i,
];

// Phrases / separators that indicate the start of a signature. Same idea —
// matched against the FULL string so we catch line-leading "Kind regards,"
// in collapsed-newline payloads. The inline " -- " case is handled
// separately by `findInlineDashSeparator` so we can require a real
// signature-shaped tail and avoid false-splitting prose like
// "I'm out Tuesday -- Friday next week."
const SIGNATURE_MARKERS: RegExp[] = [
  // Classic email "-- " sig delimiter (with or without surrounding newlines).
  /(?:^|\n)\s*--\s*(?:\n|$)/,
  // Common sign-off openers, case-insensitive, multiple languages.
  /(?:^|\n|\s)(kind\s+regards|best\s+regards|warm\s+regards|kind\s+wishes|best\s+wishes|met\s+vriendelijke\s+groet|mit\s+freundlichen\s+gr(?:u|ü)ssen|saludos\s+cordiales|cordialement|atenciosamente)\b/i,
  // Short standalone sign-offs followed by a name. We require a comma OR
  // newline to keep this from matching prose like "best decision ever".
  /(?:^|\n)\s*(regards|cheers|thanks|thank\s+you|sincerely|best)\s*[,\.]?\s*(?:\n|$)/i,
];

// Heuristics that indicate the text after a candidate " -- " separator is a
// real signature/contact card and not just prose with em-dash-like punctuation.
const SIGNATURE_TAIL_SIGNALS = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/,                                    // email address
  /\*[^*\n]+\*/,                                                  // markdown bold (sig name)
  /\+?\d[\d\s().-]{6,}/,                                          // phone-like digits
  /\b(co-?founder|founder|ceo|cto|cfo|coo|cmo|vp|president|chief|director|manager|head\s+of|partner|engineer|consultant|attorney|advisor|owner|principal)\b/i,
  /\b(sent\s+from\s+my\s+(iphone|android|mobile))\b/i,
];

function findInlineDashSeparator(text: string): number {
  // Scan every " -- " (or "-- " at line start with leading whitespace) and
  // return the first whose tail (next ~250 chars) matches at least one
  // signature-shaped signal. Returns -1 if none qualify.
  const re = /\s--\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 250);
    if (SIGNATURE_TAIL_SIGNALS.some((sig) => sig.test(tail))) return m.index;
  }
  return -1;
}

function indexOfFirstMatch(text: string, patterns: RegExp[]): number {
  let lowest = -1;
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m.index >= 0) {
      // For markers that can match a leading separator (newline / whitespace),
      // we want to split AT the separator so the marker text stays inside the
      // extracted segment. The regexes above start with the separator as the
      // first char of the match in those cases — so m.index is already correct.
      if (lowest === -1 || m.index < lowest) lowest = m.index;
    }
  }
  return lowest;
}

function findSignatureStart(text: string): number {
  // Combine the regex-based markers with the qualified inline-dash heuristic
  // and return the earliest. Kept separate from the disclaimer scan so the
  // inline " -- " never bleeds into disclaimer detection.
  const regexIdx = indexOfFirstMatch(text, SIGNATURE_MARKERS);
  const inlineIdx = findInlineDashSeparator(text);
  if (regexIdx === -1) return inlineIdx;
  if (inlineIdx === -1) return regexIdx;
  return Math.min(regexIdx, inlineIdx);
}

function clean(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Collapse 3+ consecutive blank lines to a single blank line.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip a leading separator (whitespace + "--" + whitespace, or just
 * whitespace) from the start of a signature segment so the rendered card
 * doesn't show "-- " as the first line.
 */
function trimSignatureSeparator(s: string): string {
  return s.replace(/^\s*--\s*\n?/, "").trim();
}

export function parseEmail(raw: string | null | undefined): ParsedEmail {
  const text = clean(raw ?? "");
  if (!text) return { body: "", signature: null, disclaimer: null };

  // 1. Disclaimer split first — it's the most reliable boundary, and it
  //    must take precedence so we don't accidentally pull a "Regards"
  //    inside the legal text out as a signature.
  const discIdx = indexOfFirstMatch(text, DISCLAIMER_MARKERS);
  const before = discIdx >= 0 ? text.slice(0, discIdx) : text;
  const disclaimer = discIdx >= 0 ? text.slice(discIdx).trim() : null;

  // 2. Signature split inside whatever's left.
  const sigIdx = findSignatureStart(before);
  // Guardrail: refuse to split the signature off if there's basically no
  // body left in front of it. Otherwise a one-line "Thanks, Calvin" email
  // would render with an empty body and a "signature" containing the whole
  // message.
  const body = (sigIdx > 20 ? before.slice(0, sigIdx) : before).trim();
  const signatureRaw = sigIdx > 20 ? before.slice(sigIdx) : "";
  const signature = signatureRaw ? trimSignatureSeparator(signatureRaw) : null;

  return {
    body,
    signature: signature && signature.length > 0 ? signature : null,
    disclaimer,
  };
}

// ---------------------------------------------------------------------------
// Inline markdown-ish cleanup
// ---------------------------------------------------------------------------
//
// The source text often contains Markdown-style emphasis like `*Calvin
// Adamus*` or `*Email:*`. Rendering the raw asterisks looks broken. We do
// the smallest safe transform: split on single-asterisk pairs and emit
// alternating plain / bold tokens. We intentionally do NOT support `**bold**`
// or `_italic_` etc. — keeping the surface tiny means there's no escaping or
// HTML-injection risk.

export type InlineToken = { kind: "text" | "bold"; value: string };

export function tokenizeInline(text: string): InlineToken[] {
  if (!text) return [];
  const out: InlineToken[] = [];
  // Match *...* where the content has no asterisks or newlines. This avoids
  // greedy multi-line spans and accidental matches across paragraphs.
  const re = /\*([^*\n]+)\*/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push({ kind: "text", value: text.slice(lastIndex, m.index) });
    }
    out.push({ kind: "bold", value: m[1] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    out.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return out;
}
