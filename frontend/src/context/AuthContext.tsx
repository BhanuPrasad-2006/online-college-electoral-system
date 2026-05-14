import { createContext, useContext, useState, type ReactNode } from "react";

export type Role = "voter" | "candidate" | "admin" | null;

type Ctx = {
  role: Role;
  setRole: (r: Role) => void;
  isAuthed: boolean;
  login: (r: Exclude<Role, null>) => void;
  logout: () => void;
  candidateRegistered: boolean;
  setCandidateRegistered: (v: boolean) => void;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(null);
  const [candidateRegistered, setCandidateRegistered] = useState(false);
  return (
    <AuthContext.Provider
      value={{
        role,
        setRole,
        isAuthed: role !== null,
        login: (r) => setRole(r),
        logout: () => setRole(null),
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
