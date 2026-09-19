---
paths:
  - "apps/web/**"
---

# Frontend

Stack:

- React
- Vite
- TypeScript
- shadcn/ui
- TanStack Query
- Zustand

## Components

Do not split components based on line count.

Extract only when:

- reused,
- independently meaningful,
- or the parent has become genuinely difficult to understand.

A clear 150-line component is preferable to five meaningless wrapper components.

## State

Use TanStack Query for server state.

Use Zustand only for genuine client/application state.

Do not copy query data into Zustand.

Prefer local React state before introducing global state.

## UI

Prefer existing shadcn/ui primitives before creating custom primitives.

Before meaningful UI implementation, read:

- `apps/web/PRODUCT.md`
- `apps/web/DESIGN.md`

Follow `apps/web/DESIGN.md` for visual language, layout, spacing,
density, responsive behavior, and interaction patterns.

Reuse the existing Classora visual language and shadcn/ui primitives.

Do not create a parallel design system.
Do not introduce new colors, spacing scales, radii, or component styles
when an existing Classora pattern already covers the requirement.

Do not create wrappers such as:

- AppButton
- BaseButton
- CustomButton

when they merely forward props to an existing component.

Use Impeccable for significant design, redesign, audit or polish tasks.

Do not invoke Impeccable for trivial spacing or text changes.
