import { MonitorUp, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useAnchoredMenu } from '../hooks/useMenuPlacement';
import { useVolumesStore, volumeOf, type VolumeKind } from '../stores/volumes';

export interface VolumeMenuState {
  x: number;
  y: number;
  userId: string;
  name: string;
  /** Показывает ли человек экран — тогда есть и вторая громкость */
  hasScreen: boolean;
}

/** Одна строка настройки: значок-выключатель, ползунок и проценты */
function VolumeRow({
  userId,
  kind,
  label,
  icon,
}: {
  userId: string;
  kind: VolumeKind;
  label: string;
  icon: React.ReactNode;
}) {
  const { t } = useTranslation();
  const value = useVolumesStore((s) => volumeOf(s, userId, kind));
  const setVolume = useVolumesStore((s) => s.setVolume);
  const silent = value === 0;

  return (
    <div className="volume-row">
      <div className="volume-row-head">
        <span className="volume-row-label">
          {icon}
          {label}
        </span>
        <span className={`volume-row-value${silent ? ' silent' : ''}`}>
          {silent ? t('voice.volumeOff') : `${Math.round(value * 100)}%`}
        </span>
      </div>
      <div className="volume-row-body">
        {/* Значок глушит целиком и возвращает обычную громкость обратно */}
        <button
          className={`icon-button${silent ? ' danger' : ''}`}
          title={silent ? t('voice.volumeOn') : t('voice.volumeMute')}
          onClick={() => setVolume(userId, kind, silent ? 1 : 0)}
        >
          {silent ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <input
          type="range"
          className="volume-slider in-menu"
          min={0}
          max={1}
          step={0.05}
          value={value}
          aria-label={label}
          onChange={(e) => setVolume(userId, kind, Number(e.target.value))}
        />
      </div>
    </div>
  );
}

/**
 * Правый клик по участнику: его громкость и громкость его демонстрации.
 *
 * Раньше ползунок жил прямо в плитке и проявлялся при наведении — его было
 * легко задеть, а на плитке показа он ещё и налезал на картинку.
 */
export default function VolumeMenu({
  menu,
  onClose,
}: {
  menu: VolumeMenuState;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reset = useVolumesStore((s) => s.reset);
  const { ref, style, flipLeft } = useAnchoredMenu(menu.x, menu.y);

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, ref]);

  return (
    <div
      className={`context-menu volume-menu${flipLeft ? ' flip-left' : ''}`}
      ref={ref}
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="menu-title">{menu.name}</div>

      <VolumeRow
        userId={menu.userId}
        kind="voice"
        label={t('voice.volumeVoice')}
        icon={<Volume2 size={13} />}
      />

      {menu.hasScreen && (
        <VolumeRow
          userId={menu.userId}
          kind="screen"
          label={t('voice.volumeScreen')}
          icon={<MonitorUp size={13} />}
        />
      )}

      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={() => {
          reset(menu.userId);
          onClose();
        }}
      >
        <RotateCcw size={15} /> {t('voice.volumeReset')}
      </button>

      {/* Настройка только моя: чужой звук у остальных не меняется */}
      <p className="volume-menu-hint">{t('voice.volumeHint')}</p>
    </div>
  );
}
