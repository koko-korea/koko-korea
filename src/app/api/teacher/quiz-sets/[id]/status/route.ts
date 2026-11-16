import { handle, readJson } from "@/server/http";
import { requireTeacher } from "@/server/teacher-session";
import { setQuizStatus } from "@/server/teacher-service";

/** 공개·종료·다시 열기·편집 상태로 되돌리기 */
export async function POST(request: Request, ctx: RouteContext<"/api/teacher/quiz-sets/[id]/status">) {
  return handle(async () => {
    await requireTeacher(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    return setQuizStatus(id, body.status);
  });
}
