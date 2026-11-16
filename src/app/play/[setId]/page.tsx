import { Suspense } from "react";
import { PlayScreen } from "@/components/quiz/play-screen";
import { Screen, Spinner } from "@/components/ui";

export default function PlayPage({ params }: PageProps<"/play/[setId]">) {
  return (
    <Screen>
      <Suspense fallback={<Spinner />}>{params.then(({ setId }) => <PlayScreen setId={setId} />)}</Suspense>
    </Screen>
  );
}
