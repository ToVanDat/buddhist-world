import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { DEFAULT_REGION_ID } from "@bw/shared";
import { useAuth } from "../stores/auth";
import { AuthScreen } from "../features/auth/AuthScreen";
import { GameCanvas } from "../game/GameCanvas";
import { HUD } from "../components/ui/HUD";
import { MainMenu } from "../components/ui/MainMenu";
import { WorldMapPanel } from "../components/ui/WorldMapPanel";
import { connect, disconnect } from "../game/multiplayer/socket";
import { setGameplayInputBlocked } from "../game/core/input";

type PlayerScreen = "menu" | "world" | "map";

export function App() {
  const { ready, user, init, logout } = useAuth();
  const [screen, setScreen] = useState<PlayerScreen>("menu");
  useEffect(() => { void init(); }, [init]);
  useEffect(() => {
    if (!user) { setScreen("menu"); return; }
    connect(DEFAULT_REGION_ID);
    return () => disconnect();
  }, [user]);
  useEffect(() => {
    setGameplayInputBlocked(Boolean(user) && screen !== "world", "app-shell");
    return () => setGameplayInputBlocked(false, "app-shell");
  }, [user, screen]);

  if (!ready) return <div className="boot">Đang mở cổng chùa…</div>;
  if (!user) return <AuthScreen />;

  async function signOut() {
    disconnect();
    await logout();
    setScreen("menu");
  }

  return (
    <>
      <GameCanvas />
      {screen === "world" && <HUD onOpenMenu={() => setScreen("menu")} />}
      <AnimatePresence mode="wait">
        {screen === "menu" && <MainMenu key="menu" displayName={user.displayName ?? user.username}
          onEnter={() => setScreen("world")} onOpenMap={() => setScreen("map")}
          onLogout={() => void signOut()} />}
        {screen === "map" && <WorldMapPanel key="map" onClose={() => setScreen("menu")} />}
      </AnimatePresence>
    </>
  );
}
