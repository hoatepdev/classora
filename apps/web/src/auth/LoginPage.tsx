import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { accessTokenKey, api } from "../lib/api.js";

const schema = z.object({
  email: z.email("Nhập địa chỉ email hợp lệ"),
  password: z.string().min(1, "Nhập mật khẩu"),
});
type LoginInput = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(schema),
  });

  const submit = async (input: LoginInput) => {
    try {
      const { data } = await api.post<{ accessToken: string }>("/auth/login", input);
      localStorage.setItem(accessTokenKey, data.accessToken);
      navigate("/students", { replace: true });
    } catch (error) {
      setError("root", {
        message: axios.isAxiosError(error) && error.response?.status === 401
          ? "Email hoặc mật khẩu không đúng."
          : "Không thể đăng nhập. Vui lòng thử lại.",
      });
    }
  };

  return <main className="login-page">
    <section className="login-context" aria-label="Classora">
      <span className="brand">Classora</span>
      <div className="login-message">
        <h1>Vận hành trung tâm, rõ từng ngày.</h1>
        <p>Quản lý học viên và công việc hằng ngày trong một không gian tập trung, an toàn theo từng trung tâm.</p>
      </div>
    </section>
    <section className="login-panel">
      <form className="login-form" onSubmit={handleSubmit(submit)} noValidate>
        <h2>Đăng nhập</h2>
        <p>Sử dụng tài khoản quản lý trung tâm của bạn.</p>
        {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input className="input" id="email" type="email" autoComplete="email" {...register("email")} />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
        </div>
        <div className="field">
          <label htmlFor="password">Mật khẩu</label>
          <input className="input" id="password" type="password" autoComplete="current-password" {...register("password")} />
          {errors.password && <p className="field-error">{errors.password.message}</p>}
        </div>
        <button className="button" disabled={isSubmitting}>{isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}</button>
      </form>
    </section>
  </main>;
}
