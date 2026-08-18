/**
 * Голос приложения. Все звуки синтезируются Web Audio на лету — ни одного
 * чужого файла (раздел 11 PRD: только своё или CC0), нулевой вес и одинаковое
 * звучание в браузере и в приложении.
 *
 * Общий язык, чтобы звуки узнавались, а не путались:
 *   • вверх — что-то включилось, открылось, подключилось;
 *   • вниз — выключилось, закрылось, отключилось;
 *   • колокольчик — события с людьми (вход, звонок, упоминание);
 *   • глухой удар — переключатели на себе (микрофон, наушники);
 *   • чужие действия тише и короче своих, чтобы не спорить с ними.
 *
 * Ноты берём из одного лада (ля — до-диез — ми — си), поэтому любые два
 * звука, наложившись, звучат созвучно, а не как случайные писки.
 */

const A3 = 220;
const E4 = 329.63;
const A4 = 440;
const B4 = 493.88;
const CS5 = 554.37;
const E5 = 659.25;
const A5 = 880;
const CS6 = 1108.73;
const E6 = 1318.51;

const ENABLED_KEY = 'voxa-sounds-enabled';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = readEnabled();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Звуки приложения целиком: выключаются в настройках, выбор запоминается */
export function soundsEnabled(): boolean {
  return enabled;
}

export function setSoundsEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(ENABLED_KEY, value ? '1' : '0');
  } catch {
    // без сохранения — переживём, в этой сессии выбор всё равно действует
  }
}

/** Ключи отдельных звуков: каждый включается сам по себе */
export type SoundKey = 'channel' | 'peers' | 'mic' | 'deafen' | 'share' | 'call' | 'mention';

export const SOUND_KEYS: SoundKey[] = [
  'channel',
  'peers',
  'mic',
  'deafen',
  'share',
  'call',
  'mention',
];

const OFF_KEY = 'voxa.sounds.off';

function readOff(): Set<SoundKey> {
  try {
    const raw = localStorage.getItem(OFF_KEY);
    return new Set(raw ? (JSON.parse(raw) as SoundKey[]) : []);
  } catch {
    return new Set();
  }
}

let off = readOff();

/** Включён ли отдельный звук. Общий выключатель главнее любого частного. */
export function soundOn(key: SoundKey): boolean {
  return enabled && !off.has(key);
}

export function setSoundOn(key: SoundKey, value: boolean): void {
  off = new Set(off);
  if (value) off.delete(key);
  else off.add(key);
  try {
    localStorage.setItem(OFF_KEY, JSON.stringify([...off]));
  } catch {
    // без сохранения переживём: в этой сессии выбор всё равно действует
  }
}

function audio(): { ctx: AudioContext; master: GainNode } | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    // До первого клика по странице браузер держит звук на паузе
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, master: master! };
  } catch {
    return null;
  }
}

type Voice =
  /** Стеклянный колокольчик: основной тон плюс тихая октава сверху */
  | 'bell'
  /** Мягкий тон без обертонов — для фоновых и чужих событий */
  | 'soft'
  /** Глухой низкий удар: переключатели на себе */
  | 'thud'
  /** Шелест: узкая полоса шума, «оживает экран» */
  | 'air';

interface Note {
  /** Частота в герцах; для 'air' — центр полосы */
  hz: number;
  /** Задержка от начала связки, секунды */
  at?: number;
  dur?: number;
  gain?: number;
  voice?: Voice;
  /** Глиссандо к этой частоте за время звучания */
  to?: number;
}

/** Короткий всплеск шума — основа шелестящих звуков */
function noiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
  const frames = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function playNote(note: Note): void {
  const parts = audio();
  if (!parts) return;
  const { ctx: context, master: out } = parts;

  const voice = note.voice ?? 'bell';
  const dur = note.dur ?? 0.18;
  const peak = note.gain ?? 0.12;
  const t0 = context.currentTime + (note.at ?? 0);

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  // Мгновенная атака звучит щелчком, поэтому у всех звуков короткий подъём
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  if (voice === 'air') {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(context, dur + 0.05);
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 12;
    band.frequency.setValueAtTime(note.hz, t0);
    if (note.to) band.frequency.exponentialRampToValueAtTime(note.to, t0 + dur);
    source.connect(band).connect(gain).connect(out);
    source.start(t0);
    source.stop(t0 + dur + 0.05);
    return;
  }

  const osc = context.createOscillator();
  osc.type = voice === 'thud' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(note.hz, t0);
  if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, t0 + dur);

  let node: AudioNode = osc;
  if (voice === 'thud') {
    // Глушим верх: получается мягкий стук, а не пищащий тон
    const lp = context.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    osc.connect(lp);
    node = lp;
  }
  node.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);

  // Колокольчик: тихая октава сверху даёт стеклянный призвук
  if (voice === 'bell') {
    const over = context.createOscillator();
    const overGain = context.createGain();
    over.type = 'sine';
    over.frequency.setValueAtTime(note.hz * 2, t0);
    if (note.to) over.frequency.exponentialRampToValueAtTime(note.to * 2, t0 + dur);
    overGain.gain.setValueAtTime(0.0001, t0);
    overGain.gain.exponentialRampToValueAtTime(peak * 0.3, t0 + 0.012);
    overGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.7);
    over.connect(overGain).connect(out);
    over.start(t0);
    over.stop(t0 + dur + 0.05);
  }
}

function play(notes: Note[]): void {
  try {
    notes.forEach(playNote);
  } catch {
    // звук — не то, ради чего стоит ронять интерфейс
  }
}

// ---------- Голосовой канал ----------

/** Сам вошёл в канал: три ноты вверх, уверенно */
export function playSelfJoin(): void {
  if (!soundOn('channel')) return;
  play([
    { hz: A4, dur: 0.16 },
    { hz: CS5, at: 0.07, dur: 0.18 },
    { hz: E5, at: 0.14, dur: 0.3, gain: 0.13 },
  ]);
}

/** Сам вышел: те же ноты вниз и короче */
export function playSelfLeave(): void {
  if (!soundOn('channel')) return;
  play([
    { hz: E5, dur: 0.14 },
    { hz: CS5, at: 0.07, dur: 0.16 },
    { hz: A4, at: 0.14, dur: 0.26, gain: 0.1 },
  ]);
}

/** Кто-то другой зашёл: тише и выше — не спорит с твоими действиями */
export function playPeerJoin(): void {
  if (!soundOn('peers')) return;
  play([
    { hz: E5, dur: 0.1, gain: 0.07, voice: 'soft' },
    { hz: A5, at: 0.06, dur: 0.16, gain: 0.07, voice: 'soft' },
  ]);
}

/** Кто-то другой вышел */
export function playPeerLeave(): void {
  if (!soundOn('peers')) return;
  play([
    { hz: A5, dur: 0.1, gain: 0.06, voice: 'soft' },
    { hz: E5, at: 0.06, dur: 0.16, gain: 0.06, voice: 'soft' },
  ]);
}

// ---------- Переключатели на себе ----------

/** Микрофон выключен: короткий глухой удар вниз */
export function playMicOff(): void {
  if (!soundOn('mic')) return;
  play([{ hz: 200, to: 130, dur: 0.11, gain: 0.16, voice: 'thud' }]);
}

/** Микрофон включён: тот же удар вверх */
export function playMicOn(): void {
  if (!soundOn('mic')) return;
  play([{ hz: 150, to: 240, dur: 0.11, gain: 0.16, voice: 'thud' }]);
}

/** Звук выключен целиком: удар и следом «накрыло» — глухо и ниже */
export function playDeafen(): void {
  if (!soundOn('deafen')) return;
  play([
    { hz: 220, to: 140, dur: 0.1, gain: 0.15, voice: 'thud' },
    { hz: 150, to: 90, at: 0.08, dur: 0.2, gain: 0.13, voice: 'thud' },
  ]);
}

/** Звук вернулся: открывается снизу вверх */
export function playUndeafen(): void {
  if (!soundOn('deafen')) return;
  play([
    { hz: 110, to: 170, dur: 0.1, gain: 0.13, voice: 'thud' },
    { hz: 180, to: 280, at: 0.08, dur: 0.16, gain: 0.14, voice: 'thud' },
    { hz: A5, at: 0.14, dur: 0.18, gain: 0.06, voice: 'soft' },
  ]);
}

// ---------- Демонстрация экрана ----------

/** Экран пошёл в эфир: шелест вверх и искра сверху — «включился монитор» */
export function playShareStart(): void {
  if (!soundOn('share')) return;
  play([
    { hz: 700, to: 2600, dur: 0.26, gain: 0.06, voice: 'air' },
    { hz: A4, dur: 0.12, gain: 0.08 },
    { hz: CS5, at: 0.06, dur: 0.12, gain: 0.08 },
    { hz: E5, at: 0.12, dur: 0.14, gain: 0.09 },
    { hz: A5, at: 0.18, dur: 0.26, gain: 0.1 },
  ]);
}

/** Демонстрация закончилась: шелест вниз, гаснет */
export function playShareStop(): void {
  if (!soundOn('share')) return;
  play([
    { hz: 2400, to: 600, dur: 0.22, gain: 0.05, voice: 'air' },
    { hz: E5, dur: 0.12, gain: 0.08 },
    { hz: A4, at: 0.09, dur: 0.24, gain: 0.09 },
  ]);
}

// ---------- Звонки ----------

/**
 * Гудок исходящего вызова: мягкая двойная пульсация раз в две секунды.
 * Возвращает функцию остановки.
 */
export function startDialTone(): () => void {
  const beat = (): void => {
    play([
      { hz: E4, dur: 0.34, gain: 0.06, voice: 'soft' },
      { hz: A4, dur: 0.34, gain: 0.05, voice: 'soft' },
      { hz: E4, at: 0.45, dur: 0.34, gain: 0.06, voice: 'soft' },
      { hz: A4, at: 0.45, dur: 0.34, gain: 0.05, voice: 'soft' },
    ]);
  };
  beat();
  const timer = setInterval(beat, 2200);
  return () => clearInterval(timer);
}

/** Входящий вызов: короткая мелодия, повторяется, пока не ответят */
export function startRingtone(): () => void {
  const ring = (): void => {
    play([
      { hz: A4, dur: 0.2, gain: 0.11 },
      { hz: CS5, at: 0.16, dur: 0.2, gain: 0.11 },
      { hz: E5, at: 0.32, dur: 0.24, gain: 0.12 },
      { hz: CS5, at: 0.52, dur: 0.34, gain: 0.1 },
    ]);
  };
  ring();
  const timer = setInterval(ring, 2400);
  return () => clearInterval(timer);
}

/** Собеседник ответил: тёплый аккорд с искрой сверху */
export function playCallConnected(): void {
  if (!soundOn('call')) return;
  play([
    { hz: A3, dur: 0.3, gain: 0.07, voice: 'soft' },
    { hz: E4, dur: 0.3, gain: 0.07, voice: 'soft' },
    { hz: CS5, at: 0.05, dur: 0.3, gain: 0.09 },
    { hz: A5, at: 0.16, dur: 0.36, gain: 0.09 },
  ]);
}

/** Разговор окончен: две ноты вниз, спокойно */
export function playCallEnded(): void {
  if (!soundOn('call')) return;
  play([
    { hz: B4, dur: 0.16, gain: 0.1, voice: 'soft' },
    { hz: E4, at: 0.13, dur: 0.34, gain: 0.09, voice: 'soft' },
  ]);
}

// ---------- Сообщения и мелочи ----------

/** Тебя упомянули: короткая яркая искра, ни с чем не спутать */
export function playMention(): void {
  if (!soundOn('mention')) return;
  play([
    { hz: CS6, dur: 0.1, gain: 0.08 },
    { hz: E6, at: 0.07, dur: 0.2, gain: 0.09 },
  ]);
}

/** Событие с людьми: заявка в друзья, приглашение */
export function playFriendly(): void {
  play([
    { hz: E5, dur: 0.12, gain: 0.08, voice: 'soft' },
    { hz: A5, at: 0.09, dur: 0.14, gain: 0.08 },
    { hz: CS6, at: 0.17, dur: 0.22, gain: 0.07 },
  ]);
}

/** Не вышло: два одинаковых глухих тона — вежливое «нет» */
export function playDenied(): void {
  play([
    { hz: 160, dur: 0.1, gain: 0.13, voice: 'thud' },
    { hz: 160, at: 0.13, dur: 0.16, gain: 0.12, voice: 'thud' },
  ]);
}

/** Пробная кнопка в настройках: даёт послушать характер звуков */
export function playPreview(): void {
  playSelfJoin();
}
