import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { DEFAULT_REGION_ID } from "@bw/shared";
import { useAuth } from "../stores/auth";
import { AuthScreen } from "../features/auth/AuthScreen";
import { GameCanvas } from "../game/GameCanvas";
import { HUD } from "../components/ui/HUD";
import { MainMenu } from "../components/ui/MainMenu";
import { WorldMapPanel } from "../components/ui/WorldMapPanel";
import { MeditationPanel } from "../components/ui/MeditationPanel";
import { PrayerPanel } from "../components/ui/PrayerPanel";
import { connect, disconnect } from "../game/multiplayer/socket";
import { setGameplayInputBlocked } from "../game/core/input";

type PlayerScreen = "menu" | "world" | "map" | "meditation" | "prayer";

export function App() {
  const { ready, user, init, logout } = useAuth();
  const [screen, setScreen] = useState<PlayerScreen>("menu");
  const [entryTransition, setEntryTransition] = useState(false);
  const [prayerReturnScreen, setPrayerReturnScreen] = useState<"menu" | "world">("menu");
  const [restorePrayerFocus, setRestorePrayerFocus] = useState(false);
  const openPrayerFromMenu = () => { setPrayerReturnScreen("menu"); setRestorePrayerFocus(false); setScreen("prayer"); };
  const openPrayerFromWorld = () => { setPrayerReturnScreen("world"); setScreen("prayer"); };
  const closePrayer = () => {
    if (prayerReturnScreen === "menu") setRestorePrayerFocus(true);
    setScreen(prayerReturnScreen);
  };
  useEffect(() => { void init(); }, [init]);
  useEffect(() => {
    if (!ready || !user) return;
    setEntryTransition(true);
    const timer = window.setTimeout(() => setEntryTransition(false), 2650);
    return () => window.clearTimeout(timer);
  }, [ready, user?.id]);
  useEffect(() => {
    if (!user) { setScreen("menu"); return; }
    connect(DEFAULT_REGION_ID);
    return () => disconnect();
  }, [user]);
  useEffect(() => {
    setGameplayInputBlocked(Boolean(user) && screen !== "world");
    return () => setGameplayInputBlocked(false);
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
      {entryTransition && <div className="bw-enter-world-transition" aria-hidden="true"><span>ENTERING BUDDHIST WORLD</span></div>}
      {(screen === "world" || (screen === "prayer" && prayerReturnScreen === "world")) && <HUD onOpenMenu={() => setScreen("menu")} onOpenPrayer={openPrayerFromWorld} />}
      <AnimatePresence mode="wait">
        {(screen === "menu" || (screen === "prayer" && prayerReturnScreen === "menu")) && <MainMenu key="menu" displayName={user.displayName ?? user.username}
          onEnter={() => setScreen("world")} onOpenMap={() => setScreen("map")}
          onOpenMeditation={() => setScreen("meditation")} onOpenPrayer={openPrayerFromMenu}
          onLogout={() => void signOut()} focusPrayerOnMount={restorePrayerFocus}
          onPrayerFocusRestored={() => setRestorePrayerFocus(false)} />}
        {screen === "map" && <WorldMapPanel key="map" onClose={() => setScreen("menu")} />}
        {screen === "meditation" && <MeditationPanel key="meditation" onClose={() => setScreen("menu")} />}
        {screen === "prayer" && <PrayerPanel key="prayer" userId={user.id} onClose={closePrayer} />}
      </AnimatePresence>
    </>
  );
}
