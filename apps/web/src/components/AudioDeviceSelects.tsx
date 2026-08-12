import { Room } from 'livekit-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useVoiceStore } from '../stores/voice';
import Select from './Select';

interface DeviceOption {
  deviceId: string;
  label: string;
}

/** Селекты микрофона и вывода — используются в попапе голоса и в настройках */
export default function AudioDeviceSelects() {
  const { t } = useTranslation();
  const voice = useVoiceStore();
  const [mics, setMics] = useState<DeviceOption[]>([]);
  const [outputs, setOutputs] = useState<DeviceOption[]>([]);

  useEffect(() => {
    // true — запросить доступ к микрофону, если его ещё нет (иначе ярлыки пустые)
    void Room.getLocalDevices('audioinput', true).then((devices) =>
      setMics(devices.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
    );
    void Room.getLocalDevices('audiooutput', true).then((devices) =>
      setOutputs(devices.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
    );
  }, []);

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
    </>
  );
}
