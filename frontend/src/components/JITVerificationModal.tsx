import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck } from "lucide-react";

export function JITVerificationModal({
  open,
  onOpenChange,
  onVerified,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onVerified: () => void;
}) {
  const [val, setVal] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center text-center pt-2">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Identity Verification</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            To proceed to voting, enter the Student ID printed on your physical college ID card.
          </p>
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="e.g. CS2021001"
            className="mt-5 text-center text-base h-12"
          />
          <p className="text-xs text-warning-foreground/80 mt-2">3 failed attempts will lock your session.</p>
          <div className="flex gap-3 w-full mt-6">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={val.length < 4} onClick={onVerified}>
              Verify & Proceed
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
