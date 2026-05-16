import { useEffect, useState } from "react";

/** Avoid SSR/client mismatch when reading sessionStorage for auth. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
