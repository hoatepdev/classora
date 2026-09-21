import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./auth/LoginPage.js";
import { AppShell } from "./components/layout/AppShell.js";
import { AttendanceSessionPage } from "./features/attendance/AttendanceSessionPage.js";
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
import { AcceptInvitationPage } from "./features/settings/AcceptInvitationPage.js";
import { TeamPage } from "./features/settings/TeamPage.js";
import { RolesPage } from "./features/settings/RolesPage.js";
import { SecurityPage } from "./features/settings/SecurityPage.js";
import { StudentForm } from "./features/students/StudentForm.js";
import { StudentsPage } from "./features/students/StudentsPage.js";

export function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/new" element={<StudentForm />} />
        <Route path="/students/:id" element={<StudentDetail />} />
        <Route path="/students/:id/edit" element={<StudentForm />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/new" element={<CourseForm />} />
        <Route path="/courses/:id" element={<CourseDetail />} />
        <Route path="/courses/:id/edit" element={<CourseForm />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/classes/new" element={<ClassForm />} />
        <Route path="/classes/:id" element={<ClassDetail />} />
        <Route path="/classes/:id/edit" element={<ClassForm />} />
        <Route path="/attendance-sessions/:id" element={<AttendanceSessionPage />} />
        <Route path="/settings/team" element={<TeamPage />} />
        <Route path="/settings/roles" element={<RolesPage />} />
        <Route path="/settings/security" element={<SecurityPage />} />
        <Route path="/teachers" element={<TeachersPage />} />
        <Route path="/teachers/new" element={<TeacherForm />} />
        <Route path="/teachers/:id" element={<TeacherDetail />} />
        <Route path="/teachers/:id/edit" element={<TeacherForm />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/students" replace />} />
  </Routes>;
}
