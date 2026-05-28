import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  Shield,
  Eye,
  EyeOff,
  Mail,
  Phone,
  Lock,
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import loginBg from "@/assets/login-bg.jpg";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Election Administration Portal — CollegeVote" },
      {
        name: "description",
        content:
          "Secure committee-only access to the CollegeVote election administration portal.",
      },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", phone: "", password: "" });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // TODO: replace this mock with your real FastAPI call
      // const res = await fetch("/api/auth/admin/login", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(form),
      // });
      await new Promise((r) => setTimeout(r, 900));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b1020] text-slate-100">
      {/* Hero background image */}
      <div className="pointer-events-none absolute inset-0">
        <img
          src={loginBg}
          alt=""
          aria-hidden="true"
          width={1920}
          height={1080}
          className="h-full w-full object-cover opacity-60"
        />
        {/* Gradient washes for contrast */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b1020]/95 via-[#0b1020]/70 to-[#0b1020]/95" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(99,102,241,0.35),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_75%,rgba(163,230,53,0.25),transparent_55%)]" />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        {/* Floating decorative blobs */}
        <div className="absolute left-[8%] top-[18%] h-24 w-24 rotate-12 rounded-2xl bg-gradient-to-br from-lime-300/40 to-emerald-500/10 blur-[1px] shadow-2xl shadow-lime-400/20 animate-[float_8s_ease-in-out_infinite]" />
        <div className="absolute right-[10%] top-[12%] h-16 w-16 -rotate-6 rounded-xl bg-gradient-to-br from-indigo-400/40 to-indigo-700/20 shadow-2xl shadow-indigo-500/30 animate-[float_10s_ease-in-out_infinite_reverse]" />
        <div className="absolute bottom-[15%] left-[14%] h-20 w-20 rotate-45 rounded-2xl border border-lime-300/30 bg-lime-300/5 backdrop-blur-sm animate-[float_12s_ease-in-out_infinite]" />
        <div className="absolute bottom-[20%] right-[8%] h-28 w-28 rounded-full border border-white/10 bg-white/[0.02] backdrop-blur-md animate-[float_14s_ease-in-out_infinite_reverse]" />

        {/* Sparkle accents */}
        <Sparkles className="absolute left-[42%] top-[8%] h-5 w-5 text-lime-300/60 animate-pulse" />
        <Sparkles className="absolute right-[28%] bottom-[12%] h-4 w-4 text-indigo-300/60 animate-pulse" />
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-18px) rotate(6deg); }
        }
      `}</style>

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10 lg:px-8">
        <div className="grid w-full gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Left panel — brand pitch */}
          <section className="hidden flex-col justify-between lg:flex">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-lime-300 to-emerald-400 text-slate-900 shadow-lg shadow-lime-500/20">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight">CollegeVote</div>
                <div className="text-xs text-slate-400">Election Admin Console</div>
              </div>
            </div>

            <div className="space-y-6">
              <h1 className="text-5xl font-bold leading-tight tracking-tight">
                Run a <span className="text-lime-300">fair</span>,{" "}
                <span className="text-lime-300">transparent</span> election.
              </h1>
              <p className="max-w-md text-slate-300">
                Restricted committee access to manage elections, monitor live turnout, and review
                AI-powered fraud signals — all in one place.
              </p>
              <ul className="space-y-3 text-sm text-slate-300">
                {[
                  "End-to-end encrypted ballots",
                  "Real-time analytics & audit trail",
                  "AI anomaly detection",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-lime-300" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-6 text-xs text-slate-400">
              <span>© {new Date().getFullYear()} CollegeVote</span>
              <a href="#" className="hover:text-lime-300">Privacy</a>
              <a href="#" className="hover:text-lime-300">Security</a>
            </div>
          </section>

          {/* Right panel — glass login card */}
          <section className="flex items-center justify-center">
            <div className="relative w-full max-w-md">
              <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-lime-300/60 via-indigo-400/30 to-transparent blur-[2px]" />
              <div className="relative rounded-3xl border border-white/10 bg-white/[0.06] p-8 backdrop-blur-2xl shadow-[0_30px_80px_-20px_rgba(2,6,23,0.8)]">
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl bg-lime-300/40 blur-xl" />
                    <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 ring-1 ring-white/20">
                      <Shield className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <h1 className="mt-5 text-2xl font-bold tracking-tight">
                    Election Administration Portal
                  </h1>
                  <p className="mt-1 text-sm text-slate-400">
                    Restricted access — committee members only
                  </p>
                </div>

                <form onSubmit={onSubmit} className="mt-7 space-y-4">
                  <Field
                    label="College Email"
                    icon={<Mail className="h-4 w-4" />}
                    type="email"
                    placeholder="admin@college.edu.in"
                    value={form.email}
                    onChange={(v) => setForm({ ...form, email: v })}
                    required
                  />

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Phone Number
                    </label>
                    <div className="flex items-stretch gap-2">
                      <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-medium text-slate-200">
                        <Phone className="h-4 w-4 text-lime-300" />
                        +91
                      </div>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="98765 43210"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-lime-300/60 focus:bg-white/[0.08] focus:ring-2 focus:ring-lime-300/20"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Password
                      </label>
                      <a href="#" className="text-xs text-lime-300 hover:underline">
                        Forgot?
                      </a>
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-10 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-lime-300/60 focus:bg-white/[0.08] focus:ring-2 focus:ring-lime-300/20"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-lime-300"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-lime-300 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-lime-500/20 transition hover:shadow-lime-400/40 disabled:opacity-70"
                  >
                    <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-700 group-hover:translate-x-full" />
                    {loading ? "Verifying…" : "Login Securely"}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </button>

                  <div className="flex items-center justify-center gap-2 pt-2 text-xs text-slate-400">
                    <Shield className="h-3.5 w-3.5 text-lime-300" />
                    Access restricted to election committee members only
                  </div>
                </form>
              </div>

              <p className="mt-6 text-center text-xs text-slate-500">
                Not an admin?{" "}
                <a href="#" className="text-lime-300 hover:underline">
                  Go to voter login
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  icon,
  type,
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string;
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-10 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-lime-300/60 focus:bg-white/[0.08] focus:ring-2 focus:ring-lime-300/20"
        />
      </div>
    </div>
  );
}
