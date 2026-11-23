import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNet } from "../../stores/net";

interface MainMenuProps {
  displayName: string;
  onEnter: () => void;
  onOpenMap: () => void;
  onOpenMeditation: () => void;
  onOpenPrayer: () => void;
  onLogout: () => void;
  focusPrayerOnMount?: boolean;
  onPrayerFocusRestored?: () => void;
}

export function MainMenu({ displayName, onEnter, onOpenMap, onOpenMeditation, onOpenPrayer, onLogout, focusPrayerOnMount = false, onPrayerFocusRestored }: MainMenuProps) {
  const { status, remoteIds } = useNet();
  const prayerButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!focusPrayerOnMount) return;
    prayerButtonRef.current?.focus();
    onPrayerFocusRestored?.();
  }, [focusPrayerOnMount, onPrayerFocusRestored]);
  const statusLabel = status === "in-region" ? "ĐÃ VÀO THẾ GIỚI" : status === "reconnecting" ? "ĐANG KẾT NỐI LẠI" : status === "error" ? "MẤT KẾT NỐI" : status === "connecting" ? "ĐANG KẾT NỐI KHU VỰC" : "ĐANG CHUẨN BỊ";
  const statusTone = status === "in-region" ? "is-online" : status === "error" ? "is-error" : "is-pending";
  return (
    <motion.main className="bw-main-menu" data-ui aria-label="Main menu"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .38 }}>
      <div className="bw-menu-atmosphere" aria-hidden="true">
        <span className="bw-menu-orbit bw-menu-orbit-one" />
        <span className="bw-menu-orbit bw-menu-orbit-two" />
        <span className="bw-menu-grain" />
      </div>
      <header className="bw-menu-header">
        <a className="bw-menu-brand" href="#world-menu" aria-label="Buddhist World">
          <span className="bw-menu-seal" aria-hidden="true"><span>法</span></span>
          <span><small>A LIVING WORLD OF STILLNESS</small><strong>BUDDHIST WORLD</strong></span>
        </a>
        <div className="bw-menu-account">
          <span className={`bw-menu-presence ${statusTone}`}><i className={`is-${status}`} /> {statusLabel} <span className="bw-menu-presence-count">· {remoteIds.length} KHÁCH ĐANG THAM QUAN</span></span>
          <span className="bw-menu-player" title={displayName}>{displayName}</span>
          <button type="button" className="bw-menu-logout" onClick={onLogout}>Đăng xuất <span aria-hidden="true">↗</span></button>
        </div>
      </header>

      <section className="bw-menu-content" id="world-menu">
        <div className="bw-menu-intro">
          <p className="bw-menu-eyebrow"><span /> HÀNH TRÌNH CỦA BẠN <span className="bw-menu-eyebrow-end">· 01 — 04</span></p>
          <h1>Một chốn an yên<br /><em>đang chờ bước chân.</em></h1>
          <p>Trở về khuôn viên chùa, khám phá những điểm dừng và dành một khoảng lặng cho chính mình.</p>
          <button type="button" className="bw-menu-primary" onClick={onEnter}>
            <span><small>BẮT ĐẦU KHÁM PHÁ</small><strong>TIẾP TỤC HÀNH TRÌNH</strong></span><b aria-hidden="true">↗</b>
          </button>
          <div className="bw-menu-principles" aria-label="Tinh thần thế giới">
            <span><i aria-hidden="true">✧</i> KHÁM PHÁ TỰ DO</span>
            <span><i aria-hidden="true">◌</i> KHÔNG GIAO TRANH</span>
            <span><i aria-hidden="true">☸</i> CHÍNH NIỆM</span>
          </div>
        </div>

        <nav className="bw-menu-destinations" aria-label="Điểm đến">
          <button type="button" className="bw-menu-destination" onClick={onOpenMap}>
            <span className="bw-destination-index">01 / KHÁM PHÁ</span>
            <span className="bw-destination-symbol" aria-hidden="true">⌖</span>
            <strong>Bản đồ khuôn viên</strong>
            <small>Xem các điểm mốc trong khu vực chùa</small>
            <span className="bw-destination-arrow" aria-hidden="true">↗</span>
          </button>
          <button type="button" className="bw-menu-destination" onClick={onOpenMeditation}>
            <span className="bw-destination-index">02 / TĨNH TÂM</span>
            <span className="bw-destination-symbol" aria-hidden="true">◉</span>
            <strong>Thiền định</strong>
            <small>Bắt đầu một khoảng lặng riêng tư</small>
            <span className="bw-destination-arrow" aria-hidden="true">↗</span>
          </button>
          <button ref={prayerButtonRef} type="button" className="bw-menu-destination" onClick={onOpenPrayer} aria-label="Mở niệm Phật">
            <span className="bw-destination-index">03 / CHÍNH NIỆM</span>
            <span className="bw-destination-symbol" aria-hidden="true">☸</span>
            <strong>Niệm Phật</strong>
            <small>Nghe bản niệm và ghi nhận thời khóa của bạn</small>
            <span className="bw-destination-arrow" aria-hidden="true">↗</span>
          </button>
        </nav>
      </section>

      <footer className="bw-menu-footer">
        <span>VIỆT NAM <i /> KHÔNG GIAN VĂN HÓA & TĨNH TÂM</span>
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / TOUCH TO EXPLORE</span>
      </footer>
    </motion.main>
  );
}
