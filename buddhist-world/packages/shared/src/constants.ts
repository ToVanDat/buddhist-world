/** Hằng số dùng chung client/server. Đơn vị: mét, giây. */
export const TICK_RATE_HZ = 10;            // server gửi snapshot
export const CLIENT_SEND_HZ = 15;          // client gửi trạng thái tối đa
export const INTEREST_RADIUS_M = 80;       // chỉ gửi người chơi trong bán kính này
export const MAX_HORIZONTAL_SPEED = 8;     // chạy 6 m/s + dung sai
export const MAX_VERTICAL_SPEED = 14;      // nhảy / rơi
export const SPEED_TOLERANCE = 1.35;       // dung sai mạng
export const CHAT_MAX_LEN = 200;
export const ANIMATIONS = ["idle", "walk", "run", "jump"] as const;
