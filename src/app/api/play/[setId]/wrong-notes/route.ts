import { handle } from "@/server/http";
import { getWrongNotes } from "@/server/quiz-service";
import { requireParticipation } from "@/server/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/play/[setId]/wrong-notes">) {
  return handle(async () => {
    const { setId } = await ctx.params;
    const p = await requireParticipation(setId);
    return getWrongNotes(p.id);
  });
}
