import { create } from "zustand";

interface AuthUser { id: string; username: string; displayName?: string }
interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  ready: boolean;
  init: () => Promise<void>;
  refresh: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setDisplayName: (displayName: string) => void;
}

async function post(path: string, body?: unknown) {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST", credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as any };
}

// React StrictMode can mount effects twice in development. Share one refresh request
// so rotating refresh cookies are never consumed concurrently by duplicate init calls.
let initPromise: Promise<void> | null = null;
let refreshPromise: Promise<boolean> | null = null;

export const useAuth = create<AuthState>()((set, get) => ({
  accessToken: null, user: null, ready: false,
  async init() {
    if (get().ready) return;
    if (!initPromise) {
      initPromise = (async () => {
        try {
          await get().refresh();
        } catch {
          set({ accessToken: null, user: null });
        } finally {
          set({ ready: true });
        }
      })();
    }
    await initPromise;
  },
  async refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const { ok, data } = await post("/refresh");
      if (ok) { set((state) => ({ accessToken: data.accessToken, user: { ...data.user, displayName: state.user?.id === data.user.id ? state.user?.displayName : undefined } })); return true; }
      set({ accessToken: null, user: null });
      return false;
    })();
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  },
  async login(email, password) {
    const { ok, data } = await post("/login", { email, password });
    if (!ok) throw new Error(data.error ?? "Đăng nhập thất bại.");
    set({ accessToken: data.accessToken, user: data.user });
  },
  async register(email, username, password) {
    const { ok, data } = await post("/register", { email, username, password });
    if (!ok) throw new Error(data.fields ? (Object.values(data.fields) as string[][]).flat().join(" ") : data.error ?? "Đăng ký thất bại.");
    set({ accessToken: data.accessToken, user: data.user });
  },
  setDisplayName(displayName) { set((state) => state.user ? { user: { ...state.user, displayName } } : state); },
  async logout() { await post("/logout"); set({ accessToken: null, user: null }); },
}));
