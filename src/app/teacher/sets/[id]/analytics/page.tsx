import { Suspense } from "react";
import { ClassAnalytics } from "@/components/teacher/class-analytics";
import { Spinner } from "@/components/ui";

export default function AnalyticsPage({ params }: PageProps<"/teacher/sets/[id]/analytics">) {
  return <Suspense fallback={<Spinner />}>{params.then(({ id }) => <ClassAnalytics id={id} />)}</Suspense>;
}
