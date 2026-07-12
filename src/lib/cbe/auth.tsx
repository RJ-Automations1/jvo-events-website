/**
 * CBE auth context — holds the signed-in user and exposes login/logout. The
 * token lives in localStorage (see api.ts); on mount we validate it against
 * /me so a refresh keeps the session. A global "cbe-unauthorized" event (fired
 * by the API client on any 401) clears the user so guarded routes redirect.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken, type User, type Program } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  programs: Program[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function CbeAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMeta = useCallback(async () => {
    try {
      const meta = await api<{ programs: Program[] }>("/meta");
      setPrograms(meta.programs);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await loadMeta();
      if (getToken()) {
        try {
          const { user } = await api<{ user: User }>("/me");
          if (alive) setUser(user);
        } catch {
          setToken(null);
        }
      }
      if (alive) setLoading(false);
    })();
    const onUnauthorized = () => setUser(null);
    window.addEventListener("cbe-unauthorized", onUnauthorized);
    return () => {
      alive = false;
      window.removeEventListener("cbe-unauthorized", onUnauthorized);
    };
  }, [loadMeta]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api<{ token: string; user: User }>("/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(token);
    setUser(user);
  }, []);

  const logout = useCallback(() => {
    api("/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, programs, login, logout }),
    [user, loading, programs, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCbeAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useCbeAuth must be used within CbeAuthProvider");
  return ctx;
}
