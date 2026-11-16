import { handle } from "@/server/http";
import { requireTeacher } from "@/server/teacher-session";
import { deleteQuizSetRecords } from "@/server/teacher-service";

/** 세트의 학생 기록 전체 영구 삭제 (세트와 문항은 남는다) */
export async function DELETE(request: Request, ctx: RouteContext<"/api/teacher/quiz-sets/[id]/records">) {
  return handle(async () => {
    await requireTeacher(request);
    const { id } = await ctx.params;
    return deleteQuizSetRecords(id);
  });
}
