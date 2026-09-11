import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicConfig } from "@campusimi/shared";
import { api } from "./api.js";

const ConfigContext = createContext<PublicConfig | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    api.get<PublicConfig>("/config").then(setConfig).catch(() => setConfig(null));
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export function useConfig(): PublicConfig | null {
  return useContext(ConfigContext);
}
