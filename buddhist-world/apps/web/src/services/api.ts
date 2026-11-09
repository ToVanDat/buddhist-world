import { useAuth } from "../stores/auth";

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string[]>) { super(message); }
}

async function raw(path: string, init: RequestInit = {}, token?: string | null) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`/api${path}`, { ...init, headers, credentials: "include" });
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init, useAuth.getState().accessToken);
  if (res.status === 401 && useAuth.getState().accessToken && !path.startsWith("/auth/")) {
    if (await useAuth.getState().refresh()) res = await raw(path, init, useAuth.getState().accessToken);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Có lỗi xảy ra.", data.fields);
  return data as T;
}
