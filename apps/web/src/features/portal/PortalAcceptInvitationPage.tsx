import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { accessTokenKey, api, getApiErrorMessage } from "@/lib/api";

export function PortalAcceptInvitationPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const token = search.get("token") ?? "";
  const authenticated = Boolean(localStorage.getItem(accessTokenKey));
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setSubmitting(true);
    try {
      if (authenticated) await api.post("/portal/invitations/accept-existing", { token });
      else await api.post("/portal/invitations/accept", { token, name, password });
      navigate("/portal", { replace: true });
    } catch (requestError) { setError(getApiErrorMessage(requestError, "Lời mời không hợp lệ, đã hết hạn hoặc không khớp tài khoản.")); }
    finally { setSubmitting(false); }
  };
  return <main className="login-page"><section className="login-context"><span className="brand">Classora</span><div className="login-message"><h1>Kết nối với trung tâm.</h1><p>Lời mời này chỉ cấp quyền xem thông tin học tập được trung tâm cho phép.</p></div></section><section className="login-panel"><form className="login-form" onSubmit={submit}>
    <h2>Kích hoạt cổng thông tin</h2><p>{authenticated ? "Xác nhận liên kết với tài khoản đang đăng nhập." : "Tạo tài khoản để chấp nhận lời mời."}</p>
    {error && <p className="form-error" role="alert">{error}</p>}{!token && <p className="form-error">Liên kết không có mã hợp lệ.</p>}
    {!authenticated && <><div className="field"><label htmlFor="portal-name">Họ và tên</label><input className="input" id="portal-name" name="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /></div><div className="field"><label htmlFor="portal-new-password">Mật khẩu</label><input className="input" id="portal-new-password" name="password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></div></>}
    <button className="button" disabled={!token || submitting}>{submitting ? "Đang kích hoạt…" : "Kích hoạt"}</button>
    {!authenticated && <p className="text-center text-sm">Đã có tài khoản? <Link className="action-link" to={`/portal/login?returnTo=${encodeURIComponent(`/portal/accept-invitation?token=${token}`)}`}>Đăng nhập trước</Link></p>}
  </form></section></main>;
}
