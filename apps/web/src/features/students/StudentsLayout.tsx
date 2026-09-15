import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { accessTokenKey } from "../../lib/api.js";

export function StudentsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return <div className="shell">
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/students">Classora</Link>
        <Link className="nav-link" aria-current={location.pathname.startsWith("/students") ? "page" : undefined} to="/students">Học viên</Link>
        <Link className="nav-link" aria-current={location.pathname.startsWith("/teachers") ? "page" : undefined} to="/teachers">Giáo viên</Link>
        <Link className="nav-link" aria-current={location.pathname.startsWith("/courses") ? "page" : undefined} to="/courses">Khóa học</Link>
        <Link className="nav-link" aria-current={location.pathname.startsWith("/classes") ? "page" : undefined} to="/classes">Lớp học</Link>
        <button className="logout" onClick={() => {
          queryClient.clear();
          localStorage.removeItem(accessTokenKey);
          navigate("/login", { replace: true });
        }}>Đăng xuất</button>
      </div>
    </header>
    <Outlet />
  </div>;
}
