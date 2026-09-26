import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { accessTokenKey, api } from "@/lib/api";

const schema = z.object({ email: z.email("Nhập địa chỉ email hợp lệ"), password: z.string().min(1, "Nhập mật khẩu") });
type Input = z.infer<typeof schema>;

export function PortalLoginPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Input>({ resolver: zodResolver(schema) });
  const submit = async (input: Input) => {
    try {
      const { data } = await api.post<{ accessToken: string }>("/auth/login", input);
      localStorage.setItem(accessTokenKey, data.accessToken);
      navigate(search.get("returnTo")?.startsWith("/portal") ? search.get("returnTo")! : "/portal", { replace: true });
    } catch (error) {
      setError("root", { message: axios.isAxiosError(error) && error.response?.status === 401 ? "Email hoặc mật khẩu không đúng." : "Không thể đăng nhập. Vui lòng thử lại." });
    }
  };
  return <main className="login-page">
    <section className="login-context" aria-label="Cổng thông tin Classora"><span className="brand">Classora</span><div className="login-message"><h1>Việc học, trong một nơi.</h1><p>Xem lịch học, điểm danh, học bù, học phí và thông báo chính thức từ trung tâm.</p></div></section>
    <section className="login-panel"><form className="login-form" onSubmit={handleSubmit(submit)} noValidate>
      <h2>Cổng học viên & phụ huynh</h2><p>Đăng nhập bằng tài khoản đã được trung tâm kích hoạt.</p>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="field"><label htmlFor="portal-email">Email</label><input className="input" id="portal-email" type="email" autoComplete="email" {...register("email")} />{errors.email && <p className="field-error">{errors.email.message}</p>}</div>
      <div className="field"><label htmlFor="portal-password">Mật khẩu</label><input className="input" id="portal-password" type="password" autoComplete="current-password" {...register("password")} />{errors.password && <p className="field-error">{errors.password.message}</p>}</div>
      <button className="button" disabled={isSubmitting}>{isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}</button>
      <p className="text-center text-sm"><Link className="action-link" to="/login">Đăng nhập dành cho nhân viên</Link></p>
    </form></section>
  </main>;
}
