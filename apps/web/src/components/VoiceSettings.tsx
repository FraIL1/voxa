import { Room } from 'livekit-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useVoiceStore } from '../stores/voice';

interface DeviceOption {
  deviceId: string;
  label: string;
}

/** Выпадающая панель выбора микрофона и устройства вывода */
export default function VoiceSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const voice = useVoiceStore();
  const [mics, setMics] = useState<DeviceOption[]>([]);
  const [outputs, setOutputs] = useState<DeviceOption[]>([]);

  useEffect(() => {
    // Разрешение на микрофон уже есть (мы в голосовом канале) — ярлыки заполнены
    void Room.getLocalDevices('audioinput').then((devices) =>
      setMics(devices.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
    );
    void Room.getLocalDevices('audiooutput').then((devices) =>
      setOutputs(devices.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
    );
  }, []);

  return (
    <>
      <div className="picker-backdrop" onClick={onClose} />
      <div className="voice-settings">
        <label>
          {t('voice.mic')}
          <select
            value={voice.micDeviceId ?? 'default'}
            onChange={(e) => void voice.setAudioDevice('audioinput', e.target.value)}
          >
            {mics.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || t('voice.defaultDevice')}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('voice.output')}
          <select
            value={voice.outputDeviceId ?? 'default'}
            onChange={(e) => void voice.setAudioDevice('audiooutput', e.target.value)}
          >
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || t('voice.defaultDevice')}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
