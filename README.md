# 국어 개념 퀴즈 챌린지

학생이 **로그인 없이** 참여 코드와 닉네임만으로 게임처럼 국어 개념 퀴즈를 풀고, 틀린 개념은 오답 노트에서 다시 도전해 극복하는 교실용 웹앱입니다. 제품 요구사항은 [PRD.md](PRD.md)를 기준으로 합니다.

## 지금 되는 것 (학생 흐름)

- 참여 코드 + 닉네임으로 바로 참여 (계정·명단 없음, 같은 브라우저는 이어 풀기)
- 라운드 방식 36문항: 1라운드 원문제 12개(1점), 2·3라운드 동형 문제 24개(0.5점)
- 문항당 30초 타이머, 시간 초과는 감점 없이 표시하고 계속 풀기
- 정답·오답 즉시 피드백과 해설, 콤보, 시간 내 정답 보너스 연출, 효과음(끄기 가능)
- 결과 화면(총점, 정답·오답·시간 초과 수, 개념별 요약)
- 개념별 오답 노트, 기존 문항 재사용 재도전(선택지 섞기), 극복 완료 배지
- 상위 5명 리더보드(공동 순위)

아직 없는 것: 교사 화면(인증, 세트 편집·CSV 가져오기, 정답률·제출 현황 분석, 기록 삭제)은 PRD Phase 4에서 만듭니다.

## 실행 방법

필요한 것: Node.js 24 이상 (내장 `node:sqlite` 사용)

```bash
npm install
npm run dev        # http://localhost:3000
```

처음 실행하면 `data/koko.db`가 만들어지고 **견본 퀴즈(참여 코드 `KOKO01`)** 가 자동으로 들어갑니다.
견본 문항은 교사 검수 전 임시 콘텐츠입니다([src/server/seed/sample-quiz.ts](src/server/seed/sample-quiz.ts)).

## 검사 명령

```bash
npm run typecheck  # 라우트 타입 생성 + TypeScript
npm run lint       # ESLint
npm run test       # Vitest (도메인 단위 테스트 + 서비스 통합 테스트)
npm run check      # 위 세 가지를 모두
npm run build      # 프로덕션 빌드
```

## 구조

```text
src/
├── domain/        점수·타이머·콤보·극복·출제 순서·리더보드·닉네임 규칙 (순수 함수, 테스트 대상)
├── server/        DB(SQLite), 퀴즈 서비스, 학생 세션 쿠키, 요청 제한
├── app/api/       라우트 핸들러 (정답·점수·시간 판정은 모두 서버에서)
├── app/           학생 화면: /, /join/[code], /play/[setId], /result, /notes
├── components/    화면 컴포넌트
└── lib/           API 타입, 클라이언트 fetch, 효과음
tests/
├── unit/          도메인 규칙
└── integration/   메모리 DB로 참여~재도전~리더보드 전체 흐름
```

설계상 결정은 [docs/decisions.md](docs/decisions.md)에 기록합니다.
