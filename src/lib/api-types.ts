/** 서버와 클라이언트가 함께 쓰는 API 응답 타입. 정답 정보는 제출 후 응답에만 들어간다. */

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface QuizInfo {
  id: string;
  title: string;
  status: "draft" | "published" | "closed";
  questionCount: number;
  conceptCount: number;
  timeLimitSeconds: number;
  isSample: boolean;
}

export interface JoinInfo {
  quiz: QuizInfo;
  /** 이 브라우저에 이미 참여 기록이 있으면 */
  existing: { nickname: string; status: "in_progress" | "submitted" } | null;
}

export interface ShownOption {
  id: string;
  text: string;
}

export interface PlayStateInProgress {
  status: "in_progress";
  nickname: string;
  index: number;
  total: number;
  round: number;
  roundCount: number;
  conceptName: string;
  questionType: "original" | "variant";
  deliveryId: string;
  body: string;
  options: ShownOption[];
  deadlineAt: number;
  serverNow: number;
  timeLimitSeconds: number;
  combo: number;
  scoreUnits: number;
  soundEnabled: boolean;
}

export type PlayState = PlayStateInProgress | { status: "submitted"; nickname: string };

export interface AnswerResult {
  isCorrect: boolean;
  isTimeout: boolean;
  timeBonus: boolean;
  correctOptionId: string;
  explanation: string;
  scoreUnits: number;
  totalUnits: number;
  combo: number;
  finished: boolean;
}

export interface ConceptSummary {
  conceptId: string;
  name: string;
  correct: number;
  total: number;
  mastery: "perfect" | "needs_review" | "mastered";
}

export interface ResultSummary {
  nickname: string;
  totalUnits: number;
  maxUnits: number;
  correctCount: number;
  wrongCount: number;
  timeoutCount: number;
  questionCount: number;
  maxCombo: number;
  badgeCount: number;
  concepts: ConceptSummary[];
}

export interface WrongItem {
  questionId: string;
  questionType: "original" | "variant";
  body: string;
  selectedText: string;
  correctText: string;
  explanation: string;
}

export interface WrongNoteConcept {
  conceptId: string;
  name: string;
  status: "needs_review" | "mastered";
  streak: number;
  threshold: number;
  items: WrongItem[];
}

export interface ReviewQuestion {
  deliveryId: string;
  conceptId: string;
  conceptName: string;
  body: string;
  options: ShownOption[];
  streak: number;
  threshold: number;
  status: "needs_review" | "mastered";
}

export interface ReviewResult {
  isCorrect: boolean;
  correctOptionId: string;
  explanation: string;
  status: "needs_review" | "mastered";
  streak: number;
  threshold: number;
  newlyMastered: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  units: number;
  isMe: boolean;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  submittedCount: number;
}
