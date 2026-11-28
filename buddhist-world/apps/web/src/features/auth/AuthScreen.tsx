import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../services/api";
import { useAuth } from "../../stores/auth";
import { LoginScene } from "./LoginScene";

type AuthMode = "login" | "register" | "forgot" | "otp" | "reset";

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [resetToken, setResetToken] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else if (mode === "register") {
        await register(email.trim(), username.trim(), password);
      } else if (mode === "forgot") {
        const result = await api<{ message: string }>("/auth/forgot-password", {
          method: "POST", body: JSON.stringify({ email: email.trim() }),
        });
        setOtp("");
        setResendCooldown(60);
        setMode("otp");
        setNotice(result.message);
      } else if (mode === "otp") {
        if (!/^\d{6}$/.test(otp)) throw new Error("Mã OTP phải gồm đúng 6 chữ số.");
        const result = await api<{ resetToken: string; message: string }>("/auth/verify-reset-otp", {
          method: "POST", body: JSON.stringify({ email: email.trim(), otp }),
        });
        if (!result.resetToken) throw new Error("Không nhận được mã xác thực đặt lại mật khẩu.");
        setResetToken(result.resetToken);
        setPassword("");
        setConfirmPassword("");
        setMode("reset");
        setNotice(result.message);
      } else {
        if (!resetToken) throw new Error("Phiên đặt lại mật khẩu không hợp lệ.");
        if (password !== confirmPassword) throw new Error("Mật khẩu xác nhận không khớp.");
        const result = await api<{ message: string }>("/auth/reset-password", {
          method: "POST", body: JSON.stringify({ token: resetToken, password }),
        });
        setResetToken("");
        setOtp("");
        setPassword("");
        setConfirmPassword("");
        setMode("login");
        setNotice(result.message);
      }
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    if (busy || resendCooldown > 0) return;
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST", body: JSON.stringify({ email: email.trim() }),
      });
      setOtp("");
      setResendCooldown(60);
      setNotice(result.message);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Không thể gửi lại mã OTP.");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(next: AuthMode) {
    setMode(next);
    setErr(null);
    setNotice(null);
    setOtp("");
    setPassword("");
    setConfirmPassword("");
    if (next === "login") {
      setResetToken("");
      setResendCooldown(0);
    }
  }

  const title = mode === "login" ? "Chào mừng trở lại"
    : mode === "register" ? "Tạo hành trình mới"
    : mode === "forgot" ? "Tìm lại lối vào"
    : mode === "otp" ? "Xác thực email"
    : "Đặt mật khẩu mới";
  const subtitle = mode === "login" ? "Đăng nhập để trở về thế giới của bạn."
    : mode === "register" ? "Tạo tài khoản để bước vào Buddhist World."
    : mode === "forgot" ? "Nhập email đã đăng ký để nhận mã xác thực khôi phục."
    : mode === "otp" ? "Nhập mã OTP 6 chữ số được gửi đến địa chỉ email của bạn."
    : "Tạo mật khẩu mới để tiếp tục hành trình.";
  const heading = mode === "login" ? "TIẾP TỤC HÀNH TRÌNH"
    : mode === "register" ? "BẮT ĐẦU HÀNH TRÌNH"
    : mode === "forgot" ? "KHÔI PHỤC TÀI KHOẢN"
    : mode === "otp" ? "XÁC THỰC BẢO MẬT"
    : "BẢO VỆ TÀI KHOẢN";

  return (
    <main className="auth-shell">
      <LoginScene />
      <div className="auth-atmosphere" aria-hidden="true" />
      <header className="menu-brand">
        <img className="brand-mark" src="/brand/buddhist-world-mark.svg" alt="" aria-hidden="true" />
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

      <motion.section
        className="auth-panel"
        aria-labelledby="auth-title"
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.15 }}
      >
        <div className="panel-topline"><span>WELCOME TO THE TEMPLE</span><span>01 / 01</span></div>
        <div className="panel-heading">
          <p className="panel-eyebrow">{heading}</p>
          <h2 id="auth-title">{title}</h2>
          <p>{subtitle}</p>
        </div>

        <form className="auth-form" onSubmit={submit} aria-label={mode === "login" ? "Đăng nhập" : mode === "register" ? "Đăng ký" : mode === "forgot" ? "Khôi phục mật khẩu" : mode === "otp" ? "Xác thực OTP" : "Đặt lại mật khẩu"}>
          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <label className="field">
              <span>ĐỊA CHỈ EMAIL</span>
              <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          <AnimatePresence initial={false}>
            {mode === "register" && (
              <motion.label className="field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <span>TÊN HIỂN THỊ</span>
                <input name="username" required minLength={3} maxLength={24} autoComplete="username" placeholder="Tên bạn muốn mọi người gọi" value={username} onChange={(e) => setUsername(e.target.value)} />
              </motion.label>
            )}
          </AnimatePresence>
          {mode === "otp" && (
            <label className="field">
              <span>MÃ OTP 6 CHỮ SỐ</span>
              <input className="auth-otp-input" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} />
              <span className="auth-field-hint">Mã được gửi đến {email || "email của bạn"} · hiệu lực 5 phút</span>
            </label>
          )}
          {(mode === "login" || mode === "register" || mode === "reset") && (
            <label className="field">
              <span>{mode === "reset" ? "MẬT KHẨU MỚI" : "MẬT KHẨU"}</span>
              <div className="password-wrap">
                <input name="password" type={showPassword ? "text" : "password"} required minLength={mode === "login" ? 1 : 10} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "reset" ? "Tạo mật khẩu mới (ít nhất 10 ký tự)" : "Nhập mật khẩu"} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button className="password-toggle" type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword}>{showPassword ? "ẨN" : "HIỆN"}</button>
              </div>
            </label>
          )}
          {mode === "reset" && (
            <label className="field">
              <span>XÁC NHẬN MẬT KHẨU MỚI</span>
              <input name="confirmPassword" type={showPassword ? "text" : "password"} required minLength={10} maxLength={128} autoComplete="new-password" placeholder="Nhập lại mật khẩu mới" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </label>
          )}
          {err && <motion.p id="auth-error" className="auth-error" role="alert" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>{err}</motion.p>}
          {notice && <motion.p className="auth-success" role="status" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>{notice}</motion.p>}
          <button className="enter-world" type="submit" disabled={busy || (mode === "otp" && otp.length !== 6) || (mode === "reset" && !resetToken)} aria-busy={busy}>
            <span>{busy ? "ĐANG XỬ LÝ..." : mode === "login" ? "BƯỚC VÀO THẾ GIỚI" : mode === "register" ? "TẠO TÀI KHOẢN" : mode === "forgot" ? "GỬI MÃ OTP" : mode === "otp" ? "XÁC THỰC MÃ OTP" : "CẬP NHẬT MẬT KHẨU"}</span>
            <span className="enter-arrow" aria-hidden="true">↗</span>
          </button>
        </form>

        {mode === "login" && (
          <div className="auth-recovery"><button type="button" onClick={() => changeMode("forgot")}>Quên mật khẩu?</button></div>
        )}
        {mode === "otp" && (
          <div className="auth-recovery auth-otp-actions">
            <button type="button" onClick={() => void resendOtp()} disabled={busy || resendCooldown > 0}>{resendCooldown > 0 ? `Gửi lại mã sau ${resendCooldown}s` : "Gửi lại mã OTP"}</button>
          </div>
        )}
        {mode === "login" || mode === "register" ? (
          <div className="auth-switch">
            <span>{mode === "login" ? "Bạn chưa có tài khoản?" : "Bạn đã có tài khoản?"}</span>
            <button type="button" onClick={() => changeMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Đăng ký" : "Đăng nhập"}</button>
          </div>
        ) : (
          <div className="auth-switch">
            <span>{mode === "reset" ? "Đã nhớ mật khẩu?" : "Muốn quay lại?"}</span>
            <button type="button" onClick={() => changeMode("login")}>Quay lại đăng nhập</button>
          </div>
        )}
        <div className="panel-footer"><span>AN INNER JOURNEY</span><span>© BUDDHIST WORLD</span></div>
      </motion.section>

      <footer className="menu-footer"><span>VIỆT NAM · A WORLD WITHOUT COMBAT</span><span>FIND YOUR STILLNESS</span></footer>
    </main>
  );
}
