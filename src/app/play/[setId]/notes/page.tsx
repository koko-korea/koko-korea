import { Suspense } from "react";
import { NotesScreen } from "@/components/review/notes-screen";
import { Screen, Spinner } from "@/components/ui";

export default function NotesPage({ params }: PageProps<"/play/[setId]/notes">) {
  return (
    <Screen>
      <Suspense fallback={<Spinner />}>{params.then(({ setId }) => <NotesScreen setId={setId} />)}</Suspense>
    </Screen>
  );
}
