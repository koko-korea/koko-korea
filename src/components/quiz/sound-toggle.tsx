"use client";

export function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold"
    >
      {on ? "🔊 효과음 켜짐" : "🔇 효과음 꺼짐"}
    </button>
  );
}
