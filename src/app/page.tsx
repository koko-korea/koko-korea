import { JoinCodeForm } from "@/components/join/join-code-form";
import { Card, Screen } from "@/components/ui";
import { SAMPLE_JOIN_CODE } from "@/server/seed/sample-quiz";

export default function Home() {
  return (
    <Screen>
      <div className="flex flex-col gap-6 pt-6 sm:pt-12">
        <header className="text-center">
          <p className="text-5xl" aria-hidden>
            📚⚡
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">국어 개념 퀴즈 챌린지</h1>
          <p className="mt-2 text-muted">로그인 없이 참여 코드만 있으면 바로 시작!</p>
        </header>

        <Card>
          <JoinCodeForm />
        </Card>

        <p className="text-center text-sm text-muted">
          체험용 견본 퀴즈 코드: <strong className="font-mono text-ink">{SAMPLE_JOIN_CODE}</strong>
        </p>
      </div>
    </Screen>
  );
}
