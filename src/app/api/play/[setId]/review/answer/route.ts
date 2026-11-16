import { handle, readJson } from "@/server/http";
import { submitReview } from "@/server/quiz-service";
import { requireParticipation } from "@/server/session";

/** 재도전 답안 제출 */
export async function POST(request: Request, ctx: RouteContext<"/api/play/[setId]/review/answer">) {
  return handle(async () => {
    const { setId } = await ctx.params;
    const p = await requireParticipation(setId);
    const body = await readJson(request);
    return submitReview(p.id, body.deliveryId, body.optionId);
  });
}
