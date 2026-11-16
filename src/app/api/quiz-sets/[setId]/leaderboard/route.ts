import { handle } from "@/server/http";
import { getLeaderboard } from "@/server/quiz-service";
import { requireParticipation } from "@/server/session";

/** 상위 5명 리더보드. 이 세트의 참여자만 볼 수 있다. */
export async function GET(_req: Request, ctx: RouteContext<"/api/quiz-sets/[setId]/leaderboard">) {
  return handle(async () => {
    const { setId } = await ctx.params;
    const p = await requireParticipation(setId);
    return getLeaderboard(setId, p.id);
  });
}
