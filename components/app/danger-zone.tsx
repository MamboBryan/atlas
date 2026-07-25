"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DangerZone() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-danger">
      <CardHeader>
        <CardTitle className="text-danger">Danger zone</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Sign out</p>
            <p className="text-xs text-muted-foreground">
              Sign out of your account on this device.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={<Button variant="destructive" size="sm">Sign out</Button>}
            />
            <DialogContent showCloseButton>
              <DialogHeader>
                <DialogTitle>Sign out?</DialogTitle>
                <DialogDescription>
                  You will be signed out of your account on this device.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton>
                <form action="/auth/sign-out" method="post">
                  <Button type="submit" variant="destructive" size="sm">
                    Yes, sign out
                  </Button>
                </form>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
