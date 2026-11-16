# 문법의 숲 — 음운과 훈민정음 퀴즈

중학교 국어 2-2, 3단원 「국어의 음운과 문자」 문법 퀴즈. 기준 문서는 [PRD v1.1](../docs/munbeop-forest/PRD.md), 분석과 단계 계획은 [analysis.md](../docs/munbeop-forest/analysis.md)에 있습니다.

저장소 루트의 Next.js 앱(국어 개념 퀴즈 챌린지)과는 별개의 앱입니다.

## 명령

```bash
npm install
npm run dev      # 개발 서버
npm run check    # 타입 검사 + 테스트
npm run build    # dist/index.html 한 파일로 빌드
```

## 진행 상황

| 단계 | 상태 |
|---|---|
| 0 프로젝트 설정 | 완료 (시제품 `index.html`, 문제 은행 대기 중) |
| 2 퀴즈 엔진 `src/engine/` | 완료: 출제, 보기 섞기, 채점, 1분 타이머, 점수, 풀이 시간, 학번 잠금, 순위, 많이 틀린 문제 |
| 1 연결 시험 · 3 실시간 · 4 화면 · 5 3D · 6 배포 | 예정 |
