import { Bell, BellOff, Keyboard, Play, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  playCallConnected,
  playDeafen,
  playMention,
  playMicOn,
  playPeerJoin,
  playPreview,
  playSelfJoin,
  playShareStart,
  setSoundOn,
  setSoundsEnabled,
  soundOn,
  soundsEnabled,
  SOUND_KEYS,
  type SoundKey,
} from '../lib/sounds';
import {
  comboFromEvent,
  comboLabel,
  HOTKEY_ACTIONS,
  useHotkeysStore,
  type HotkeyAction,
} from '../stores/hotkeys';

/** Строка настройки: слева название и пояснение, справа управление */
function Row({
  name,
  hint,
  children,
}: {
  name: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-text">
        <span className="setting-row-name">{name}</span>
        {hint && <span className="setting-row-hint">{hint}</span>}
      </div>
      {children && <div className="setting-row-control">{children}</div>}
    </div>
  );
}

/** Звуки: общий выключатель и каждый звук по отдельности */
export function SoundsTab() {
  const { t } = useTranslation();
  const [on, setOn] = useState(soundsEnabled);
  const [, force] = useState(0);

  const preview: Record<SoundKey, () => void> = {
    channel: playSelfJoin,
    peers: playPeerJoin,
    mic: playMicOn,
    deafen: playDeafen,
    share: playShareStart,
    call: playCallConnected,
    mention: playMention,
  };

  return (
    <>
      <h2>{t('settings.soundsTitle')}</h2>
      <p className="settings-hint">{t('settings.soundsTabHint')}</p>

      <div className="settings-form voice-form">
        <Row name={t('settings.soundsAll')} hint={t('settings.soundsAllHint')}>
          {on ? <Bell size={16} /> : <BellOff size={16} />}
          <span className="owner-switch">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => {
                setOn(e.target.checked);
                setSoundsEnabled(e.target.checked);
                if (e.target.checked) playPreview();
              }}
            />
            <span className="owner-switch-track" />
          </span>
        </Row>

        {SOUND_KEYS.map((key) => (
          <Row key={key} name={t(`settings.snd.${key}`)} hint={t(`settings.snd.${key}Hint`)}>
            <button
              type="button"
              className="btn-secondary"
              title={t('voice.soundsPreview')}
              disabled={!on || !soundOn(key)}
              onClick={() => preview[key]()}
            >
              <Play size={15} />
            </button>
            <span className={`owner-switch${on ? '' : ' faded'}`}>
              <input
                type="checkbox"
                checked={soundOn(key)}
                disabled={!on}
                onChange={(e) => {
                  setSoundOn(key, e.target.checked);
                  force((n) => n + 1);
                  if (e.target.checked) preview[key]();
                }}
              />
              <span className="owner-switch-track" />
            </span>
          </Row>
        ))}
      </div>
    </>
  );
}

/** Горячие клавиши: можно переназначить, нажав своё сочетание */
export function HotkeysTab() {
  const { t } = useTranslation();
  const binds = useHotkeysStore((s) => s.binds);
  const setBind = useHotkeysStore((s) => s.set);
  const reset = useHotkeysStore((s) => s.reset);
  const [listening, setListening] = useState<HotkeyAction | null>(null);

  /* Пока ждём сочетание, перехватываем всё: иначе Ctrl+K успеет открыть
     переход, а Escape — закрыть настройки, и записать их не получится. */
  useEffect(() => {
    if (!listening) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        setListening(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return;
      setBind(listening, combo);
      setListening(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [listening, setBind]);

  return (
    <>
      <h2>{t('settings.hotkeysTitle')}</h2>
      <p className="settings-hint">{t('settings.hotkeysHint')}</p>

      <div className="settings-form voice-form">
        {HOTKEY_ACTIONS.map((action) => (
          <Row key={action} name={t(`settings.hk.${action}`)}>
            <kbd className={`hotkey${listening === action ? ' listening' : ''}`}>
              {listening === action ? t('settings.hkPress') : comboLabel(binds[action])}
            </kbd>
            <button
              className="btn-secondary"
              onClick={() => setListening(action)}
              disabled={listening !== null}
            >
              <Keyboard size={15} />
              {t('settings.hkChange')}
            </button>
            <button
              className="icon-button"
              title={t('settings.hkClear')}
              disabled={!binds[action]}
              onClick={() => setBind(action, null)}
            >
              <X size={15} />
            </button>
          </Row>
        ))}
      </div>

      <button className="btn-secondary" onClick={reset}>
        <RotateCcw size={15} />
        {t('settings.hkReset')}
      </button>
    </>
  );
}

/** О программе: версия и на чём собрано */
export function AboutTab() {
  const { t } = useTranslation();

  return (
    <>
      <h2>{t('settings.aboutTitle')}</h2>

      <div className="settings-form voice-form">
        <Row name={t('settings.aboutVersion')} hint="Voxa 0.1.0">
          <span className="setting-row-value">0.1.0</span>
        </Row>
        <Row name={t('settings.aboutLicense')} hint={t('settings.aboutLicenseHint')} />
      </div>

      <p className="settings-copyright">{t('settings.aboutRights')}</p>
    </>
  );
}
