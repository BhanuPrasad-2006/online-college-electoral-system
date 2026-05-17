import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageLoader } from "@/components/PageLoader";
import { useCandidateProfile } from "@/hooks/use-election-data";

function Page() {
  const { data: profile, isPending } = useCandidateProfile();
  if (isPending || !profile) return <PageLoader />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your profile and preferences.</p>
      </div>
      <Card title="Account">
        <Field label="Full Name" value={profile.name} />
        <Field label="Email" value="priya.sharma@college.edu.in" />
        <Field label="Department" value={profile.department} />
        <Field label="Year" value={profile.year} />
      </Card>
      <Card title="Change Password" id="change-password">
        <Field label="Current Password" type="password" />
        <Field label="New Password" type="password" />
        <Field label="Confirm New Password" type="password" />
      </Card>
      <Card title="Notifications">
        {["Email alerts", "SMS alerts", "Election announcements"].map((l) => (
          <div key={l} className="flex items-center justify-between">
            <span className="text-sm">{l}</span>
            <Switch defaultChecked />
          </div>
        ))}
      </Card>
      <Button className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90">Save Changes</Button>
    </div>
  );
}

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="bg-card rounded-2xl shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, value, type = "text" }: { label: string; value?: string; type?: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input className="mt-1" defaultValue={value} type={type} />
    </div>
  );
}

export const Route = createFileRoute("/candidate/settings")({ component: Page });
