import type { AudioProcessorOptions, LocalAudioTrack, Track, TrackProcessor } from 'livekit-client';

/**
 * Громкость входа и выхода. Живёт отдельно от сторов: значения нужны и
 * голосовым каналам, и звонкам в личке, и настройкам — а состояние это
 * не для рендера, перерисовывать по нему нечего.
 */

const KEY = 'voxa-audio-levels';

interface Saved {
  /** Усиление микрофона: 1 — как есть, 2 — вдвое громче */
  micGain: number;
  /** Громкость собеседников: 0…1 */
  output: number;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
    return {
      micGain: clamp(saved.micGain ?? 1, 0, 3),
      output: clamp(saved.output ?? 1, 0, 1),
    };
  } catch {
    return { micGain: 1, output: 1 };
  }
}

function save(value: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // не сохранилось — в этой сессии всё равно работает
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

let levels = load();

// ---------- Микрофон ----------

/** Живые узлы усиления: и у публикуемой дорожки, и у проверки в настройках */
const gainNodes = new Set<GainNode>();

export function micGain(): number {
  return levels.micGain;
}

export function setMicGain(value: number): void {
  levels = { ...levels, micGain: clamp(value, 0, 3) };
  save(levels);
  for (const node of gainNodes) node.gain.value = levels.micGain;
}

/**
 * Усиление вставляется в дорожку до отправки: собеседники слышат уже
 * подкрученный звук. Штатный способ LiveKit — обработчик дорожки, поэтому
 * мьют и переключение устройств продолжают работать как раньше.
 */
class MicGainProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'voxa-mic-gain';
  processedTrack?: MediaStreamTrack;

  private gain?: GainNode;
  private source?: MediaStreamAudioSourceNode;
  private destination?: MediaStreamAudioDestinationNode;

  async init(options: AudioProcessorOptions): Promise<void> {
    const context = options.audioContext;
    this.source = context.createMediaStreamSource(new MediaStream([options.track]));
    this.gain = context.createGain();
    this.gain.gain.value = levels.micGain;
    this.destination = context.createMediaStreamDestination();
    this.source.connect(this.gain).connect(this.destination);
    this.processedTrack = this.destination.stream.getAudioTracks()[0];
    gainNodes.add(this.gain);
  }

  async restart(options: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(options);
  }

  async destroy(): Promise<void> {
    if (this.gain) gainNodes.delete(this.gain);
    this.source?.disconnect();
    this.gain?.disconnect();
    this.destination?.disconnect();
    this.source = undefined;
    this.gain = undefined;
    this.destination = undefined;
    this.processedTrack = undefined;
  }
}

/** Вешает усиление на опубликованный микрофон комнаты */
export async function applyMicGain(track: LocalAudioTrack | undefined): Promise<void> {
  if (!track) return;
  await track.setProcessor(new MicGainProcessor()).catch(() => undefined);
}

/**
 * Проверка микрофона: отдаёт уровень 0…1 примерно 30 раз в секунду.
 * Усиление учитывается, поэтому ползунок видно на глаз.
 *
 * `monitor` включает возврат звука в наушники: полоска показывает, что
 * микрофон что-то слышит, но не что именно — шорох стула выглядит так же,
 * как речь. Услышать себя — единственный способ убедиться, что пишется голос.
 */
export function measureMicLevel(
  deviceId: string | null,
  onLevel: (level: number) => void,
  monitor = false,
): () => void {
  let stopped = false;
  let stop = (): void => {
    stopped = true;
  };

  void navigator.mediaDevices
    .getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true })
    .then((stream) => {
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const gain = context.createGain();
      gain.gain.value = levels.micGain;
      gainNodes.add(gain);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(gain).connect(analyser);

      // Возврат звука идёт через свой регулятор: без наушников иначе заводится
      let monitorGain: GainNode | null = null;
      if (monitor) {
        monitorGain = context.createGain();
        monitorGain.gain.value = levels.output;
        analyser.connect(monitorGain).connect(context.destination);
      }

      const buffer = new Float32Array(analyser.fftSize);
      let frame = 0;

      const tick = (): void => {
        analyser.getFloatTimeDomainData(buffer);
        // Среднеквадратичное значение — это громкость, а не случайный отсчёт
        let sum = 0;
        for (const sample of buffer) sum += sample * sample;
        const rms = Math.sqrt(sum / buffer.length);
        // Шкала логарифмическая: иначе тихая речь почти не двигает полоску
        onLevel(clamp(Math.sqrt(rms) * 2.2, 0, 1));
        frame = requestAnimationFrame(tick);
      };
      tick();

      stop = () => {
        cancelAnimationFrame(frame);
        gainNodes.delete(gain);
        source.disconnect();
        gain.disconnect();
        analyser.disconnect();
        monitorGain?.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void context.close();
      };
    })
    .catch(() => onLevel(0));

  return () => stop();
}

// ---------- Вывод ----------

/** Элементы со звуком собеседников: и голосовые каналы, и звонки */
const outputs = new Set<HTMLMediaElement>();

export function outputVolume(): number {
  return levels.output;
}

export function setOutputVolume(value: number): void {
  levels = { ...levels, output: clamp(value, 0, 1) };
  save(levels);
  for (const element of outputs) element.volume = levels.output;
}

/** Новый элемент сразу получает выбранную громкость */
export function registerOutput(element: HTMLMediaElement): void {
  element.volume = levels.output;
  outputs.add(element);
}

export function unregisterOutput(element: HTMLMediaElement): void {
  outputs.delete(element);
}
