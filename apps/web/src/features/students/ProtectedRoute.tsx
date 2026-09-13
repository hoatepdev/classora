import { Navigate, Outlet } from "react-router-dom";
import { accessTokenKey } from "../../lib/api.js";

export function ProtectedRoute() {
  return localStorage.getItem(accessTokenKey) ? <Outlet /> : <Navigate to="/login" replace />;
}
