import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../stores/auth";

type AuthMode = "login" | "register";

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), username.trim(), password);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Không thể hoàn tất yêu cầu. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErr(null);
    setShowPassword(false);
  }

  return (
    <main className="auth auth-cinematic">
      <div className="auth-atmosphere" aria-hidden="true">
        <span className="auth-moon" />
        <span className="auth-horizon" />
        <span className="auth-incense auth-incense-one" />
        <span className="auth-incense auth-incense-two" />
      </div>

      <div className="auth-shell">
        <motion.section
          className="auth-story"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="auth-brand-mark" aria-hidden="true">BW</div>
          <p className="auth-eyebrow">BUDDHIST WORLD · A LIVING SANCTUARY</p>
          <h1>Chậm lại.<br /><em>An trú.</em></h1>
          <p className="auth-story-copy">
            Một cõi chùa Việt để dạo bước giữa thiên nhiên, khám phá những không gian văn hóa
            và gặp gỡ mọi người trong sự bình yên.
          </p>
          <div className="auth-story-foot">
            <span className="auth-story-line" />
            <span>Một hành trình tĩnh tại bắt đầu từ đây</span>
          </div>
        </motion.section>

        <motion.section
          className="auth-card auth-card-premium"
          initial={{ opacity: 0, y: 24, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.12, ease: "easeOut" }}
          aria-labelledby="auth-title"
        >
          <div className="auth-card-heading">
            <p className="auth-eyebrow">{mode === "login" ? "WELCOME BACK" : "BEGIN YOUR JOURNEY"}</p>
            <h2 id="auth-title">{mode === "login" ? "Trở về chốn an yên" : "Tạo lữ khách mới"}</h2>
            <p>{mode === "login" ? "Đăng nhập để tiếp tục hành trình của bạn." : "Tạo tài khoản để lưu lại hành trình trong thế giới."}</p>
          </div>

          <div className="auth-mode-switch" role="group" aria-label="Chọn hình thức truy cập">
            <button type="button" className={mode === "login" ? "is-active" : ""} aria-pressed={mode === "login"} onClick={() => changeMode("login")}>Đăng nhập</button>
            <button type="button" className={mode === "register" ? "is-active" : ""} aria-pressed={mode === "register"} onClick={() => changeMode("register")}>Đăng ký</button>
          </div>

          <form className="auth-form-premium" onSubmit={submit} noValidate={false}>
            <label htmlFor="auth-email">Địa chỉ email</label>
            <input
              id="auth-email"
              type="email"
              name="email"
              required
              maxLength={254}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@example.com"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setErr(null); }}
              disabled={busy}
            />

            {mode === "register" && (
              <>
                <label htmlFor="auth-username">Tên lữ khách</label>
                <input
                  id="auth-username"
                  type="text"
                  name="username"
                  required
                  minLength={3}
                  maxLength={24}
                  autoComplete="username"
                  placeholder="Tên hiển thị của bạn"
                  value={username}
                  onChange={(event) => { setUsername(event.target.value); setErr(null); }}
                  disabled={busy}
                />
                <p className="auth-field-hint">3–24 ký tự, có thể dùng chữ, số, dấu gạch dưới hoặc gạch nối.</p>
              </>
            )}

            <div className="auth-password-label">
              <label htmlFor="auth-password">Mật khẩu</label>
              {mode === "register" && <span>Tối thiểu 10 ký tự</span>}
            </div>
            <div className="auth-password-wrap">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                name="password"
                required
                minLength={mode === "register" ? 10 : 1}
                maxLength={128}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(event) => { setPassword(event.target.value); setErr(null); }}
                disabled={busy}
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={busy}
              >
                {showPassword ? "Ẩn" : "Hiện"}
              </button>
            </div>

            {err && <p className="auth-error" role="alert" aria-live="polite">{err}</p>}

            <button className="auth-submit" type="submit" disabled={busy || !email.trim() || !password || (mode === "register" && !username.trim())}>
              {busy ? <><span className="auth-spinner" aria-hidden="true" /> Đang kết nối…</> : mode === "login" ? "Bước vào thế giới" : "Tạo tài khoản"}
              {!busy && <span aria-hidden="true">↗</span>}
            </button>
          </form>

          <p className="auth-privacy-note">
            Bằng việc tiếp tục, bạn đồng ý sử dụng thế giới với sự tôn trọng và an toàn dành cho cộng đồng.
          </p>
        </motion.section>
      </div>

      <footer className="auth-footer">
        <span>© {new Date().getFullYear()} Buddhist World</span>
        <span>Peace begins within</span>
      </footer>
    </main>
  );
}
