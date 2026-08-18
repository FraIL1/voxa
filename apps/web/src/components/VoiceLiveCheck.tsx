import { createLocalVideoTrack, type LocalVideoTrack } from 'livekit-client';
import { Play, Square, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { measureMicLevel } from '../lib/audio-io';
import { useVoiceStore } from '../stores/voice';

/** Сколько секунд пишем при проверке: дольше человек говорить не станет */
const RECORD_MS = 4000;

/**
 * Живая проверка голоса и камеры — правая колонка настроек.
 *
 * Полоска уровня идёт всё время, пока раздел открыт: не надо ничего нажимать,
 * чтобы понять, слышно ли тебя. Запись и прослушивание — отдельно, потому что
 * «слышно, что микрофон живой» и «слышно, как я звучу» — разные вопросы.
 */
export default function VoiceLiveCheck() {
  const { t } = useTranslation();
  const voice = useVoiceStore();
  const [level, setLevel] = useState(0);
  const [preview, setPreview] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'playing'>('idle');
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // Уровень меряем сразу: полоска — главный ответ на вопрос «слышно ли меня»
  useEffect(() => measureMicLevel(voice.micDeviceId, setLevel, false), [voice.micDeviceId]);

  /* Предпросмотр — отдельный временный трек: комнату он не трогает и
     гаснет вместе с закрытием раздела */
  useEffect(() => {
    if (!preview) return;
    let track: LocalVideoTrack | null = null;
    let cancelled = false;

    void createLocalVideoTrack(voice.cameraDeviceId ? { deviceId: voice.cameraDeviceId } : {})
      .then((created) => {
        if (cancelled) {
          created.stop();
          return;
        }
        track = created;
        if (videoRef.current) created.attach(videoRef.current);
      })
      .catch(() => setPreview(false));

    return () => {
      cancelled = true;
      track?.stop();
    };
  }, [preview, voice.cameraDeviceId]);

  useEffect(() => () => stopRef.current?.(), []);

  /** Пишем короткий кусок и сразу проигрываем — слышно себя как со стороны */
  const record = async (): Promise<void> => {
    if (phase !== 'idle') {
      stopRef.current?.();
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: voice.micDeviceId ? { deviceId: voice.micDeviceId } : true,
      });
    } catch {
      return;
    }

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);

    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
      const audio = new Audio(url);
      setPhase('playing');
      const done = (): void => {
        URL.revokeObjectURL(url);
        setPhase('idle');
        stopRef.current = null;
      };
      audio.onended = done;
      stopRef.current = () => {
        audio.pause();
        done();
      };
      void audio.play().catch(done);
    };

    setPhase('recording');
    recorder.start();
    const timer = setTimeout(() => recorder.stop(), RECORD_MS);
    stopRef.current = () => {
      clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
    };
  };

  // Полоска из отрезков читается лучше сплошной: видно, докуда добивает голос
  const bars = 16;
  const lit = Math.round(level * bars);

  return (
    <div className="live-check">
      <div className="check-card">
        <div className="check-head">
          <span>{t('voice.checkHeard')}</span>
          <i>{t('voice.checkSpeak')}</i>
        </div>
        <div className="check-bars" role="progressbar" aria-valuenow={Math.round(level * 100)}>
          {Array.from({ length: bars }, (_, i) => (
            <span key={i} className={`check-bar${i < lit ? ' on' : ''}${i > 12 ? ' hot' : ''}`} />
          ))}
        </div>
        <button className="btn-secondary check-wide" onClick={() => void record()}>
          {phase === 'idle' ? <Play size={15} /> : <Square size={15} />}
          {phase === 'idle'
            ? t('voice.checkRecord')
            : phase === 'recording'
              ? t('voice.checkRecording')
              : t('voice.checkPlaying')}
        </button>
      </div>

      <div className="check-card">
        <div className="check-head">
          <span>{t('voice.checkCamera')}</span>
        </div>
        <div className="camera-preview">
          {preview ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted />
              <span className="camera-note">{t('voice.checkCameraSeen')}</span>
            </>
          ) : (
            <div className="camera-preview-off">
              <VideoOff size={22} />
              {t('voice.cameraOffHint')}
            </div>
          )}
        </div>
        <button
          className={`check-wide ${preview ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => setPreview((on) => !on)}
        >
          {preview ? <VideoOff size={15} /> : <Video size={15} />}
          {preview ? t('voice.checkCameraOff') : t('voice.checkCameraOn')}
        </button>
      </div>

      <p className="check-hint">{t('voice.checkHint')}</p>
    </div>
  );
}
