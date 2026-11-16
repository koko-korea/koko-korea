import { handle } from "@/server/http";
import { getPlayState } from "@/server/quiz-service";
import { requireParticipation } from "@/server/session";

/** 현재 문항(정답 제외)과 진행 상태 */
export async function GET(_req: Request, ctx: RouteContext<"/api/play/[setId]/state">) {
  return handle(async () => {
    const { setId } = await ctx.params;
    const p = await requireParticipation(setId);
    return getPlayState(p.id);
  });
}
