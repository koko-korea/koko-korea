"use client";

import type { ShownOption } from "@/lib/api-types";

const MARKS = ["①", "②", "③", "④", "⑤"];

/**
 * 선택지 목록. 결과가 나오면 정답/내 답을 색과 함께 글자로도 표시한다(색만으로 구분하지 않음).
 */
export function OptionList({
  options,
  onPick,
  disabled,
  selectedId,
  correctId,
}: {
  options: ShownOption[];
  onPick: (id: string) => void;
  disabled: boolean;
  selectedId: string | null;
  correctId: string | null;
}) {
  const revealed = correctId !== null;
  return (
    <ul className="flex flex-col gap-3">
      {options.map((option, i) => {
        const isCorrect = revealed && option.id === correctId;
        const isWrongPick = revealed && option.id === selectedId && option.id !== correctId;
        const isPending = !revealed && option.id === selectedId;
        const tone = isCorrect
          ? "border-good bg-good-soft"
          : isWrongPick
            ? "border-bad bg-bad-soft anim-shake"
            : isPending
              ? "border-primary bg-primary-soft"
              : "border-line bg-surface hover:border-primary";
        return (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => onPick(option.id)}
              disabled={disabled}
              aria-keyshortcuts={String(i + 1)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base transition sm:text-lg ${tone} ${
                disabled ? "cursor-default" : "active:scale-[0.99]"
              }`}
            >
              <span className="text-xl font-bold text-muted" aria-hidden>
                {MARKS[i]}
              </span>
              <span className="flex-1">{option.text}</span>
              {isCorrect && <span className="shrink-0 font-bold text-good">✓ 정답</span>}
              {isWrongPick && <span className="shrink-0 font-bold text-bad">✗ 내 답</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
