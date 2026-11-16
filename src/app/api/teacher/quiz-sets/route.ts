import { handle, readJson } from "@/server/http";
import { requireTeacher } from "@/server/teacher-session";
import { createQuizSet, listQuizSets } from "@/server/teacher-service";

export async function GET(request: Request) {
  return handle(async () => {
    await requireTeacher(request);
    return listQuizSets();
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    await requireTeacher(request);
    const body = await readJson(request);
    return { id: createQuizSet(body.title) };
  });
}
