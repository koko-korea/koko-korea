import { handle, readJson } from "@/server/http";
import { setSoundEnabled } from "@/server/quiz-service";
import { requireParticipation } from "@/server/session";

/** 효과음 켜기/끄기 저장 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/play/[setId]/preferences">) {
  return handle(async () => {
    const { setId } = await ctx.params;
    const p = await requireParticipation(setId);
    const body = await readJson(request);
    setSoundEnabled(p.id, body.soundEnabled);
    return { ok: true };
  });
}
