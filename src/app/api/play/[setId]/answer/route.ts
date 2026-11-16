import { handle, readJson } from "@/server/http";
import { submitAnswer } from "@/server/quiz-service";
import { requireParticipation } from "@/server/session";

/** 답안 제출. 클라이언트는 선택지 ID만 보내고, 채점·점수·시간 판정은 서버가 한다. */
export async function POST(request: Request, ctx: RouteContext<"/api/play/[setId]/answer">) {
  return handle(async () => {
    const { setId } = await ctx.params;
    const p = await requireParticipation(setId);
    const body = await readJson(request);
    return submitAnswer(p.id, body.deliveryId, body.optionId);
  });
}
