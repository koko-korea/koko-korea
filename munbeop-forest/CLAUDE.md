# 문법의 숲 — 작업 규칙

이 폴더는 저장소 루트의 Next.js 앱(국어 개념 퀴즈 챌린지)과 **별개의 앱**이다. 루트 CLAUDE.md의 서버·쿠키·SQLite 규칙은 여기에 적용되지 않는다.

- 기준 문서: `../docs/munbeop-forest/PRD.md` (v1.1). 기능을 구현하기 전에 읽는다. 동작이 바뀌는 결정은 PRD 12절에 기록한다.
- 스택: Vite + TypeScript(프레임워크 없음), `vite-plugin-singlefile`로 `index.html` 하나로 빌드. 테스트는 Vitest.
- 출제·채점·점수·시간·순위·학번 잠금 로직은 DOM 없이 `src/engine/`의 순수 모듈로 두고 테스트한다. 시간(`now`)과 난수(`rng`)는 인자로 받는다.
- 개인정보: 학번·이름·점수를 localStorage·sessionStorage·IndexedDB·쿠키·분석 도구에 **절대 저장하지 않는다**. 메모리에만 둔다.
- 저작권: 게임 원작의 캐릭터·로고·아이콘·음원을 쓰지 않는다. 그래픽·소리는 코드로 만든다.
- 국어쌤 대사는 항상 `:D`(기쁠 때) 또는 `:)`로 끝난다.
- 구현 단위마다 `npm run check`, 푸시 전 `npm run build`.
- 사용자에게는 한국어로 응답한다.
