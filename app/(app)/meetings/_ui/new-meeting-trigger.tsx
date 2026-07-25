"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { NewMeetingForm } from "@/components/meetings/new-meeting-form";
import { useSheetParam } from "@/lib/hooks/use-sheet-param";

export function NewMeetingTrigger({
  defaultTimezone,
}: {
  defaultTimezone: string;
}) {
  const { open, setOpen } = useSheetParam("new", "meeting");
  return (
    <>
      <Button variant="default" onClick={() => setOpen(true)}>
        New meeting
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader
            title="New meeting"
            description="Schedule a ritual for your team."
          />
          <NewMeetingForm
            defaultTimezone={defaultTimezone}
            onDone={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
