import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { accessTokenKey } from "../../lib/api.js";

export function StudentsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  return <div className="shell">
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/students">Classora</Link>
        <Link className="nav-link" aria-current={location.pathname.startsWith("/students") ? "page" : undefined} to="/students">Học viên</Link>
        <button className="logout" onClick={() => {
          localStorage.removeItem(accessTokenKey);
          navigate("/login", { replace: true });
        }}>Đăng xuất</button>
      </div>
    </header>
    <Outlet />
  </div>;
}
