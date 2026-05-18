# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Nr 2 mobile redesign — 2026 pass (Batch A)
- Polished Inbox header and Escalation list empty state with calm typography and staggered entrance.
- Upgraded EscalationReplyComposer with rounded surface, clear blue focus ring, and soft elevation.
- Refined EscalationReasonPanel into a premium decision-first surface aligned with new tokens.
- Polished AIEditorPanel toolbar and editor surface with careful focus and disabled states.

## Nr 2 mobile redesign — 2026 pass (Composer + Aux)
- Implemented `motion.button` across composer actions, refresh button, and modals for satisfying scale and opacity transitions.
- Applied spring-eased animations matching the 2026 motion grammar.
- Refined modal bottom-sheet layouts for mobile with rounded top corners and fixed positioning.
- Polished the `AIEditorPanel` and `ConversationTranslation` components for a cohesive, calm surface feel.

## Nr 2 mobile redesign — 2026 pass (Inbox.tsx)
- Implemented `framer-motion` for spring-eased animations (list staggers, button taps).
- Upgraded `MessageBubble` to use 2026 tokens (`bg-primary`, `text-primary-foreground`) and asymmetric shapes.
- Redesigned `ConversationDetailPane` header and `EscalationModeToggle` for mobile-first safe-area and hairline borders.
- Added bouncy pulse animation to the conversation thread loading state and a fresh, centered empty thread placeholder.
- Polished the `Inbox` filters and view toggles with updated tokens and backdrop blur.
- Styled Escalations empty state into a calm, centered "Inbox zero" or error state with generous whitespace.

## Nr 2 mobile redesign — 2026 pass (Aux components)
- Implemented `motion.button` and Framer Motion across aux components for satisfying spring-eased tap feedback.
- Applied responsive bottom-sheet layouts for modals with rounded top corners, mobile drag handles, and centered desktop positioning.
- Added animated entrances and exits for the translation features and UI detail panels.
- Polished component padding and border radii to match the 2026 quiet and tactile operator inbox feel.

## Nr 2 mobile redesign — 2026 pass (Settings.tsx)
- Polished Settings page layout with a horizontally scrollable, chip-style category navigation.
- Upgraded form cards and sections to iOS-style grouped lists with rounded corners, soft shadows, and clean hairline dividers.
- Implemented Framer Motion for spring-eased page entrances and satisfying button tap feedback (`scale: 0.97`, opacity dips).
- Refined typography hierarchy across headings, descriptions, and field labels to match the premium 2026 aesthetic.
- Enhanced the "Your Info" editable knowledge cards with clean states, improved spacing, and clear action buttons.
