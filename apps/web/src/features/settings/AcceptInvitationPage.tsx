import axios from "axios";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, accessTokenKey, getApiErrorMessage } from "@/lib/api";

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (localStorage.getItem(accessTokenKey)) {
        await api.post("/team/invitations/accept-existing", { token });
      } else {
        await api.post("/team/invitations/accept", { token, name, password });
      }
      navigate("/students", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Lời mời không hợp lệ, đã hết hạn hoặc không khớp tài khoản."));
      if (axios.isAxiosError(requestError) && requestError.response?.status === 401) {
        localStorage.removeItem(accessTokenKey);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="login-page">
    <section className="login-panel">
      <form className="login-form" onSubmit={submit} noValidate>
        <h1>Tham gia trung tâm</h1>
        <p>Hoàn tất lời mời để truy cập Classora.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {!token && <p className="form-error" role="alert">Liên kết lời mời không có mã hợp lệ.</p>}
        {!localStorage.getItem(accessTokenKey) && <>
          <div className="field"><label htmlFor="name">Họ và tên</label><input className="input" id="name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="field"><label htmlFor="password">Mật khẩu</label><input className="input" id="password" type="password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        </>}
        <button className="button" disabled={!token || submitting}>{submitting ? "Đang xác nhận…" : "Chấp nhận lời mời"}</button>
        {!localStorage.getItem(accessTokenKey) && <p className="text-sm text-[#64748b]">Nếu bạn đã có tài khoản, hãy đăng nhập trước rồi mở lại liên kết này.</p>}
      </form>
    </section>
  </main>;
}
