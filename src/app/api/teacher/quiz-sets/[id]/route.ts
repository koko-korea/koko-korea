import { handle, readJson } from "@/server/http";
import { requireTeacher } from "@/server/teacher-session";
import { getQuizSetDetail, saveQuizContent } from "@/server/teacher-service";

/** 세트 상세(문항 포함, 정답 포함 — 교사 전용) */
export async function GET(request: Request, ctx: RouteContext<"/api/teacher/quiz-sets/[id]">) {
  return handle(async () => {
    await requireTeacher(request);
    const { id } = await ctx.params;
    return getQuizSetDetail(id);
  });
}

/** 임시저장 */
export async function PUT(request: Request, ctx: RouteContext<"/api/teacher/quiz-sets/[id]">) {
  return handle(async () => {
    await requireTeacher(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    return saveQuizContent(id, body.content);
  });
}
