import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";

export type Role = "voter" | "candidate" | "admin" | null;
export type AdminRole = "SUPER_ADMIN" | "ELECTION_MANAGER" | "CANDIDATE_MODERATOR" | "AUDIT_SECURITY_ADMIN" | null;

const AUTH_STORAGE_KEY = "collegevote-demo-auth";
const TOKEN_STORAGE_KEY = "collegevote-token";
const SESSION_KEYS_TO_CLEAR = [
  AUTH_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  "collegevote-otp-session",
  "collegevote-otp-email",
  "collegevote-otp-mobile",
  "collegevote-user-id",
  "collegevote-full-name",
  "collegevote-department",
  "collegevote-semester",
];

type Ctx = {
  role: Role;
  adminRole: AdminRole;
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
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!token) return null;

    const [, payloadPart] = token.split(".");
    if (!payloadPart) return null;

    const payload = JSON.parse(window.atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload?.exp !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

    if (raw === "voter" || raw === "candidate" || raw === "admin") return raw;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

function readStoredAdminRole(): AdminRole {
  if (typeof window === "undefined") return null;
  try {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return null;

    const [, payloadPart] = token.split(".");
    if (!payloadPart) return null;

    const payload = JSON.parse(window.atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload?.exp !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return payload.admin_role || null;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(null);
  const [adminRole, setAdminRole] = useState<AdminRole>(null);
  const [candidateRegistered, setCandidateRegistered] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const stored = readStoredRole();
    if (stored) {
      setRole(stored);
      setAdminRole(readStoredAdminRole());
    }
    setAuthReady(true);

    // Initialize device fingerprint as early as possible on app mount
    if (typeof window !== "undefined" && !sessionStorage.getItem("collegevote-fingerprint")) {
      import("../lib/device-fingerprint").then((mod) =>
        mod
          .getDeviceFingerprint()
          .then((fp) => sessionStorage.setItem("collegevote-fingerprint", fp)),
      );
    }
  }, []);

  const login = useCallback((r: Exclude<Role, null>) => {
    setRole(r);
    setAdminRole(readStoredAdminRole());
    try {
      sessionStorage.setItem(AUTH_STORAGE_KEY, r);
      // Initialize device fingerprint if not already stored
      if (!sessionStorage.getItem("collegevote-fingerprint")) {
        import("../lib/device-fingerprint").then((mod) =>
          mod
            .getDeviceFingerprint()
            .then((fp) => sessionStorage.setItem("collegevote-fingerprint", fp)),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const logout = useCallback(() => {
    setRole(null);
    setAdminRole(null);
    try {
      for (const key of SESSION_KEYS_TO_CLEAR) {
        sessionStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      role,
      adminRole,
      setRole,
      isAuthed: role !== null,
      authReady,
      login,
      logout,
      candidateRegistered,
      setCandidateRegistered,
    }),
    [role, adminRole, authReady, login, logout, candidateRegistered, setCandidateRegistered],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
