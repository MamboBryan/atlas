import { PromptForm } from "@/components/prompts/prompt-form";

export default function NewPollPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New poll</h1>
      <PromptForm />
    </div>
  );
}
