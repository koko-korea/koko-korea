/**
 * 효과음 (FR-013). 음원 파일 없이 Web Audio로 짧은 소리를 만든다.
 * 브라우저 자동 재생 정책 때문에 첫 클릭 이후에만 소리가 난다.
 * 재생에 실패해도 화면 피드백에는 영향이 없도록 오류를 무시한다.
 */
type Wave = OscillatorType;

let ctx: AudioContext | null = null;
const STORAGE_KEY = "koko_sound";
let enabled = readStoredPreference();

function readStoredPreference(): boolean {
  try {
    return typeof window === "undefined" || window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** 효과음 켜기/끄기. 서버 저장과 별개로 이 브라우저에도 기억해 화면 간에 일관되게 쓴다. */
export function setSoundEnabled(value: boolean) {
  enabled = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    // 저장소를 쓸 수 없어도 이번 화면에서는 동작한다.
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, startOffset: number, duration: number, wave: Wave = "sine", volume = 0.12) {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  try {
    const t = ac.currentTime + startOffset;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  } catch {
    // 소리 오류는 무시한다.
  }
}

export const sfx = {
  /** 첫 사용자 동작에서 호출해 오디오를 깨운다. */
  unlock() {
    audio();
  },
  correct() {
    tone(660, 0, 0.12, "triangle");
    tone(990, 0.09, 0.18, "triangle");
  },
  bonus() {
    tone(1320, 0.2, 0.12, "sine", 0.08);
  },
  wrong() {
    tone(220, 0, 0.22, "sawtooth", 0.06);
    tone(165, 0.12, 0.25, "sawtooth", 0.05);
  },
  timeout() {
    tone(440, 0, 0.12, "square", 0.05);
    tone(330, 0.14, 0.18, "square", 0.05);
  },
  combo(level: number) {
    const base = 520 + Math.min(level, 10) * 40;
    tone(base, 0.22, 0.08, "triangle", 0.07);
    tone(base * 1.25, 0.3, 0.1, "triangle", 0.07);
  },
  badge() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.22, "triangle", 0.1));
  },
};
