import { handle, readJson } from "@/server/http";
import { joinQuiz } from "@/server/quiz-service";
import { currentParticipation, setParticipationCookie } from "@/server/session";
import { allowRequest, clientKey } from "@/server/rate-limit";
import { AppError } from "@/server/errors";

/** 닉네임으로 참여한다. 이 브라우저에 이미 참여 기록이 있으면 그 참여를 이어간다. */
export async function POST(request: Request, ctx: RouteContext<"/api/quiz-sets/[setId]/participations">) {
  return handle(async () => {
    const { setId } = await ctx.params;
    const existing = await currentParticipation(setId);
    if (existing) return { nickname: existing.nickname, status: existing.status, resumed: true };

    if (!allowRequest(`join:${clientKey(request)}`, 20, 60_000)) {
      throw new AppError(429, "RATE_LIMITED", "참여 요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.");
    }
    const body = await readJson(request);
    const { token, nickname } = joinQuiz(setId, body.nickname);
    await setParticipationCookie(setId, token);
    return { nickname, status: "in_progress", resumed: false };
  });
}
