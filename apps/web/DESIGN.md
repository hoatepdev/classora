---
name: Classora
description: A modern operational workspace for Vietnamese training centers.
colors:
  indigo-ink: "#242261"
  indigo-deep: "#201f5b"
  jade: "#147f5f"
  jade-dark: "#116e54"
  jade-soft: "#dcf5eb"
  mineral-white: "#f4f6f8"
  white: "#ffffff"
  slate-ink: "#182139"
  slate-body: "#344056"
  slate-muted: "#667085"
  rule: "#d9dee7"
  rule-light: "#e9ecf1"
  error: "#b42318"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
---

# Design System: Classora

## The Operational Workspace

Classora is a Vietnamese-first workspace for running a training center’s day. It should feel like a current SaaS product without becoming a generic analytics dashboard: compact navigation, clear operational hierarchy, dense readable data, and honest states backed by real center activity.

## Visual language

- **Indigo provides structure.** Use it for the application frame, navigation, links, and focus emphasis.
- **Jade signals action.** Reserve it for primary operations and positive or active states.
- **Mineral white holds the workspace.** Content uses white operational surfaces with subtle slate borders and only light, soft shadow where it clarifies hierarchy.
- **Typography is Vietnamese-first.** Use the system sans stack with fixed, compact UI sizes, clear weight contrast, and comfortable diacritic rendering.
- **Corners are practical.** Controls and surfaces use approximately 8–12px radii; status labels may remain pill-shaped.
- **Semantic color stays restrained.** Success, warning, danger, information, and inactive states use quiet tints with accessible text contrast.

## Composition

The authenticated application uses a compact indigo sidebar, a restrained white topbar, and a flexible content workspace. Tenant identity is always visible. Desktop layouts prioritize operational scanning; tablet and mobile collapse navigation into an accessible drawer without changing the task model.

Pages use a consistent hierarchy:

1. title, concise operational description, and real actions;
2. optional factual context such as an actual record count;
3. primary table, form, or detail surface;
4. related operational sections in reading order.

Tables stay semantic and dense on desktop, then become readable record blocks or controlled horizontal surfaces on narrow screens. Forms use meaningful visual sections, never wizards unless the workflow truly requires one. Detail pages group related facts instead of presenting an undifferentiated field list.

## Interaction and accessibility

- Use Lucide icons with consistent stroke weight.
- All controls need visible hover, focus, disabled, loading, error, and empty states where applicable.
- Keep keyboard focus conspicuous and preserve native labels, table semantics, dialog focus management, and error relationships.
- Motion communicates state only, remains brief, and respects `prefers-reduced-motion`.
- Use native browser controls when they solve the task, including date and time inputs.

## Product honesty

SaaS surfaces and dashboard components must support real center operations. Do not add cards, statistics, charts, metrics, search, notifications, billing details, plans, or controls solely to make the interface appear richer.

Do not use gradients, glassmorphism, oversized cards, heavy shadows, decorative animation, fake data, disabled future navigation, or alternate component libraries. Prefer existing shadcn primitives and direct feature code over wrapper layers or configuration-heavy UI systems.
