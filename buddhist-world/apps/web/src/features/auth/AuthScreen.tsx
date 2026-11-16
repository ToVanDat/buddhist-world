import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../stores/auth";
import { LoginScene } from "./LoginScene";

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), username.trim(), password);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode((current) => current === "login" ? "register" : "login");
    setErr(null);
    setPassword("");
  }

  return (
    <main className="auth-shell">
      <LoginScene />
      <div className="auth-atmosphere" />
      <header className="menu-brand">
        <div className="brand-mark" aria-hidden="true">法</div>
        <div>
          <span className="brand-kicker">A LIVING WORLD OF STILLNESS</span>
          <strong>BUDDHIST WORLD</strong>
        </div>
      </header>

      <section className="menu-copy" aria-label="Giới thiệu thế giới">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1 }}>
          <p className="eyebrow"><span /> HÀNH TRÌNH AN NHIÊN BẮT ĐẦU</p>
          <h1>Nơi tâm an trú,<br /><em>thế giới mở ra.</em></h1>
          <p className="menu-description">Bước qua cổng Tam Quan. Lắng nghe tiếng chuông chùa, dạo bước giữa thiên nhiên và gặp gỡ những tâm hồn đồng điệu.</p>
          <div className="world-status"><span className="status-dot" /> THẾ GIỚI ĐANG CHỜ BẠN</div>
        </motion.div>
      </section>

      <motion.section className="auth-panel" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.15 }}>
        <div className="panel-topline"><span>WELCOME TO THE TEMPLE</span><span>01 / 01</span></div>
        <div className="panel-heading">
          <p className="panel-eyebrow">{mode === "login" ? "TIẾP TỤC HÀNH TRÌNH" : "BẮT ĐẦU HÀNH TRÌNH"}</p>
          <h2>{mode === "login" ? "Chào mừng trở lại" : "Tạo hành trình mới"}</h2>
          <p>{mode === "login" ? "Đăng nhập để trở về thế giới của bạn." : "Tạo tài khoản để bước vào Buddhist World."}</p>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate={false}>
          <label className="field">
            <span>ĐỊA CHỈ EMAIL</span>
            <input type="email" required autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <AnimatePresence initial={false}>
            {mode === "register" && (
              <motion.label className="field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <span>TÊN HIỂN THỊ</span>
                <input required minLength={3} maxLength={24} autoComplete="username" placeholder="Tên bạn muốn mọi người gọi" value={username} onChange={(e) => setUsername(e.target.value)} />
              </motion.label>
            )}
          </AnimatePresence>
          <label className="field">
            <span>MẬT KHẨU</span>
            <div className="password-wrap">
              <input type={showPassword ? "text" : "password"} required minLength={mode === "register" ? 10 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Nhập mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="password-toggle" type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{showPassword ? "ẨN" : "HIỆN"}</button>
            </div>
          </label>
          {err && <motion.p className="auth-error" role="alert" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>{err}</motion.p>}
          <button className="enter-world" type="submit" disabled={busy}>
            <span>{busy ? "ĐANG KẾT NỐI..." : mode === "login" ? "BƯỚC VÀO THẾ GIỚI" : "TẠO TÀI KHOẢN"}</span>
            <span className="enter-arrow" aria-hidden="true">↗</span>
          </button>
        </form>

        <div className="auth-switch">
          <span>{mode === "login" ? "Bạn chưa có tài khoản?" : "Bạn đã có tài khoản?"}</span>
          <button type="button" onClick={switchMode}>{mode === "login" ? "Đăng ký" : "Đăng nhập"}</button>
        </div>
        <div className="panel-footer"><span>AN INNER JOURNEY</span><span>© BUDDHIST WORLD</span></div>
      </motion.section>

      <footer className="menu-footer"><span>VIỆT NAM · A WORLD WITHOUT COMBAT</span><span>FIND YOUR STILLNESS</span></footer>
    </main>
  );
}
