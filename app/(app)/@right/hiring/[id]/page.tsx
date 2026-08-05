import { getEvaluationForViewer } from "@/lib/evaluation/queries";
import { AdminControls } from "@/app/(app)/hiring/[id]/_ui/admin-controls";

// Management for an evaluation lives in the right rail, and is owner-only.
// Non-owners get nothing here (getEvaluationForViewer already gates the data).
export default async function HiringRight({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getEvaluationForViewer(id);
  if (!data || !data.isOwner) return null;
  const { ev, roster, panel, owners, createdBy } = data;

  return (
    <div key={id}>
      <AdminControls evaluation={ev} roster={roster} panel={panel}
        owners={owners} createdBy={createdBy} />
    </div>
  );
}
