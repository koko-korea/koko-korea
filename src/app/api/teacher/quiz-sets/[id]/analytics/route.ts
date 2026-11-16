import { handle } from "@/server/http";
import { requireTeacher } from "@/server/teacher-session";
import { getAnalytics } from "@/server/teacher-service";

/** 개념별 정답률, 제출 현황, 리더보드 */
export async function GET(request: Request, ctx: RouteContext<"/api/teacher/quiz-sets/[id]/analytics">) {
  return handle(async () => {
    await requireTeacher(request);
    const { id } = await ctx.params;
    return getAnalytics(id);
  });
}
