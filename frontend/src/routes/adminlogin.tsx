import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/adminlogin")({ component: AdminLogin });

function AdminLogin() {
  const nav = useNavigate();
  const [show, setShow] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1C2E] p-4">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-[#1F3A6E] flex items-center justify-center mb-4">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Election Administration Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Restricted access</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            nav({ to: "/admin-otp-verify" });
          }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-muted-foreground">College Email</label>
            <Input type="email" required placeholder="admin@college.edu.in" className="mt-1.5 h-11" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
            <div className="mt-1.5 flex">
              <span className="inline-flex items-center px-3 border border-r-0 border-border bg-muted rounded-l-md text-sm">+91</span>
              <Input type="tel" required placeholder="98765 43210" className="rounded-l-none h-11" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <div className="mt-1.5 relative">
              <Input type={show ? "text" : "password"} required className="pr-10 h-11" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full h-11 bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white">
            Login Securely
          </Button>
        </form>
        <p className="text-[11px] text-center text-muted-foreground mt-6">
          Access restricted to election committee members only
        </p>
      </div>
    </div>
  );
}
