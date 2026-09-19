---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/layout", "src/features/students", "src/features/teachers", "src/features/courses", "src/features/classes"]
---

SCOPE: Authenticated Classora operations routes. MODE: Operate.

AUDIENCE: Vietnamese training-center managers moving repeatedly among student, teacher, course, class, schedule, enrollment, and attendance work. JOB: know which center they are operating, reach a real capability quickly, scan current records, and complete one operation without losing context. PRIMARY ACTION: the current page's real create, edit, enrollment, schedule, or attendance action. CONSTRAINTS: Vietnamese-first, accessible, desktop-efficient, mobile-capable, tenant identity always visible, no dashboard data or controls without backend support.

THESIS: The operational workspace: a compact SaaS frame keeps center identity and real capabilities stable while white working surfaces carry the task. Refuse both the old Students-specific topbar and the generic dashboard template.

OWN-WORLD: Deep indigo sidebar, restrained white topbar, mineral-white workspace, white grouped surfaces with fine slate borders and minimal ambient shadow, jade primary actions, quiet semantic status tints, Lucide icons, workhorse system typography, and 8–12px practical corners.

STORY: The manager enters the current tenant, confirms the center and hostname, chooses Students, Teachers, Courses, or Classes, then works through lists, details, forms, schedules, enrollments, and attendance using one consistent visual vocabulary. Loading, empty, error, duplicate, completed, and unauthorized states remain explicit.

FIRST VIEWPORT: Desktop fixes a 248px indigo sidebar at left with Classora, the center identity, four real destinations, and the authenticated user/logout area; a 64px white topbar names the current section; content opens immediately into the page title, description, real action, and primary operational surface. Mobile replaces the sidebar with an accessible left drawer and keeps the current section visible. Signature interaction: active navigation remains obvious through nested routes while tenant identity never becomes a client-controlled selector; motion is limited to brief state feedback and respects reduced motion.

FORM: Code-led extension of the approved Classora palette and component foundation. Composition follows the user's approved operational SaaS direction and current repository capabilities rather than a visual concept tournament.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
