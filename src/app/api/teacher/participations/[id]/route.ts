import { handle, readJson } from "@/server/http";
import { requireTeacher } from "@/server/teacher-session";
import { deleteParticipant, setParticipantHidden } from "@/server/teacher-service";

/** 리더보드 숨기기/보이기 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/teacher/participations/[id]">) {
  return handle(async () => {
    await requireTeacher(request);
    const { id } = await ctx.params;
    const body = await readJson(request);
    setParticipantHidden(id, body.hidden);
    return { ok: true };
  });
}

/** 참여자 한 명의 기록 삭제 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/teacher/participations/[id]">) {
  return handle(async () => {
    await requireTeacher(request);
    const { id } = await ctx.params;
    deleteParticipant(id);
    return { ok: true };
  });
}
