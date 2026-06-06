import { useEffect, useRef, useState } from "react";

interface SSRRecaptchaProps {
  onChange: (token: string | null) => void;
  onExpired?: () => void;
  recaptchaRef?: React.RefObject<{ reset: () => void } | null>;
}

// Google test site key — always passes (use for dev)
const TEST_SITE_KEY = "6LeIxAcTAAAAAJcZVRqyTRR7Kg3J-RqyPG6J4B1Y";
const LOAD_TIMEOUT_MS = 15_000;

/**
 * SSR-safe Google reCAPTCHA widget using direct DOM rendering.
 * Bypasses react-google-recaptcha npm package (React 19 incompatible).
 * Uses explicit rendering via grecaptcha.render().
 */
export function SSRRecaptcha({ onChange, onExpired, recaptchaRef }: SSRRecaptchaProps) {
  const [mounted, setMounted] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const changeRef = useRef(onChange);
  const expiredRef = useRef(onExpired);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callback refs current without re-creating the widget
  changeRef.current = onChange;
  expiredRef.current = onExpired;

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || TEST_SITE_KEY;

  // Mark as mounted after first client render (SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Expose a reset() method on the forwarded ref
  useEffect(() => {
    if (recaptchaRef) {
      const ref = recaptchaRef as React.MutableRefObject<{ reset: () => void } | null>;
      ref.current = {
        reset: () => {
          if (widgetIdRef.current !== null && typeof window !== "undefined") {
            try {
              (window as any).grecaptcha?.reset(widgetIdRef.current);
            } catch {
              // grecaptcha may not be loaded yet
            }
          }
        },
      };
      return () => {
        ref.current = null;
      };
    }
  }, [recaptchaRef]);

  // Load reCAPTCHA API script and render the widget
  useEffect(() => {
    if (!mounted) return;

    const win = window as any;
    setLoadError(false);
    let isCurrent = true;
    let hasRendered = false;

    function renderWidget() {
      if (!isCurrent || hasRendered) return;
      if (!win.grecaptcha?.render || !containerRef.current) return;
      if (!document.body.contains(containerRef.current)) return;
      try {
        widgetIdRef.current = win.grecaptcha.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            if (isCurrent) changeRef.current(token);
          },
          "expired-callback": () => {
            if (isCurrent) {
              changeRef.current(null);
              expiredRef.current?.();
            }
          },
        });
        hasRendered = true;
      } catch (err) {
        console.error("[SSRRecaptcha] render error:", err);
      }
    }

    if (win.grecaptcha?.render) {
      renderWidget();
      return;
    }

    // Set up global callback queue
    if (!win.onRecaptchaLoadQueue) {
      win.onRecaptchaLoadQueue = [];
      win.onRecaptchaLoad = () => {
        if (win.onRecaptchaLoadQueue) {
          win.onRecaptchaLoadQueue.forEach((cb: () => void) => cb());
          delete win.onRecaptchaLoadQueue;
        }
      };
    }

    // Add this component's renderer to the queue
    win.onRecaptchaLoadQueue.push(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      renderWidget();
    });

    // Start a timeout to detect load failures
    timeoutRef.current = setTimeout(() => {
      if (isCurrent && !scriptLoaded(win)) {
        console.warn("[SSRRecaptcha] reCAPTCHA script load timed out.");
        setLoadError(true);
      }
    }, LOAD_TIMEOUT_MS);

    // Inject the script tag if not already injected
    let script = document.getElementById("recaptcha-script-tag") as HTMLScriptElement;
    if (!script) {
      script = document.createElement("script");
      script.id = "recaptcha-script-tag";
      script.src = "https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoad&render=explicit";
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        console.error("[SSRRecaptcha] Failed to load reCAPTCHA script.");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (isCurrent) setLoadError(true);
      };
      document.head.appendChild(script);
    }

    return () => {
      isCurrent = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // Remove from callback queue if still pending
      if (win.onRecaptchaLoadQueue) {
        win.onRecaptchaLoadQueue = win.onRecaptchaLoadQueue.filter((cb: any) => cb !== renderWidget);
      }
    };
  }, [mounted, siteKey]);

  // --- SSR / Initial placeholder ---
  if (!mounted) {
    return (
      <div
        className="w-[304px] h-[78px] mx-auto bg-muted/10 border border-border/60 rounded-lg flex items-center justify-center text-xs text-muted-foreground/60"
        data-recaptcha-state="placeholder"
      >
        Loading CAPTCHA security...
      </div>
    );
  }

  // --- Load error state ---
  if (loadError) {
    return (
      <div
        className="w-full mx-auto bg-destructive/5 border border-destructive/30 rounded-lg flex items-center justify-center text-xs text-destructive/80 text-center leading-relaxed p-3"
        data-recaptcha-state="error"
      >
        Unable to load security check. Please refresh the page or try again later.
      </div>
    );
  }

  // --- Client-side widget container ---
  return (
    <div className="flex justify-center my-3" data-recaptcha-state="ready">
      <div ref={containerRef} />
    </div>
  );
}

function scriptLoaded(win: any): boolean {
  return !!win.grecaptcha?.render;
}
