import { Suspense } from "react";
import { ResultScreen } from "@/components/quiz/result-screen";
import { Screen, Spinner } from "@/components/ui";

export default function ResultPage({ params }: PageProps<"/play/[setId]/result">) {
  return (
    <Screen>
      <Suspense fallback={<Spinner />}>{params.then(({ setId }) => <ResultScreen setId={setId} />)}</Suspense>
    </Screen>
  );
}
