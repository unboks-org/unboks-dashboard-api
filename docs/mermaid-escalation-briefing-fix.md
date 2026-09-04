# Mermaid conversation briefing correction

## Cause

The conversation API returns `escalationSummary` as an object containing `reason`, `customerWants`, `operatorNeedsToDecide`, `latestCustomerMessage`, options and extracted details. The shared frontend parser only accepted a string, silently discarding the explanation. Meanwhile a retained `proposedTimes: ["sunday"]` activated the generic meeting heuristic. This generated the unrelated meeting copy in the user's screenshot.

Read-only production verification confirmed HTTP 200 with Mermaid tenant identity and all four structured briefing fields populated. The current case remains pending and soft; no guest messages or operator mutations were sent for verification.

## Correction

- Preserve the structured briefing at the API boundary, retaining compatibility with legacy string summaries and top-level fields.
- Mermaid's conversation reason panel does not use the general meeting/activation heuristics. Show the recorded reason, guest request and crew decision, with the triggering guest message separately from later follow-ups.
- Use the matching canonical escalation as a fallback while conversation detail loads. If no reason exists, report that honestly; do not turn weekdays or pickup times into an invented meeting.
- Mermaid-only interface copy: Crew decision needed, Why TRACY needs the crew, Guest request, Guidance for TRACY, Send to TRACY, Reply to guest. Replace the arbitrary Sunday/08:00/phone-number placeholder with instructions about confirmed Mermaid arrangements, assistance and limitations. Do not rewrite backend or guest content through the static-copy formatter.
- Avoid repeating the full reason in Mermaid's mobile header above the decision panel.
- Also normalize `WhatsApp` display casing at the attention action boundary; it must not disable the existing WhatsApp reply controls. Other channels and other tenants retain their existing behavior.

## Verification

- Automated API-to-panel regression reproduces structured boarding-assistance data, a Sunday trip hint and a later "are you there?" message. The real reason remains visible with no fabricated meeting or slot text.
- Tests cover missing/malformed and legacy summaries, top-level precedence, safe text rendering, Mermaid composer wording, other tenants' existing copy, and title-case WhatsApp actions.
- Full frontend suite: 228 tests across 40 files passed; TypeScript passed. Production build and public release fingerprints are checked before handoff.
- No backend deployment, config edits, agent control changes, booking changes or real customer sends form part of this release.
