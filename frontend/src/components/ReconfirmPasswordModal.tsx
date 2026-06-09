import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { reconfirmPassword } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  onVerified: () => Promise<void>;
}

/**
 * ReconfirmPasswordModal prompts the user to re-enter their current password
 * before performing a sensitive action (approve/reject candidate, publish
 * results, modify election phase, etc.).
 *
 * On successful password verification the backend re-issues the access token
 * with a `reconfirmed_at` timestamp valid for 10 minutes, then calls
 * `onVerified`.
 */
export function ReconfirmPasswordModal({
  open,
  onOpenChange,
  title = "Confirm Password",
  description = "This is a sensitive action. Please confirm your password to proceed.",
  actionLabel = "Confirm & Continue",
  onVerified,
}: Props) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!password.trim()) {
      setError("Password is required.");
      return;
    }

    setVerifying(true);
    setError("");

    try {
      const res = await reconfirmPassword(password);
      // Store the re-issued token
      if (res.access_token) {
        sessionStorage.setItem("collegevote-token", res.access_token);
      }
      toast.success(res.message || "Password confirmed.");
      setPassword("");
      onOpenChange(false);
      await onVerified();
    } catch (err: any) {
      setError(err.message || "Password confirmation failed.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-full bg-[#0F8A5F]/10 flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5 text-[#0F8A5F]" />
          </div>
          <div>
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription className="text-xs mt-0.5">
              {description}
            </DialogDescription>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              placeholder="Enter current password"
              className="pr-10"
              disabled={verifying}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {error && (
            <p className="text-xs text-destructive font-medium">{error}</p>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setPassword("");
                setError("");
              }}
              disabled={verifying}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90"
              onClick={handleConfirm}
              disabled={!password.trim() || verifying}
            >
              {verifying ? "Verifying..." : actionLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
