"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { NewPollForm } from "@/components/polls/new-poll-form";
import { useSheetParam } from "@/lib/hooks/use-sheet-param";

export function NewPollTrigger() {
  const { open, setOpen } = useSheetParam("new", "poll");
  return (
    <>
      <Button variant="default" onClick={() => setOpen(true)}>
        New poll
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader
            title="New poll"
            description="Ask your team something worth answering."
          />
          <NewPollForm onDone={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
