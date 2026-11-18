export interface GLTFCacheLeaseOptions { idleGraceMs?: number; maxIdleEntries?: number; }
interface Entry { references: number; lastReleasedAt: number; timer: ReturnType<typeof setTimeout> | null; clearCache: () => void; }

/**
 * Reference-counts useGLTF consumers and evicts only unreferenced idle loader keys.
 * It intentionally does not force-dispose GPU objects: glTF resources may be shared
 * across loader entries or external clones. Clearing the loader cache is ownership-safe.
 */
export class GLTFCacheLeaseManager {
  private readonly entries = new Map<string, Entry>();
  private readonly idleGraceMs: number;
  private readonly maxIdleEntries: number;
  constructor(options: GLTFCacheLeaseOptions = {}) {
    this.idleGraceMs = options.idleGraceMs ?? 30_000;
    this.maxIdleEntries = options.maxIdleEntries ?? 48;
  }
  retain(src: string, clearCache: () => void): () => void {
    let entry = this.entries.get(src);
    if (!entry) { entry = { references: 0, lastReleasedAt: 0, timer: null, clearCache }; this.entries.set(src, entry); }
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.references += 1;
    entry.clearCache = clearCache;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.entries.get(src);
      if (!current) return;
      current.references = Math.max(0, current.references - 1);
      if (current.references !== 0) return;
      current.lastReleasedAt = Date.now();
      current.timer = setTimeout(() => this.evictIfIdle(src), this.idleGraceMs);
      this.evictIdleOverflow();
    };
  }
  referenceCount(src: string): number { return this.entries.get(src)?.references ?? 0; }
  private evictIfIdle(src: string): boolean {
    const entry = this.entries.get(src);
    if (!entry || entry.references !== 0) return false;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.clearCache();
    this.entries.delete(src);
    return true;
  }
  private evictIdleOverflow(): void {
    const idle = [...this.entries.entries()].filter(([, entry]) => entry.references === 0)
      .sort((a, b) => a[1].lastReleasedAt - b[1].lastReleasedAt);
    while (idle.length > this.maxIdleEntries) { const [src] = idle.shift()!; this.evictIfIdle(src); }
  }
}
