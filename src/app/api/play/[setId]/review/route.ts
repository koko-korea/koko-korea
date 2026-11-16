import { handle, readJson } from "@/server/http";
import { startReview } from "@/server/quiz-service";
import { requireParticipation } from "@/server/session";

/** 오답 개념 재도전 문항 받기 */
export async function POST(request: Request, ctx: RouteContext<"/api/play/[setId]/review">) {
  return handle(async () => {
    const { setId } = await ctx.params;
    const p = await requireParticipation(setId);
    const body = await readJson(request);
    return startReview(p.id, body.conceptId);
  });
}
