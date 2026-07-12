/**
 * Звуковые сигналы входа/выхода — синтезируются Web Audio API.
 * Свои звуки вместо чужих ассетов (раздел 11 PRD: только CC0/своё).
 */

let ctx: AudioContext | null = null;

function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

function tone(frequency: number, startAt: number, duration: number): void {
  const audio = audioContext();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  const t0 = audio.currentTime + startAt;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Два восходящих тона — кто-то подключился (или подключились мы) */
export function playJoinSound(): void {
  try {
    tone(440, 0, 0.12);
    tone(660, 0.1, 0.16);
  } catch {
    // без звука (нет разрешения на AudioContext) — не критично
  }
}

/** Нисходящий тон — кто-то вышел */
export function playLeaveSound(): void {
  try {
    tone(520, 0, 0.12);
    tone(340, 0.1, 0.18);
  } catch {
    // без звука — не критично
  }
}
