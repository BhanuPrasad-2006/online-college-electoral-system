import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

function Page() {
  const [positions, setPositions] = useState(["President", "Vice President", "General Secretary"]);
  const [newPos, setNewPos] = useState("");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Election Control</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure and operate the active election.</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Create / Edit Election</h2>
        <Field label="Election Title"><Input defaultValue="Student Council Election 2025" /></Field>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Positions</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {positions.map((p) => (
              <Badge key={p} variant="outline" className="gap-1 pr-1">
                {p}
                <button onClick={() => setPositions((arr) => arr.filter((x) => x !== p))}><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input value={newPos} onChange={(e) => setNewPos(e.target.value)} placeholder="Add position" />
            <Button variant="outline" onClick={() => { if (newPos) { setPositions((p) => [...p, newPos]); setNewPos(""); } }}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Registration Opens"><Input type="datetime-local" /></Field>
          <Field label="Registration Closes"><Input type="datetime-local" /></Field>
          <Field label="Voting Opens"><Input type="datetime-local" /></Field>
          <Field label="Voting Closes"><Input type="datetime-local" /></Field>
        </div>
        <Button className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90" onClick={() => toast.success("Election saved")}>Create Election</Button>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Current Election Status</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Row k="Phase" v={<Badge>Pre-Voting</Badge>} />
          <Row k="Voting opens" v="Nov 12, 09:00" />
          <Row k="Voting closes" v="Nov 12, 17:00" />
          <Row k="Approved candidates" v="3" />
        </div>
        <div className="flex gap-2 flex-wrap pt-3">
          <Button variant="outline" onClick={() => toast.success("Voting opened")}>Open Voting Now</Button>
          <Button variant="outline" onClick={() => toast.success("Voting closed")}>Close Voting Now</Button>
          <Button className="bg-[#6C63FF] text-white hover:bg-[#6C63FF]/90" onClick={() => toast.success("Result computation initiated")}>Initiate Result Computation</Button>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs break-all">
          <span className="text-muted-foreground">SHA-256 Integrity Hash: </span>
          a3f1e9b87c4d2e1a5f6b9c8d7e2a1f4b3c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between p-3 bg-muted/40 rounded-lg">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

export const Route = createFileRoute("/admin/election")({ component: Page });
