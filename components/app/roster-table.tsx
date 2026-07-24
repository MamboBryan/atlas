"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function RosterTable({
  rows,
  isAdmin,
}: {
  rows: Row[];
  isAdmin: boolean;
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
    <div className="space-y-4">
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

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Email</th>
              <th className="p-2">Role</th>
              <th className="p-2">Status</th>
              {isAdmin && <th className="p-2 w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={isAdmin ? 5 : 4}
                  className="p-4 text-center text-muted-foreground"
                >
                  No members yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-medium">{r.display_name}</td>
                <td className="p-2 text-muted-foreground">{r.email}</td>
                <td className="p-2">
                  <Badge variant={r.role === "admin" ? "default" : "secondary"}>
                    {r.role}
                  </Badge>
                </td>
                <td className="p-2">
                  {r.is_active ? (
                    <Badge variant="secondary">active</Badge>
                  ) : (
                    <Badge variant="outline">inactive</Badge>
                  )}
                </td>
                {isAdmin && (
                  <td className="p-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="sm">
                            …
                          </Button>
                        }
                      />
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => toggleRole(r)}>
                          Make {r.role === "admin" ? "member" : "admin"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => deactivate(r)}>
                          Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
