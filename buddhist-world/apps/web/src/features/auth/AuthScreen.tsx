import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../stores/auth";

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try { mode === "login" ? await login(email, password) : await register(email, username, password); }
    catch (x) { setErr(x instanceof Error ? x.message : "Có lỗi xảy ra."); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth">
      <motion.section className="auth-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
        <h1>Cõi Chùa</h1>
        <p className="muted">Một khu chùa Việt để dạo bước, ngồi tĩnh và gặp gỡ.</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {mode === "register" && (
            <label>Tên hiển thị<input required minLength={3} maxLength={24} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          )}
          <label>Mật khẩu<input type="password" required minLength={mode === "register" ? 10 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {err && <p className="error" role="alert">{err}</p>}
          <button disabled={busy}>{mode === "login" ? "Vào thế giới" : "Tạo tài khoản"}</button>
        </form>
        <button className="ghost" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(null); }}>
          {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </motion.section>
    </main>
  );
}
