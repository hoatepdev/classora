---

name: Classora
description: A modern operational workspace for Vietnamese training centers.

colors:
blue: "#2563EB"
blue-dark: "#1D4ED8"
blue-soft: "#EFF6FF"
green: "#15803D"
green-soft: "#DCFCE7"
workspace: "#F8FAFC"
white: "#ffffff"
slate-ink: "#0F172A"
slate-body: "#334155"
slate-muted: "#64748B"
rule: "#E2E8F0"
rule-light: "#F1F5F9"
error: "#B42318"

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

---

# Classora Design System

## Purpose

Classora is a Vietnamese-first operational SaaS workspace for training centers.

The interface should help center managers, staff, and teachers complete daily work quickly:

- manage students;
- manage teachers;
- organize courses and classes;
- handle schedules;
- record attendance;
- manage tuition and payments;
- understand today's operations.

Classora should feel like a modern SaaS product without becoming a generic analytics dashboard.

The product should be:

- clear;
- calm;
- compact;
- professional;
- operational;
- trustworthy;
- consistent.

Prefer usability and consistency over visual novelty.

---

# Design Principles

## Operational first

Classora is a working environment, not a marketing website.

Every screen should prioritize:

1. current task;
2. important business data;
3. primary action;
4. supporting actions;
5. secondary information.

Decoration should never compete with operational content.

## Consistency over uniqueness

Students, Teachers, Courses, Classes, Attendance, Payments, and other modules should feel like parts of the same product.

Do not invent a different page composition for every feature.

Reuse established:

- application shell;
- page headers;
- tables;
- forms;
- filters;
- status styles;
- spacing;
- buttons;
- feedback patterns.

## Product honesty

Only display information that is real and useful.

Do not add:

- fake analytics;
- fake charts;
- fake notifications;
- fake trends;
- fake counts;
- disabled future navigation;
- decorative statistics;
- placeholder SaaS features;

solely to make the interface appear richer.

## Simplicity

Prefer the smallest UI structure that clearly solves the current workflow.

Avoid UI architecture created for hypothetical future requirements.

---

# Visual Language

## Blue signals interaction

Blue is the primary Classora interaction color.

Use it primarily for:

- primary buttons;
- active navigation;
- focus emphasis;
- important links;
- brand accents.

Primary interaction colors:

```text
Blue       #2563EB
Blue Dark  #1D4ED8
Blue Soft  #EFF6FF
```

Use pale blue (`#EFF6FF`) for active navigation backgrounds and quiet informational tints.

## Green is semantic

Green represents active, successful, healthy, and positive operational state.

Use it for:

- active/positive status badges;
- success feedback;
- healthy operational state.

Semantic success colors:

```text
Green       #15803D
Green Soft  #DCFCE7
```

Do not use green as the default primary action color.

Avoid multiple competing high-emphasis colors on the same screen.

## Cool gray holds the workspace

Application background:

```text
#F8FAFC
```

Primary content surfaces:

```text
#ffffff
```

Use subtle borders to establish structure rather than heavy shadows.

## Neutral text

Use the existing slate hierarchy:

```text
Primary text     #0F172A
Body text        #334155
Muted text       #64748B

Border           #E2E8F0
Light border     #F1F5F9
```

Avoid pure black for ordinary application text.

---

# Typography

Use a system sans-serif stack that renders Vietnamese diacritics reliably.

Recommended CSS direction:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

If Inter is not already installed, do not add it solely for design consistency. Prefer the existing system stack.

## Type hierarchy

### Page title

```text
24px
font-weight: 600–700
```

### Section title

```text
16–18px
font-weight: 600
```

### Body

```text
14px
font-weight: 400
```

### Secondary text

```text
13–14px
```

### Form labels

```text
13–14px
font-weight: 500
```

Avoid oversized dashboard headings.

Classora should feel compact and operational rather than editorial.

---

# Spacing

Use the existing spacing scale as the default:

```text
8px
12px
16px
24px
32px
```

A `4px` gap may be used for tightly related micro-elements such as icon/text alignment.

Typical usage:

```text
8px   small internal gaps
12px  compact component gaps
16px  standard component padding
24px  sections and page padding
32px  major page separation
```

Avoid arbitrary spacing values unless the layout genuinely requires them.

---

# Radius

Classora uses restrained rounded corners.

```text
Small       8px
Medium     10px
Large      12px
```

Use these for:

- inputs;
- buttons;
- menus;
- panels;
- dialogs;
- cards.

Status badges may use pill-shaped geometry.

Do not use large rounded containers as a default visual style.

---

# Application Shell

All authenticated operational pages should use one consistent application shell.

```text
+-------------------------------------------------------------+
| Sidebar            | Topbar                                |
|                    +---------------------------------------+
| Classora            | Page / context              Account  |
| Center name         +---------------------------------------+
|                    |                                       |
| Dashboard          | Main workspace                        |
| Students           |                                       |
| Teachers           |                                       |
| Courses            |                                       |
| Classes            |                                       |
| Attendance         |                                       |
| Payments           |                                       |
|                    |                                       |
| Reports            |                                       |
| Settings           |                                       |
+-------------------------------------------------------------+
```

---

# Sidebar

Desktop width should remain approximately:

```text
200–220px
```

The sidebar should:

- use a white or near-white surface with a subtle right border;
- display Classora identity;
- make the current training center visible;
- use Lucide line icons;
- keep text labels visible on normal desktop widths;
- provide a clear active navigation state with a pale blue background and blue text and icon;
- remain visually compact;
- become a drawer on narrow screens.

Navigation represents business tasks, not technical architecture.

Preferred navigation:

```text
Dashboard

Students
Teachers
Courses
Classes
Attendance
Payments

Reports

Settings
```

Only display modules that actually exist.

Do not add future navigation items solely to make Classora appear more complete.

---

# Tenant Context

Users should always understand which training center they are operating in.

Example:

```text
Classora

Bright English Center
```

Do not expose:

- tenant database names;
- tenant IDs;
- infrastructure identifiers;
- database hosts;
- internal tenant metadata.

Only introduce a tenant switcher if users genuinely need to operate multiple centers.

---

# Topbar

Use a restrained white topbar.

It may contain:

- page context;
- breadcrumbs when useful;
- account menu;
- genuinely useful global actions.

Use a subtle lower border or surface separation.

The topbar should not become a second primary navigation system.

Avoid:

- large hero headers;
- marketing banners;
- decorative search fields;
- fake notification controls.

---

# Main Workspace

Use the cool gray workspace background (`#F8FAFC`).

Recommended desktop padding:

```text
24px
```

Large layouts may use:

```text
32px
```

Operational pages should use available horizontal space.

Do not constrain CRUD tables inside narrow marketing-style containers.

---

# Page Hierarchy

Most operational pages should use:

```text
Page title                         Primary action
Short operational description

Search / filters when needed

Primary content
```

Visual priority:

1. page context;
2. primary operation;
3. filtering/search workflow;
4. business data;
5. supporting information.

Do not create a unique visual hierarchy for every domain.

---

# Page Header

A standard page header contains:

- title;
- short description when useful;
- one main action.

Example:

```text
Students                                      Add student
Manage students in this center.
```

Avoid:

- oversized headers;
- multiple primary buttons;
- excessive explanatory text;
- decorative badges around the page title.

---

# Buttons

Use a clear action hierarchy.

## Primary button

Use Blue for the primary operation.

Examples:

```text
Add student
Create class
Save changes
Record payment
```

There should normally be one visually dominant action within an action group.

## Secondary button

Use neutral or outline treatment for supporting actions.

Examples:

```text
Cancel
Export
View history
```

## Ghost button

Use for low-priority actions, toolbars, and row controls.

## Destructive button

Use danger styling only for genuinely destructive operations.

Examples:

```text
Delete
Remove
Void payment
```

Recommended button height:

```text
36–40px
```

Button text should describe the operation.

Prefer:

```text
Add student
```

over:

```text
Add
```

Do not use gradients.

---

# Inputs

Recommended control height:

```text
38–40px
```

Use:

```text
Label
Input
Helper or error message
```

Placeholders are not replacements for labels.

Focus states should be visually clear.

Validation errors should appear close to the relevant field.

Use native browser controls when they adequately solve the problem, including date and time inputs.

---

# Forms

Prefer simple vertical forms.

Typical readable form width:

```text
640–760px
```

Group fields only when they share meaning.

Example:

```text
Student information

Code
Full name

Phone
Email

Status
Notes

Cancel                         Save changes
```

Use multiple columns only where fields naturally belong together.

Do not:

- split simple forms into unnecessary cards;
- create multi-step wizards for ordinary CRUD;
- place complex entity editing inside small dialogs.

Use a normal page for complex create/edit workflows.

---

# Tables

Tables are a primary Classora UI pattern.

Use them for operational datasets such as:

- Students;
- Teachers;
- Courses;
- Classes;
- Attendance;
- Payments.

Desktop table characteristics:

- white surface;
- subtle outer border;
- subtle row separators;
- no heavy vertical lines;
- readable compact rows;
- hover feedback;
- semantic HTML.

Recommended row height:

```text
44–52px
```

Example structure:

```text
Name | Code | Contact | Status | Updated | Actions
```

Avoid placing many icon buttons directly inside every row.

When multiple secondary actions exist, use an overflow menu:

```text
•••
```

Do not convert tables into cards on desktop merely for decoration.

---

# Search and Filters

Only add search and filters when they solve a real workflow.

Typical list toolbar:

```text
[ Search...                         ] [ Status ] [ More filters ]
```

Do not expose every possible filter permanently.

Use progressive disclosure for advanced filters.

Do not add search solely because modern SaaS products commonly have search fields.

---

# Status Badges

Use quiet semantic badge styles.

Examples:

```text
ACTIVE
DISABLED
PAID
PENDING
OVERDUE
```

Status color should reinforce meaning but never be the only way the state is communicated.

Status badges may be pill-shaped.

Do not use pill styling for ordinary navigation or containers.

---

# Cards and Panels

Use cards only when they create meaningful grouping.

Recommended treatment:

```text
white background
1px subtle border
8–12px radius
little or no shadow
```

Do not wrap every piece of information inside a card.

Prefer natural page sections when a card provides no additional meaning.

---

# List Pages

Default structure:

```text
Page header

Optional factual context

Search / filters when justified

Primary table / list

Pagination when genuinely required
```

Example:

```text
Students                                      Add student
Manage students in this center.

Search students...           Status

------------------------------------------------------------
Name            Code          Phone          Status
------------------------------------------------------------
Nguyen Van A    STU001        09...          Active
------------------------------------------------------------
```

Do not introduce pagination before the data volume or API requires it.

---

# Create and Edit Pages

Use:

```text
Back navigation

Page title
Optional description

Form

Cancel                         Primary action
```

Example:

```text
← Students

Add student

Student information

[ form ]

Cancel                         Create student
```

Keep the primary action easy to discover.

Do not turn ordinary CRUD into wizard workflows.

---

# Detail Pages

Use:

```text
Back navigation

Entity title                       Primary actions
Identity / status

Primary information

Related operational sections
```

Example:

```text
← Students

Nguyen Van A                       Edit
STU-001 · Active

Student information

Phone
Email
Date of birth
Enrollment date

Classes

Attendance

Payments
```

Group related information into sections.

Avoid creating one card for every field.

---

# Dialogs

Use dialogs for:

- confirmations;
- small focused forms;
- short actions.

Do not place complex CRUD pages in dialogs.

Destructive dialogs should clearly identify what is affected.

Example:

```text
Disable Nguyen Van A?

The student will no longer be available for new enrollments.

Cancel                         Disable
```

---

# Empty States

An empty state should answer:

1. what is empty;
2. why it matters when useful;
3. what the user can do next.

Example:

```text
No students yet

Students added to this center will appear here.

Add student
```

Avoid decorative illustrations unless they materially improve understanding.

---

# Loading States

Every asynchronous workflow should consider:

```text
loading
success
error
empty
disabled
```

For initial table/page loading, prefer skeletons.

For form submission, use loading feedback inside the primary button.

Avoid full-screen spinners for ordinary CRUD requests.

---

# Success Feedback

Use subtle toast feedback for completed actions.

Example:

```text
Student created successfully.
```

Do not block users with success dialogs for routine operations.

---

# Error Feedback

Errors should explain what happened in language meaningful to the user.

Do not expose:

- stack traces;
- database errors;
- raw backend exceptions;
- infrastructure details.

Validation errors belong next to their relevant field whenever possible.

---

# Dashboard

The dashboard should help staff understand today's operation.

Potential useful information includes:

- today's classes;
- attendance that needs action;
- upcoming sessions;
- outstanding operational tasks;
- genuinely useful payment information.

Only show metrics supported by actual product data.

Do not add charts merely to fill space.

Do not create vanity analytics.

The dashboard should answer:

```text
What needs attention today?
```

not:

```text
How can this page look more impressive?
```

---

# Icons

Use Lucide icons consistently.

Recommended size:

```text
16–20px
```

Icons should support text rather than replace important labels.

Avoid mixing:

- filled icons;
- line icons;
- unrelated icon libraries.

Icon-only controls must have accessible names.

---

# Responsive Design

Classora is desktop-first because it is an operational workspace.

## Desktop

```text
>= 1200px
```

Use:

- full sidebar;
- normal tables;
- standard workspace spacing.

## Tablet

```text
768px – 1199px
```

Navigation may collapse.

Tables may use controlled horizontal scrolling.

## Mobile

```text
< 768px
```

Use an accessible navigation drawer.

Simplify layouts only where required for usability.

Tables may become:

- horizontal scroll;
- reduced-column views;
- structured record blocks when a table becomes genuinely unusable.

Do not create a completely separate mobile product without real usage evidence.

---

# Accessibility

Classora should aim for practical WCAG 2.1 AA compliance.

Minimum expectations:

- keyboard-accessible controls;
- visible focus styles;
- semantic HTML;
- proper form labels;
- adequate contrast;
- status not communicated by color alone;
- accessible dialogs;
- correct table semantics;
- meaningful button labels;
- `aria-label` where icon-only controls are necessary.

Respect:

```text
prefers-reduced-motion
```

for non-essential motion.

---

# Motion

Motion is functional, not decorative.

Appropriate examples:

- dialog opening;
- navigation drawer transition;
- dropdown appearance;
- toast feedback;
- subtle hover transitions.

Recommended duration:

```text
120–200ms
```

Avoid:

- page entrance choreography;
- bouncing controls;
- animated gradients;
- decorative background motion;
- complex animation libraries for ordinary UI states.

---

# Component Strategy

Prefer existing shadcn/ui primitives.

Common Classora patterns may include:

```text
App shell
Sidebar
Topbar
Page header
Button
Input
Select
Badge
Table
Dialog
Dropdown menu
Tabs
Toast
Empty state
Skeleton
```

Domain components may then build on those primitives.

Examples:

```text
StudentsTable
StudentForm
StudentStatusBadge
```

Do not create wrappers such as:

```text
AppButton
BaseButton
CustomButton
```

when they only proxy an existing shadcn component.

---

# Design Tokens

The values in this document define visual intent.

Actual implementation tokens should live in the existing styling system, primarily:

```text
apps/web/src/index.css
```

Do not scatter raw colors throughout feature components when an existing semantic token covers the requirement.

Prefer semantic usage over visual-name usage inside components.

For example, a component should conceptually depend on:

```text
primary
background
border
muted
danger
```

rather than inventing arbitrary colors for each page.

Do not introduce a separate theme system unless Classora has a concrete requirement for one.

---

# Anti-Overengineering

Classora intentionally avoids UI architecture bloat.

Do not:

- build a generic page builder;
- build a dashboard widget plugin system;
- introduce schema-driven forms without a real requirement;
- create a custom theme engine during MVP;
- add another component library;
- build highly configurable components for hypothetical future use;
- create abstractions after their first use solely for possible reuse;
- introduce animation libraries for basic transitions;
- add design tokens for one-off values before repeated need exists;
- build universal table abstractions that make simple tables difficult to understand;
- refactor unrelated screens during a focused feature task.

Prefer:

```text
small
explicit
local
consistent
predictable
```

A straightforward implementation is better than a flexible framework Classora does not yet need.

---

# Product Honesty

Never fabricate interface content for visual richness.

Do not invent:

- customers;
- activity;
- revenue;
- statistics;
- attendance percentages;
- payment totals;
- notifications;
- unread counts;
- charts;
- trend percentages;
- plan information;
- billing details.

If real data does not exist, use an honest empty state.

---

# Vietnamese-First UX

Classora MVP is Vietnamese-first.

UI implementation must work well with Vietnamese:

- sufficient line height for diacritics;
- no text clipping;
- natural Vietnamese labels;
- adequate control width;
- predictable date/time presentation.

Avoid English terminology when an established Vietnamese product term exists, unless the current product intentionally uses English for that concept.

Implementation identifiers and code remain in English.

---

# Multi-Tenant UX

Tenant isolation is primarily a backend security concern, but the interface should reinforce tenant context.

The current training center should be visible in the application shell.

Users should never be asked to manually enter:

- tenant ID;
- tenant database;
- database connection;
- hostname;
- internal tenant code;

as part of ordinary business workflows.

Do not expose infrastructure concepts in business UI.

---

# Design Review Checklist

Before accepting a meaningful frontend change, verify:

- Does the screen still look like Classora?
- Does it use the established application shell?
- Is tenant context clear where necessary?
- Is there one obvious primary operation?
- Is page hierarchy clear?
- Are spacing values consistent?
- Are existing colors and radii reused?
- Are existing shadcn primitives reused?
- Are tables readable and appropriately dense?
- Are forms simple and understandable?
- Are loading states handled?
- Are empty states handled?
- Are validation and errors handled?
- Is the screen keyboard accessible?
- Does it work at normal laptop widths?
- Does the UI expose implementation details?
- Is any displayed information fabricated?
- Is a new abstraction genuinely necessary?
- Did the implementation avoid unrelated redesign?

If several answers are negative, revise the screen before expanding the feature.

---

# AI Implementation Rules

When an AI coding assistant modifies Classora UI:

1. Read `apps/web/PRODUCT.md`.
2. Read this `apps/web/DESIGN.md`.
3. Read `.claude/rules/frontend.md`.
4. Inspect the existing implementation before editing.
5. Reuse existing Classora and shadcn patterns.
6. Make the smallest coherent change.
7. Do not redesign unrelated screens.
8. Do not introduce a competing design system.
9. Do not invent new colors, radii, or spacing scales without a concrete need.
10. Do not fabricate product data for presentation.
11. Preserve accessibility and responsive behavior.
12. Include relevant loading, error, validation, and empty states.
13. Prefer direct feature code over configuration-heavy abstractions.
14. Validate the resulting UI against this document before considering the work complete.

When an approved mockup conflicts with the existing implementation, translate the mockup into the established Classora visual language rather than creating an isolated one-off style.

---

# Source of Truth

For frontend product design decisions, use this priority:

```text
Explicit current product requirement
        ↓
Approved Classora mockup
        ↓
apps/web/PRODUCT.md
        ↓
apps/web/DESIGN.md
        ↓
Existing implementation
```

Architecture, security, tenant-isolation, and accessibility constraints still take precedence when applicable.

If a visual rule becomes repeated across multiple screens, update this document rather than allowing screens to diverge.

---

# Summary

Classora should feel:

```text
Modern SaaS
Operational
Compact
Clean
Structured
Vietnamese-first
Data-oriented
Consistent
Accessible
Calm
Trustworthy
```

The objective is not to make every screen unique.

The objective is to make Classora feel like one coherent product that training center staff can understand quickly and use every day.
