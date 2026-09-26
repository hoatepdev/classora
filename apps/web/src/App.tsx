import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./auth/LoginPage.js";
import { AppShell } from "./components/layout/AppShell.js";
import { AttendanceSessionPage } from "./features/attendance/AttendanceSessionPage.js";
import { BranchDetail } from "./features/branches/BranchDetail.js";
import { BranchForm } from "./features/branches/BranchForm.js";
import { BranchesPage } from "./features/branches/BranchesPage.js";
import { RoomDetail } from "./features/rooms/RoomDetail.js";
import { RoomForm } from "./features/rooms/RoomForm.js";
import { RoomsPage } from "./features/rooms/RoomsPage.js";
import { ClassDetail } from "./features/classes/ClassDetail.js";
import { ClassForm } from "./features/classes/ClassForm.js";
import { ClassesPage } from "./features/classes/ClassesPage.js";
import { CourseDetail } from "./features/courses/CourseDetail.js";
import { CourseForm } from "./features/courses/CourseForm.js";
import { CoursesPage } from "./features/courses/CoursesPage.js";
import { ProtectedRoute } from "./features/students/ProtectedRoute.js";
import { TeacherDetail } from "./features/teachers/TeacherDetail.js";
import { TeacherForm } from "./features/teachers/TeacherForm.js";
import { TeachersPage } from "./features/teachers/TeachersPage.js";
import { StudentDetail } from "./features/students/StudentDetail.js";
import { SchedulePage } from "./features/schedules/SchedulePage.js";
import { AcceptInvitationPage } from "./features/settings/AcceptInvitationPage.js";
import { TeamPage } from "./features/settings/TeamPage.js";
import { RolesPage } from "./features/settings/RolesPage.js";
import { SecurityPage } from "./features/settings/SecurityPage.js";
import { AuditPage } from "./features/audit/AuditPage.js";
import { StudentForm } from "./features/students/StudentForm.js";
import { StudentsPage } from "./features/students/StudentsPage.js";
import { BillingPage } from "./features/billing/BillingPage.js";
import { LeadDetailPage } from "./features/crm/LeadDetailPage.js";
import { LeadForm } from "./features/crm/LeadForm.js";
import { LeadsPage } from "./features/crm/LeadsPage.js";
import { CompensationPage } from "./features/compensation/CompensationPage.js";
import { CompensationPeriodPage } from "./features/compensation/CompensationPeriodPage.js";
import { CompensationStatementPage } from "./features/compensation/CompensationStatementPage.js";
import { CommunicationMessagePage } from "./features/communications/CommunicationMessagePage.js";
import { CommunicationsPage } from "./features/communications/CommunicationsPage.js";
import { CommunicationTemplatesPage } from "./features/communications/CommunicationTemplatesPage.js";

export function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/leads" element={<ProtectedRoute permission="crm.read"><LeadsPage /></ProtectedRoute>} />
        <Route path="/leads/new" element={<ProtectedRoute permission="crm.write"><LeadForm /></ProtectedRoute>} />
        <Route path="/leads/:id" element={<ProtectedRoute permission="crm.read"><LeadDetailPage /></ProtectedRoute>} />
        <Route path="/leads/:id/edit" element={<ProtectedRoute permission="crm.write"><LeadForm /></ProtectedRoute>} />
        <Route path="/billing/compensation" element={<ProtectedRoute permission="compensation.read"><CompensationPage /></ProtectedRoute>} />
        <Route path="/billing/compensation/periods/:id" element={<ProtectedRoute permission="compensation.read"><CompensationPeriodPage /></ProtectedRoute>} />
        <Route path="/billing/compensation/statements/:id" element={<ProtectedRoute permission="compensation.read"><CompensationStatementPage /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute permission="billing.read"><BillingPage /></ProtectedRoute>} />
        <Route path="/billing/:section" element={<ProtectedRoute permission="billing.read"><BillingPage /></ProtectedRoute>} />
        <Route path="/students/new" element={<ProtectedRoute permission="student.write"><StudentForm /></ProtectedRoute>} />
        <Route path="/students/:id" element={<StudentDetail />} />
        <Route path="/students/:id/edit" element={<ProtectedRoute permission="student.write"><StudentForm /></ProtectedRoute>} />
        <Route path="/courses" element={<ProtectedRoute permission="course.read"><CoursesPage /></ProtectedRoute>} />
        <Route path="/courses/new" element={<ProtectedRoute permission="course.write"><CourseForm /></ProtectedRoute>} />
        <Route path="/courses/:id" element={<ProtectedRoute permission="course.read"><CourseDetail /></ProtectedRoute>} />
        <Route path="/courses/:id/edit" element={<ProtectedRoute permission="course.write"><CourseForm /></ProtectedRoute>} />
        <Route path="/classes" element={<ProtectedRoute permission="class.read"><ClassesPage /></ProtectedRoute>} />
        <Route path="/classes/new" element={<ProtectedRoute permission="class.write"><ClassForm /></ProtectedRoute>} />
        <Route path="/classes/:id" element={<ProtectedRoute permission="class.read"><ClassDetail /></ProtectedRoute>} />
        <Route path="/classes/:id/edit" element={<ProtectedRoute permission="class.write"><ClassForm /></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute permission="schedule.read"><SchedulePage /></ProtectedRoute>} />
        <Route path="/attendance-sessions/:id" element={<ProtectedRoute permission="attendance.read"><AttendanceSessionPage /></ProtectedRoute>} />
        <Route path="/settings/team" element={<ProtectedRoute permission="team.read"><TeamPage /></ProtectedRoute>} />
        <Route path="/settings/roles" element={<ProtectedRoute permission="team.read"><RolesPage /></ProtectedRoute>} />
        <Route path="/settings/security" element={<ProtectedRoute permission="settings.read"><SecurityPage /></ProtectedRoute>} />
        <Route path="/settings/audit-log" element={<ProtectedRoute permission="audit.read"><AuditPage /></ProtectedRoute>} />
        <Route path="/teachers" element={<ProtectedRoute permission="teacher.read"><TeachersPage /></ProtectedRoute>} />
        <Route path="/teachers/new" element={<ProtectedRoute permission="teacher.write"><TeacherForm /></ProtectedRoute>} />
        <Route path="/teachers/:id" element={<ProtectedRoute permission="teacher.read"><TeacherDetail /></ProtectedRoute>} />
        <Route path="/teachers/:id/edit" element={<ProtectedRoute permission="teacher.write"><TeacherForm /></ProtectedRoute>} />
        <Route path="/branches" element={<ProtectedRoute permission="branch.read"><BranchesPage /></ProtectedRoute>} />
        <Route path="/branches/new" element={<ProtectedRoute permission="branch.write"><BranchForm /></ProtectedRoute>} />
        <Route path="/branches/:id" element={<ProtectedRoute permission="branch.read"><BranchDetail /></ProtectedRoute>} />
        <Route path="/branches/:id/edit" element={<ProtectedRoute permission="branch.write"><BranchForm /></ProtectedRoute>} />
        <Route path="/rooms" element={<ProtectedRoute permission="room.read"><RoomsPage /></ProtectedRoute>} />
        <Route path="/rooms/new" element={<ProtectedRoute permission="room.write"><RoomForm /></ProtectedRoute>} />
        <Route path="/rooms/:id" element={<ProtectedRoute permission="room.read"><RoomDetail /></ProtectedRoute>} />
        <Route path="/rooms/:id/edit" element={<ProtectedRoute permission="room.write"><RoomForm /></ProtectedRoute>} />
        <Route path="/communications" element={<ProtectedRoute permission="communication.read"><CommunicationsPage /></ProtectedRoute>} />
        <Route path="/communications/templates" element={<ProtectedRoute permission="communication.read"><CommunicationTemplatesPage /></ProtectedRoute>} />
        <Route path="/communications/:id" element={<ProtectedRoute permission="communication.read"><CommunicationMessagePage /></ProtectedRoute>} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/students" replace />} />
  </Routes>;
}
