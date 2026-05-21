import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "voter" | "candidate" | "admin" | null;

const AUTH_STORAGE_KEY = "collegevote-demo-auth";

type Ctx = {
  role: Role;
  setRole: (r: Role) => void;
  isAuthed: boolean;
  login: (r: Exclude<Role, null>) => void;
  logout: () => void;
  candidateRegistered: boolean;
  setCandidateRegistered: (v: boolean) => void;
  authReady: boolean;
};

const AuthContext = createContext<Ctx | null>(null);

function readStoredRole(): Role {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (raw === "voter" || raw === "candidate" || raw === "admin") return raw;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(null);
  const [candidateRegistered, setCandidateRegistered] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const stored = readStoredRole();
    if (stored) setRole(stored);
    setAuthReady(true);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        role,
        setRole,
        isAuthed: role !== null,
        authReady,
        login: (r) => {
          setRole(r);
          try {
            sessionStorage.setItem(AUTH_STORAGE_KEY, r);
          } catch {
            /* ignore */
          }
        },
        logout: () => {
          setRole(null);
          try {
            sessionStorage.removeItem(AUTH_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        },
        candidateRegistered,
        setCandidateRegistered,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
