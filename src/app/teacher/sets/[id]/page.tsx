import { Suspense } from "react";
import { SetEditor } from "@/components/teacher/set-editor";
import { Spinner } from "@/components/ui";

export default function SetEditorPage({ params }: PageProps<"/teacher/sets/[id]">) {
  return <Suspense fallback={<Spinner />}>{params.then(({ id }) => <SetEditor id={id} />)}</Suspense>;
}
