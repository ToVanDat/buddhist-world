import { motion } from "framer-motion";
import { useNet } from "../../stores/net";

interface MainMenuProps {
  displayName: string;
  onEnter: () => void;
  onOpenMap: () => void;
  onOpenMeditation: () => void;
  onLogout: () => void;
}

export function MainMenu({ displayName, onEnter, onOpenMap, onOpenMeditation, onLogout }: MainMenuProps) {
  const { status, remoteIds } = useNet();
  const statusLabel = status === "in-region" ? "ĐÃ VÀO THẾ GIỚI" : status === "reconnecting" ? "ĐANG KẾT NỐI LẠI" : status === "error" ? "MẤT KẾT NỐI" : status === "connecting" ? "ĐANG KẾT NỐI KHU VỰC" : "ĐANG CHUẨN BỊ";
  return (
    <motion.main className="bw-main-menu" data-ui aria-label="Main menu"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .28 }}>
      <div className="bw-menu-atmosphere" aria-hidden="true" />
      <header className="bw-menu-header">
        <a className="bw-menu-brand" href="#world-menu" aria-label="Buddhist World">
          <span className="bw-menu-seal" aria-hidden="true">法</span>
          <span><small>A LIVING WORLD OF STILLNESS</small><strong>BUDDHIST WORLD</strong></span>
        </a>
        <div className="bw-menu-account">
          <span className="bw-menu-presence"><i className={`is-${status}`} /> {statusLabel} · {remoteIds.length} NGƯỜI Ở GẦN</span>
          <span className="bw-menu-player">{displayName}</span>
          <button type="button" className="bw-menu-logout" onClick={onLogout}>Đăng xuất</button>
        </div>
      </header>

      <section className="bw-menu-content" id="world-menu">
        <div className="bw-menu-intro">
          <p className="bw-menu-eyebrow"><span /> HÀNH TRÌNH CỦA BẠN</p>
          <h1>Một chốn an yên<br /><em>đang chờ bước chân.</em></h1>
          <p>Trở về khuôn viên chùa, khám phá những điểm dừng và dành một khoảng lặng cho chính mình.</p>
          <button type="button" className="bw-menu-primary" onClick={onEnter}>
            <span>TIẾP TỤC HÀNH TRÌNH</span><b aria-hidden="true">↗</b>
          </button>
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
        </nav>
      </section>

      <footer className="bw-menu-footer">
        <span>VIỆT NAM · A WORLD WITHOUT COMBAT</span>
        <span>WASD / TOUCH TO EXPLORE</span>
      </footer>
    </motion.main>
  );
}
