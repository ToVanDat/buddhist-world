import { useEffect } from "react";
import { DEFAULT_REGION_ID } from "@bw/shared";
import { useAuth } from "../stores/auth";
import { AuthScreen } from "../features/auth/AuthScreen";
import { GameCanvas } from "../game/GameCanvas";
import { HUD } from "../components/ui/HUD";
import { connect, disconnect } from "../game/multiplayer/socket";

export function App() {
  const { ready, user, init } = useAuth();
  useEffect(() => { void init(); }, [init]);
  useEffect(() => {
    if (!user) return;
    connect(DEFAULT_REGION_ID);
    return () => disconnect();
  }, [user]);

  if (!ready) return <div className="boot">Đang mở cổng chùa…</div>;
  if (!user) return <AuthScreen />;
  return (<><GameCanvas /><HUD /></>);
}
