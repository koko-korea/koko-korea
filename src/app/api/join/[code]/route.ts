import { handle } from "@/server/http";
import { findQuizByCode } from "@/server/quiz-service";
import { currentParticipation } from "@/server/session";
import { notFound } from "@/server/errors";
import type { JoinInfo } from "@/lib/api-types";

/** 참여 코드로 퀴즈 정보와, 이 브라우저의 기존 참여 여부를 확인한다. */
export async function GET(_req: Request, ctx: RouteContext<"/api/join/[code]">) {
  return handle(async (): Promise<JoinInfo> => {
    const { code } = await ctx.params;
    const quiz = findQuizByCode(code);
    if (!quiz) throw notFound("참여 코드를 다시 확인해 주세요.");
    const p = await currentParticipation(quiz.id);
    return { quiz, existing: p ? { nickname: p.nickname, status: p.status } : null };
  });
}
