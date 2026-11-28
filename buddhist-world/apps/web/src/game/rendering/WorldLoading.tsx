import { Html, useProgress } from "@react-three/drei";

export function WorldLoading() {
  const { progress, loaded, total } = useProgress();
  const percent = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <Html center zIndexRange={[100, 0]}>
      <div className="bw-world-loading" role="status" aria-live="polite" aria-label="Đang tải thế giới">
        <span className="bw-world-loading-mark" aria-hidden="true">禅</span>
        <div className="bw-world-loading-copy">
          <strong>Đang khai mở thế giới</strong>
          <span>Đang tải cảnh quan và các chi tiết của ngôi chùa…</span>
        </div>
        <div
          className="bw-world-loading-track"
          role="progressbar"
          aria-label="Tiến độ tải tài nguyên"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}%`}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <span className="bw-world-loading-meta">{percent}% · {loaded}/{total} tài nguyên</span>
      </div>
    </Html>
  );
}
