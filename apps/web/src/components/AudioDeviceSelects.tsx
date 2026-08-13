import { createLocalVideoTrack, Room, type LocalVideoTrack } from 'livekit-client';
import { Bell, BellOff, Play, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { playPreview, setSoundsEnabled, soundsEnabled } from '../lib/sounds';
import { useVoiceStore } from '../stores/voice';
import Select from './Select';

interface DeviceOption {
  deviceId: string;
  label: string;
}

/** Устройства голоса и видео — попап голоса и раздел настроек */
export default function AudioDeviceSelects({ withCamera = false }: { withCamera?: boolean }) {
  const { t } = useTranslation();
  const voice = useVoiceStore();
  const [mics, setMics] = useState<DeviceOption[]>([]);
  const [outputs, setOutputs] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [preview, setPreview] = useState(false);
  const [sounds, setSounds] = useState(soundsEnabled);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // true — запросить доступ к микрофону, если его ещё нет (иначе ярлыки пустые)
    void Room.getLocalDevices('audioinput', true).then((devices) =>
      setMics(devices.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
    );
    void Room.getLocalDevices('audiooutput', true).then((devices) =>
      setOutputs(devices.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
    );
  }, []);

  // Список камер спрашиваем только там, где он нужен: иначе браузер зря
  // просит доступ к камере при открытии попапа голоса
  useEffect(() => {
    if (!withCamera) return;
    void Room.getLocalDevices('videoinput', true).then((devices) =>
      setCameras(devices.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
    );
  }, [withCamera]);

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

  const toOptions = (devices: DeviceOption[]): { value: string; label: string }[] =>
    devices.map((d) => ({ value: d.deviceId, label: d.label || t('voice.defaultDevice') }));

  return (
    <>
      <label>
        {t('voice.mic')}
        <Select
          value={voice.micDeviceId ?? 'default'}
          options={toOptions(mics)}
          placeholder={t('voice.defaultDevice')}
          onChange={(value) => void voice.setAudioDevice('audioinput', value)}
        />
      </label>
      <label>
        {t('voice.output')}
        <Select
          value={voice.outputDeviceId ?? 'default'}
          options={toOptions(outputs)}
          placeholder={t('voice.defaultDevice')}
          onChange={(value) => void voice.setAudioDevice('audiooutput', value)}
        />
      </label>

      {withCamera && (
        <>
          <label className="sound-toggle">
            {sounds ? <Bell size={16} /> : <BellOff size={16} />}
            <span className="sound-toggle-text">
              <span className="owner-setting-name">{t('voice.sounds')}</span>
              <span className="settings-hint">{t('voice.soundsHint')}</span>
            </span>
            <button
              type="button"
              className="btn-secondary"
              title={t('voice.soundsPreview')}
              disabled={!sounds}
              onClick={() => playPreview()}
            >
              <Play size={15} />
            </button>
            <span className="owner-switch">
              <input
                type="checkbox"
                checked={sounds}
                onChange={(e) => {
                  setSounds(e.target.checked);
                  setSoundsEnabled(e.target.checked);
                  if (e.target.checked) playPreview();
                }}
              />
              <span className="owner-switch-track" />
            </span>
          </label>

          <label>
            {t('voice.camera')}
            <Select
              value={voice.cameraDeviceId ?? 'default'}
              options={toOptions(cameras)}
              placeholder={t('voice.defaultDevice')}
              onChange={(value) => void voice.setCameraDevice(value)}
            />
          </label>

          <div className="camera-preview">
            {preview ? (
              <video ref={videoRef} autoPlay playsInline muted />
            ) : (
              <div className="camera-preview-off">
                <VideoOff size={22} />
                {t('voice.cameraOffHint')}
              </div>
            )}
          </div>

          <button className="btn-secondary" onClick={() => setPreview((on) => !on)}>
            {preview ? <VideoOff size={15} /> : <Video size={15} />}
            {preview ? t('voice.cameraStop') : t('voice.cameraTest')}
          </button>
        </>
      )}
    </>
  );
}
