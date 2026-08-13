import { MonitorUp, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import Select from './Select';

export interface ShareOptions {
  width: number;
  height: number;
  frameRate: number;
  audio: boolean;
}

const QUALITY: Record<string, { width: number; height: number }> = {
  '720': { width: 1280, height: 720 },
  '1080': { width: 1920, height: 1080 },
  '1440': { width: 2560, height: 1440 },
};

/**
 * Что и как показывать — спрашиваем здесь. Сам список окон и экранов рисует
 * браузер: страница не имеет права видеть чужие окна, поэтому выбор источника
 * оформить нельзя. Настройки качества и звука — наши, и они сохраняются.
 */
export default function ShareOptionsModal({
  initial,
  onStart,
  onClose,
}: {
  initial: ShareOptions;
  onStart: (options: ShareOptions) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [quality, setQuality] = useState(String(initial.height));
  const [frameRate, setFrameRate] = useState(String(initial.frameRate));
  const [audio, setAudio] = useState(initial.audio);

  const start = (): void => {
    const size = QUALITY[quality] ?? QUALITY['720']!;
    onStart({ ...size, frameRate: Number(frameRate), audio });
    onClose();
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('voice.shareTitle')}</h2>
        <p className="settings-hint">{t('voice.shareHint')}</p>

        <label className="share-field">
          {t('voice.shareQuality')}
          <Select
            value={quality}
            options={[
              { value: '720', label: `720p · ${t('voice.shareQualityLight')}` },
              { value: '1080', label: '1080p' },
              { value: '1440', label: `1440p · ${t('voice.shareQualityHeavy')}` },
            ]}
            onChange={setQuality}
          />
        </label>

        <label className="share-field">
          {t('voice.shareFps')}
          <Select
            value={frameRate}
            options={[
              { value: '15', label: `15 · ${t('voice.shareFpsText')}` },
              { value: '30', label: '30' },
              { value: '60', label: `60 · ${t('voice.shareFpsGames')}` },
            ]}
            onChange={setFrameRate}
          />
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={audio}
          className={`share-sound${audio ? ' on' : ''}`}
          onClick={() => setAudio((on) => !on)}
        >
          {audio ? <Volume2 size={16} /> : <VolumeX size={16} />}
          <span className="share-sound-text">
            <span className="share-sound-name">{t('voice.shareSound')}</span>
            <span className="settings-hint">{t('voice.shareSoundHint')}</span>
          </span>
          {/* Переключатель нарисован, а не поле: поле внутри кнопки —
              вложенный интерактивный элемент, так делать нельзя */}
          <span className={`owner-switch-track${audio ? ' on' : ''}`} />
        </button>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('chat.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={start}>
            <MonitorUp size={16} /> {t('voice.shareStart')}
          </button>
        </div>
      </div>
    </div>
  );
}
