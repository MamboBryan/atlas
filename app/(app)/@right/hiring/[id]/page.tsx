import { getEvaluationForViewer } from "@/lib/evaluation/queries";
import { AdminControls } from "@/app/(app)/hiring/[id]/_ui/admin-controls";

// Admin management for an evaluation lives in the right rail. Non-admins get
// nothing here (getEvaluationForViewer already gates admin data).
export default async function HiringRight({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getEvaluationForViewer(id);
  if (!data || !data.isAdmin) return null;
  const { ev, roster, panel } = data;

  return (
    <div key={id}>
      <AdminControls evaluation={ev} roster={roster} panel={panel} />
    </div>
  );
}
