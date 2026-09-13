---
name: Classora
description: A precise working register for Vietnamese training-center operations.
colors:
  indigo-ink: "#242261"
  indigo-deep: "#15183b"
  jade: "#168866"
  jade-dark: "#116e54"
  jade-soft: "#dcf5eb"
  mineral-white: "#f4f6f8"
  panel-white: "#f8f9fb"
  white: "#ffffff"
  slate-ink: "#182139"
  slate-body: "#344056"
  slate-muted: "#667085"
  slate-light: "#8a93a5"
  rule: "#cbd1d9"
  rule-light: "#e2e5ea"
  header-fill: "#eef1f5"
  indigo-action: "#3730a3"
  error: "#b42318"
  error-panel: "#fff5f4"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "clamp(42px, 6vw, 76px)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-.035em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "clamp(30px, 3vw, 42px)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-.035em"
  title:
    fontFamily: "ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-.025em"
  body:
    fontFamily: "ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: "ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 750
    letterSpacing: ".025em"
rounded:
  sm: "7px"
  md: "8px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.jade}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "0 17px"
    height: "42px"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "#28324a"
    rounded: "{rounded.md}"
    padding: "0 17px"
    height: "42px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
    height: "44px"
---

# Design System: Classora

## Overview

**Creative North Star: "The Ruled Operations Register"**

Classora presents a cool mineral-white workspace with deep indigo ink and a single jade operational accent. It is compact, direct, and workmanlike: the roster is the product surface, while thin rules, clear labels, and exact Vietnamese status language provide structure instead of decorative SaaS chrome.

The Login and Student-management surfaces use scale and alignment for hierarchy. Forms read as carefully ruled enrollment sheets; the register stays flat and wide on desktop and becomes a set of bordered record blocks on narrow screens. Motion is limited to a brief content settle and respects reduced-motion preferences.

**Key Characteristics:**
- Cool mineral-white workspace and deep indigo anchors
- Jade reserved for operational actions and active status
- Ruled, flat information surfaces with compact density
- Native system workhorse sans with strong weight contrast

## Colors

The palette is cool, restrained, and functional: indigo establishes trust and navigation, jade marks an available operation, and slate neutrals carry the register's information hierarchy.

### Primary
- **Deep Indigo Ink** (`#242261`): Login context and the authenticated topbar.
- **Operational Jade** (`#168866`): Primary actions such as adding, saving, and submitting.
- **Action Indigo** (`#3730a3`): Selection and input-focus emphasis.

### Neutral
- **Mineral White** (`#f4f6f8`): Application workspace background.
- **Panel White** (`#f8f9fb`): Login form panel background.
- **Paper White** (`#ffffff`): Register, form, and input surfaces.
- **Slate Ink** (`#182139`): Root text and entered input text.
- **Slate Body** (`#344056`): Table values and field labels.
- **Slate Muted** (`#667085`): Supporting copy and quiet states.
- **Slate Light** (`#8a93a5`): Missing-value markers.
- **Slate Rules** (`#cbd1d9`, `#e2e5ea`): Container and row dividers.
- **Header Fill** (`#eef1f5`): Table header background.
- **Soft Jade** (`#dcf5eb`): Active status chip background.
- **Error Red** (`#b42318`): Validation and error copy.
- **Error Wash** (`#fff5f4`): Form-level error background.

### Named Rules
**The One Accent Rule.** Jade is the operational signal: use it for primary actions and active status, not as decoration across the screen.

## Typography

**Display Font:** Native system sans (`ui-sans-serif`, `system-ui`, `Segoe UI`, `sans-serif`)
**Body Font:** Native system sans (`ui-sans-serif`, `system-ui`, `Segoe UI`, `sans-serif`)

**Character:** A compact workhorse sans that supports Vietnamese-first operational reading. Bold, tightly tracked headings contrast with quieter supporting text and dense table labels.

### Hierarchy
- **Display** (800, `clamp(42px, 6vw, 76px)`, 1.05): Login statement on the indigo context panel.
- **Headline** (800, `clamp(30px, 3vw, 42px)`, 1.05): Page headings such as “Học viên” and form titles.
- **Title** (800, `30px`, approximately 1.2): Login form heading.
- **Body** (400, `15px`, 1.6): Supporting copy and general interface text.
- **Label** (750, `12px`, `.025em`, uppercase): Table headers; field labels use 13px/750 without uppercase.

### Named Rules
**The Scale-First Rule.** Establish hierarchy through size, weight, and indigo ink; do not add ornamental display treatments.

## Layout

The authenticated shell uses a 64px indigo topbar with a 3px jade bottom rule. Content is centered to a 1440px maximum with 32px horizontal padding and 42px top padding; the page heading uses a 28px bottom gap. Forms cap at 780px while the register remains wide and scrollable.

At 720px and below, page padding becomes 30px 18px 48px, headings stack, and the two-column form becomes one column. The login becomes a single-column composition with a 210px minimum context band. Register table rows become white bordered record blocks, with visually hidden table headers and 112px label columns.

## Elevation & Depth

The system is flat at rest and does not use box shadows. Depth comes from mineral-white versus white tonal layering, 1–2px slate/indigo rules, and restrained hover or focus changes. The only motion vocabulary observed is a 0.24s content settle and 0.15s button transition, both reduced under `prefers-reduced-motion`.

### Named Rules
**The Flat Register Rule.** Let rules, tonal surfaces, and density define structure; do not lift ordinary data into floating cards.

## Shapes

Inputs and controls use square-to-soft corners (7px inputs, 8px buttons). Statuses are the exception: quiet tinted labels are fully pill-shaped. Register and form surfaces are bounded by horizontal rules rather than rounded outer cards. Focus uses a 3px outline with a 2px offset on keyboard-visible elements and a 3px indigo ring on focused inputs.

## Components

### Buttons
- **Shape:** Soft operational corners (8px); minimum height 42px.
- **Primary:** Jade background, white text, 17px horizontal padding, 700 weight.
- **Hover / Focus:** Primary darkens to `#116e54`; active presses translate down 1px. Keyboard-visible focus uses the global 3px jade outline.
- **Secondary:** White background, `#28324a` text, 1px `#cfd4dc` border; hover shifts to `#f8fafb`.

### Chips
- **Style:** Active status uses soft jade background with dark jade text; 4px 9px padding and a 999px pill shape.
- **State:** Disabled status uses a quiet gray background and muted slate text.

### Cards / Containers
- **Corner Style:** No outer card radius on the register or form sheet.
- **Background:** White register/form surfaces against mineral white workspace.
- **Shadow Strategy:** No shadows; use horizontal rules and tonal contrast.
- **Border:** Register and states use a 2px indigo top rule; register ends with a 1px slate rule.
- **Internal Padding:** Table cells use 16px 14px; empty states use 56px 24px.

### Inputs / Fields
- **Style:** White fill, 1px `#bcc3ce` stroke, 7px radius, 44px minimum height, 9px 12px padding.
- **Focus:** Indigo border with a translucent 3px indigo outline.
- **Error / Disabled:** Validation uses red copy; form-level errors use a red border and pale error wash. Submitting controls reduce opacity and disable the cursor.

### Navigation
- **Style:** 64px deep-indigo utility header with a 3px jade bottom rule. Classora is 22px/800; navigation is 14px/650.
- **States:** Inactive links use pale indigo text; the current Students link is white. Logout is a transparent, right-aligned text button.
- **Mobile:** Header padding reduces to 18px and the gap to 20px; no separate mobile navigation is introduced.

### Register
The student roster is a ruled table with uppercase 12px headers, 13px padding, 14px body text, indigo codes, bold names, quiet missing values, and inline “Chỉnh sửa” actions. Rows gain a very light hover wash on pointer-capable layouts; mobile rows retain the same fields as labeled blocks.

## Do's and Don'ts

### Do:
- **Do** keep Vietnamese labels and status language precise and action-oriented.
- **Do** use jade for a real operation or active state, with indigo as the structural anchor.
- **Do** preserve the ruled register treatment for student data instead of wrapping it in decorative cards.
- **Do** keep keyboard focus visible and honor reduced-motion preferences.

### Don't:
- **Don't** add dashboard statistics, speculative features, or decorative SaaS chrome to these surfaces.
- **Don't** use shadows to manufacture hierarchy in the flat register language.
- **Don't** canonize task-local composition as a reusable template; extend the visual rules, not the exact page arrangement.
