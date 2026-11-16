import { handle } from "@/server/http";
import { getResult } from "@/server/quiz-service";
import { requireParticipation } from "@/server/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/play/[setId]/result">) {
  return handle(async () => {
    const { setId } = await ctx.params;
    const p = await requireParticipation(setId);
    return getResult(p.id);
  });
}
