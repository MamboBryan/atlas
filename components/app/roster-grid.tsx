"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  addMemberAction,
  deactivateAction,
  setRoleAction,
} from "@/lib/actions/roster";

type Row = {
  id: string;
  display_name: string;
  email: string;
  role: "admin" | "member";
  is_active: boolean;
};

export function RosterGrid({
  rows,
  isAdmin,
  currentUserId,
}: {
  rows: Row[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submitInvite() {
    setErr(null);
    start(async () => {
      const res = await addMemberAction({ email, display_name: name });
      if (!res.ok) {
        setErr(res.error.message);
        return;
      }
      setAddOpen(false);
      setEmail("");
      setName("");
      router.refresh();
    });
  }

  function toggleRole(row: Row) {
    start(async () => {
      await setRoleAction({
        user_id: row.id,
        role: row.role === "admin" ? "member" : "admin",
      });
      router.refresh();
    });
  }

  function deactivate(row: Row) {
    start(async () => {
      await deactivateAction({ user_id: row.id });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button>Add member</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add member</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              {err && <p className="text-sm text-red-500">{err}</p>}
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setAddOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                onClick={submitInvite}
                disabled={pending || !email || !name}
              >
                {pending ? "Inviting…" : "Send invite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {rows.length === 0 ? (
        <EmptyState sticker="empty-box" headline="No members yet" body="Add the first team member to get started." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <Card key={m.id} interactive>
              <CardHeader>
                <CardTitle>
                  <Link
                    href={`/roster/${m.id}` as never}
                    className="hover:underline"
                  >
                    {m.display_name}
                    {m.id === currentUserId && (
                      <span className="ml-2 text-xs font-normal text-ink-soft">
                        (you)
                      </span>
                    )}
                  </Link>
                </CardTitle>
                <CardDescription>
                  {m.role}
                  {!m.is_active && (
                    <span className="ml-2 text-ink-faint">&middot; inactive</span>
                  )}
                </CardDescription>
                <CardAction>
                  <div className="grid size-12 place-items-center rounded-full bg-primary text-primary-ink font-display font-extrabold text-sm">
                    {m.display_name.slice(0, 2).toUpperCase()}
                  </div>
                </CardAction>
              </CardHeader>
              {isAdmin && m.id !== currentUserId && (
                <div className="flex gap-2 px-5 pb-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleRole(m)}
                    disabled={pending}
                  >
                    Make {m.role === "admin" ? "member" : "admin"}
                  </Button>
                  {m.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deactivate(m)}
                      disabled={pending}
                    >
                      Deactivate
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
