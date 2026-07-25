"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { NewSeriesForm } from "@/components/series/new-series-form";
import { useSheetParam } from "@/lib/hooks/use-sheet-param";

type RosterRow = { id: string; display_name: string };

export function NewSeriesTrigger({
  roster,
  defaultTimezone,
}: {
  roster: RosterRow[];
  defaultTimezone: string;
}) {
  const { open, setOpen } = useSheetParam("new", "series");
  return (
    <>
      <Button variant="default" onClick={() => setOpen(true)}>
        New series
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader
            title="New series"
            description="Set up a recurring meeting ritual for your team."
          />
          <NewSeriesForm
            roster={roster}
            defaultTimezone={defaultTimezone}
            onDone={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
