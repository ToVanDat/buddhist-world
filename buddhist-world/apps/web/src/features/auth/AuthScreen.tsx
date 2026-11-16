import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../stores/auth";
import { LoginBackdrop } from "./LoginBackdrop";

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
    <main className="auth auth-game-menu">
      <LoginBackdrop />
      <div className="game-menu-vignette" aria-hidden="true" />
      <div className="game-menu-grain" aria-hidden="true" />

      <header className="game-menu-header">
        <div className="game-menu-brand">
          <span className="game-menu-emblem">BW</span>
          <span><strong>BUDDHIST WORLD</strong><small>A LIVING SANCTUARY</small></span>
        </div>
        <div className="game-menu-build"><span className="game-menu-status" /> WORLD ONLINE <i /> EARLY ACCESS</div>
      </header>

      <div className="game-menu-layout">
        <motion.section
          className="game-menu-title"
          initial={{ opacity: 0, x: -26 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.05, ease: "easeOut" }}
        >
          <p className="game-menu-kicker">A CINEMATIC BUDDHIST WORLD</p>
          <h1>BUDDHIST<br /><em>WORLD</em></h1>
          <div className="game-menu-rule"><span /></div>
          <p className="game-menu-subtitle">Bình yên không phải là điểm đến.<br />Đó là hành trình ta đang bước đi.</p>
          <div className="game-menu-location">
            <span className="game-menu-location-icon">⌖</span>
            <span><small>ĐỊA ĐIỂM KHỞI ĐẦU</small><strong>Thiền Môn · Việt Nam</strong></span>
          </div>
        </motion.section>

        <motion.section
          className="auth-card auth-game-panel"
          initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          aria-labelledby="auth-title"
        >
          <div className="game-panel-topline"><span>{mode === "login" ? "CONTINUE YOUR JOURNEY" : "CREATE YOUR JOURNEY"}</span><span>01 / 02</span></div>
          <div className="auth-card-heading">
            <p className="auth-eyebrow">{mode === "login" ? "CHÀO MỪNG TRỞ LẠI" : "CHÀO MỪNG LỮ KHÁCH"}</p>
            <h2 id="auth-title">{mode === "login" ? "Tiếp tục hành trình" : "Khởi tạo hành trình"}</h2>
            <p>{mode === "login" ? "Đăng nhập để trở về thế giới của bạn." : "Tạo tài khoản và lưu lại dấu chân đầu tiên."}</p>
          </div>

          <div className="auth-mode-switch" role="group" aria-label="Chọn hình thức truy cập">
            <button type="button" className={mode === "login" ? "is-active" : ""} aria-pressed={mode === "login"} onClick={() => changeMode("login")}>Đăng nhập</button>
            <button type="button" className={mode === "register" ? "is-active" : ""} aria-pressed={mode === "register"} onClick={() => changeMode("register")}>Tạo tài khoản</button>
          </div>

          <form className="auth-form-premium" onSubmit={submit}>
            <label htmlFor="auth-email">EMAIL</label>
            <input
              id="auth-email" type="email" name="email" required maxLength={254}
              autoComplete="email" autoCapitalize="none" spellCheck={false}
              placeholder="name@example.com" value={email}
              onChange={(event) => { setEmail(event.target.value); setErr(null); }} disabled={busy}
            />

            {mode === "register" && (
              <>
                <label htmlFor="auth-username">TÊN LỮ KHÁCH</label>
                <input
                  id="auth-username" type="text" name="username" required minLength={3} maxLength={24}
                  autoComplete="username" placeholder="Tên hiển thị của bạn" value={username}
                  onChange={(event) => { setUsername(event.target.value); setErr(null); }} disabled={busy}
                />
                <p className="auth-field-hint">3–24 ký tự, có thể dùng chữ, số, dấu gạch dưới hoặc gạch nối.</p>
              </>
            )}

            <div className="auth-password-label">
              <label htmlFor="auth-password">MẬT KHẨU</label>
              {mode === "register" && <span>TỐI THIỂU 10 KÝ TỰ</span>}
            </div>
            <div className="auth-password-wrap">
              <input
                id="auth-password" type={showPassword ? "text" : "password"} name="password"
                required minLength={mode === "register" ? 10 : 1} maxLength={128}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="Nhập mật khẩu" value={password}
                onChange={(event) => { setPassword(event.target.value); setErr(null); }} disabled={busy}
              />
              <button type="button" className="auth-password-toggle"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} disabled={busy}>
                {showPassword ? "ẨN" : "HIỆN"}
              </button>
            </div>

            {err && <p className="auth-error" role="alert" aria-live="polite">{err}</p>}

            <button className="auth-submit" type="submit"
              disabled={busy || !email.trim() || !password || (mode === "register" && !username.trim())}>
              {busy ? <><span className="auth-spinner" aria-hidden="true" /> ĐANG KẾT NỐI…</> : mode === "login" ? "VÀO THẾ GIỚI" : "TẠO NHÂN VẬT"}
              {!busy && <span aria-hidden="true">⟶</span>}
            </button>
          </form>

          <div className="game-panel-foot"><span>SECURE ACCOUNT ACCESS</span><span>✦</span><span>YOUR JOURNEY IS SAVED</span></div>
        </motion.section>
      </div>

      <footer className="game-menu-footer">
        <div><span className="game-footer-mark">◈</span> MỘT THẾ GIỚI · NHIỀU HÀNH TRÌNH</div>
        <div>© {new Date().getFullYear()} BUDDHIST WORLD <i /> PEACE BEGINS WITHIN</div>
      </footer>
    </main>
  );
}
