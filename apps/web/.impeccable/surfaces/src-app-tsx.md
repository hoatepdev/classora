---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/layout", "src/features/students", "src/features/teachers", "src/features/courses", "src/features/classes"]
---

SCOPE: Authenticated Classora operations routes. MODE: Operate.

AUDIENCE: Vietnamese training-center managers moving repeatedly among student, teacher, course, class, schedule, enrollment, and attendance work. JOB: know which center they are operating, reach a real capability quickly, scan current records, and complete one operation without losing context. PRIMARY ACTION: the current page's real create, edit, enrollment, schedule, or attendance action. CONSTRAINTS: Vietnamese-first, accessible, desktop-efficient, mobile-capable, tenant identity always visible, no dashboard data or controls without backend support.

THESIS: The light operational workspace: a compact SaaS frame keeps center identity and real capabilities stable while white working surfaces carry the task. Refuse both the old dark-sidebar template and a generic analytics dashboard.

OWN-WORLD: White or near-white sidebar, restrained white topbar, cool-gray `#F8FAFC` workspace, white grouped surfaces with fine slate borders and minimal ambient shadow, blue primary actions and navigation emphasis, green semantic success states, Lucide icons, workhorse system typography, and 8–12px practical corners.

STORY: The manager enters the current tenant, confirms the center and hostname, chooses Students, Teachers, Courses, or Classes, then works through lists, details, forms, schedules, enrollments, and attendance using one consistent visual vocabulary. Loading, empty, error, duplicate, completed, and unauthorized states remain explicit.

FIRST VIEWPORT: Desktop fixes an approximately 216px light sidebar at left with Classora, the center identity, four real destinations, and the authenticated user/logout area; a 60px white topbar names the current section and shows the real user; content opens immediately into the page title, description, real action, and primary operational surface. Mobile replaces the sidebar with an accessible left drawer and keeps the current section visible. Signature interaction: active navigation uses pale blue with blue text and icon through nested routes while tenant identity never becomes a client-controlled selector; motion is limited to brief state feedback and respects reduced motion.

FORM: Code-led fidelity to the approved Classora mockup and current repository capabilities. Preserve existing architecture and product behavior rather than redesigning the task model.

FINISH: unreviewed and undocumented is unfinished; this build ends with a visual comparison, detector pass, build, tests, and browser verification.
