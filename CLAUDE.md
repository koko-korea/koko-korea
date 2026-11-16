@AGENTS.md

# Project Instructions

- Read PRD.md before implementing any feature.
- Treat requirements marked 확정 as non-negotiable.
- Treat 제안 as defaults and 결정 필요 as explicit decision points.
- Record approved decisions in docs/decisions.md (and PRD when product behavior changes).
- Keep scoring, timeout, combo, mastery, and ordering logic in testable modules under `src/domain/`.
- Never trust client-submitted score, correctness, or elapsed time. The client sends only `deliveryId` + `optionId`.
- Students have no login: a per-quiz-set participation token lives in an HttpOnly cookie; only its SHA-256 hash is stored.
- Enforce teacher ownership and student record isolation on the server.
- Do not expose answer keys or explanations before submission.
- Run `npm run check` (typecheck, lint, tests) after each implementation slice; run `npm run build` before pushing.
- Do not commit secrets, `.env`, or `data/` (local SQLite with student records).
- Respond to the user in Korean.
- This is Next.js 16 with Cache Components: read `node_modules/next/dist/docs/` before using unfamiliar APIs.
  Dynamic `params` must be read inside `<Suspense>`; client data fetching in effects must set state only in promise callbacks (react-hooks/set-state-in-effect).
