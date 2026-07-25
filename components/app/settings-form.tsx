"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/lib/actions/profile";

export function SettingsForm({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(displayName);
  const [url, setUrl] = useState(avatarUrl ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setErr(null);
    setSaved(false);
    start(async () => {
      const res = await updateProfile({
        display_name: name,
        avatar_url: url ? url : null,
      });
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="display_name">Display name</Label>
        <Input
          id="display_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="avatar_url">Avatar URL (optional)</Label>
        <Input
          id="avatar_url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}
      <Button onClick={save} disabled={pending || !name}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
