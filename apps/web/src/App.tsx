import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./auth/LoginPage.js";
import { ProtectedRoute } from "./features/students/ProtectedRoute.js";
import { StudentDetail } from "./features/students/StudentDetail.js";
import { StudentForm } from "./features/students/StudentForm.js";
import { StudentsLayout } from "./features/students/StudentsLayout.js";
import { StudentsPage } from "./features/students/StudentsPage.js";

export function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<StudentsLayout />}>
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/new" element={<StudentForm />} />
        <Route path="/students/:id" element={<StudentDetail />} />
        <Route path="/students/:id/edit" element={<StudentForm />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/students" replace />} />
  </Routes>;
}
