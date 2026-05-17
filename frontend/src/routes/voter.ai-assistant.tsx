import { createFileRoute } from "@tanstack/react-router";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";

export const Route = createFileRoute("/voter/ai-assistant")({ component: Page });

function Page() {
  return <AIAssistantPanel />;
}
