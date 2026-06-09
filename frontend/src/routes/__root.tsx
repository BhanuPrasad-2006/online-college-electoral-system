import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/context/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center premium-bg px-4">
      <div className="max-w-md text-center animate-fade-in-up">
        <h1 className="text-7xl font-extrabold text-[#1F2937]">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-[#1F2937]">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or was moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-[#0F8A5F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0F8A5F]/90 transition-all hover:-translate-y-0.5"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center premium-bg px-4">
      <div className="max-w-md text-center animate-fade-in-up bg-white/80 backdrop-blur-lg rounded-xl border border-border/60 p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[#1F2937]">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-lg bg-[#0F8A5F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0F8A5F]/90 transition-all active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DSCE Balloty — Secure AI-Based College Election Management" },
      {
        name: "description",
        content:
          "Secure AI-based college election management system with voter, candidate, and admin portals.",
      },
      {
        // TODO: For production deployment, add the actual backend domain(s) to connect-src
        // e.g., "https://backend.railway.app https://api.render.com"
        httpEquiv: "Content-Security-Policy",
        content: [
          "default-src 'self';",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/;",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;",
          "font-src 'self' https://fonts.gstatic.com data:;",
          "img-src 'self' data: blob:;",
          "connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 https://localhost:8000 https://127.0.0.1:8000;",
          "frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/;",
          "frame-ancestors 'none';",
          "base-uri 'self';",
          "form-action 'self';",
        ].join(" "),
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppLayout />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
