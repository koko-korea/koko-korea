import { Suspense } from "react";
import { JoinScreen } from "@/components/join/join-screen";
import { Screen, Spinner } from "@/components/ui";

export default function JoinPage({ params }: PageProps<"/join/[code]">) {
  return (
    <Screen>
      <Suspense fallback={<Spinner />}>{params.then(({ code }) => <JoinScreen code={code} />)}</Suspense>
    </Screen>
  );
}
