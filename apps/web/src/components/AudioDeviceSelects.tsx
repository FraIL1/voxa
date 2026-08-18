import { Room } from 'livekit-client';
import { Bell, BellOff, Play } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  echoCancellation,
  micGain,
  outputVolume,
  setEchoCancellation,
  setMicGain,
  setOutputVolume,
} from '../lib/audio-io';
import { applyNoiseSuppression, noiseSuppression } from '../lib/audio-io';
import { playPreview, setSoundsEnabled, soundsEnabled } from '../lib/sounds';
import { useVoiceStore } from '../stores/voice';
import Select from './Select';

interface DeviceOption {
  deviceId: string;
  label: string;
}

/** Строка настройки: слева название и пояснение, справа сам переключатель */
function Row({ name, hint, children }: { name: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-row-text">
        <span className="setting-row-name">{name}</span>
        {hint && <span className="setting-row-hint">{hint}</span>}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

/** Переключатель-тумблер: свой, чтобы выглядел одинаково во всех браузерах */
function Toggle({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return (
    <span className="owner-switch">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="owner-switch-track" />
    </span>
  );
}

/** Ползунок со значением справа: без числа непонятно, куда его тянуть */
function Slider({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="setting-slider">
      <input
        className="volume-slider level-slider"
        type="range"
        min={0}
        max={max}
        step={5}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="level-value">{value}%</span>
    </div>
  );
}

/** Устройства голоса и видео. Проверка живёт отдельно — в правой колонке */
export default function AudioDeviceSelects() {
  const { t } = useTranslation();
  const voice = useVoiceStore();
  const [mics, setMics] = useState<DeviceOption[]>([]);
  const [outputs, setOutputs] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [sounds, setSounds] = useState(soundsEnabled);
  const [gain, setGain] = useState(micGain);
  const [output, setOutput] = useState(outputVolume);
  const [noise, setNoise] = useState(noiseSuppression);
  const [echo, setEcho] = useState(echoCancellation);

  useEffect(() => {
    // true — запросить доступ, если его ещё нет: иначе ярлыки устройств пустые
    void Room.getLocalDevices('audioinput', true).then((devices) =>
      setMics(devices.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
    );
    void Room.getLocalDevices('audiooutput', true).then((devices) =>
      setOutputs(devices.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
    );
    void Room.getLocalDevices('videoinput', true).then((devices) =>
      setCameras(devices.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
    );
  }, []);

  const toOptions = (devices: DeviceOption[]): { value: string; label: string }[] =>
    devices.map((d) => ({ value: d.deviceId, label: d.label || t('voice.defaultDevice') }));

  return (
    <>
      <div className="setting-group-name">{t('voice.grpMic')}</div>

      <Row name={t('voice.device')} hint={t('voice.micDeviceHint')}>
        <Select
          value={voice.micDeviceId ?? 'default'}
          options={toOptions(mics)}
          placeholder={t('voice.defaultDevice')}
          onChange={(value) => void voice.setAudioDevice('audioinput', value)}
        />
      </Row>

      <Row name={t('voice.micVolume')} hint={t('voice.micVolumeHint')}>
        <Slider
          value={Math.round(gain * 100)}
          max={200}
          label={t('voice.micVolume')}
          onChange={(next) => {
            setGain(next / 100);
            setMicGain(next / 100);
          }}
        />
      </Row>

      <Row name={t('voice.noise')} hint={t('voice.noiseHint')}>
        <Toggle
          on={noise}
          onChange={(next) => {
            setNoise(next);
            void applyNoiseSuppression(next);
          }}
        />
      </Row>

      <Row name={t('voice.echo')} hint={t('voice.echoHint')}>
        <Toggle
          on={echo}
          onChange={(next) => {
            setEcho(next);
            setEchoCancellation(next);
          }}
        />
      </Row>

      <div className="setting-group-name">{t('voice.grpSound')}</div>

      <Row name={t('voice.output')} hint={t('voice.outputDeviceHint')}>
        <Select
          value={voice.outputDeviceId ?? 'default'}
          options={toOptions(outputs)}
          placeholder={t('voice.defaultDevice')}
          onChange={(value) => void voice.setAudioDevice('audiooutput', value)}
        />
      </Row>

      <Row name={t('voice.outputVolume')} hint={t('voice.outputVolumeHint')}>
        <Slider
          value={Math.round(output * 100)}
          max={100}
          label={t('voice.outputVolume')}
          onChange={(next) => {
            setOutput(next / 100);
            setOutputVolume(next / 100);
          }}
        />
      </Row>

      <Row name={t('voice.sounds')} hint={t('voice.soundsHint')}>
        <button
          type="button"
          className="btn-secondary"
          title={t('voice.soundsPreview')}
          disabled={!sounds}
          onClick={() => playPreview()}
        >
          <Play size={15} />
        </button>
        {sounds ? <Bell size={16} /> : <BellOff size={16} />}
        <Toggle
          on={sounds}
          onChange={(next) => {
            setSounds(next);
            setSoundsEnabled(next);
            if (next) playPreview();
          }}
        />
      </Row>

      <div className="setting-group-name">{t('voice.grpCamera')}</div>

      <Row name={t('voice.device')} hint={t('voice.cameraDeviceHint')}>
        <Select
          value={voice.cameraDeviceId ?? 'default'}
          options={toOptions(cameras)}
          placeholder={t('voice.defaultDevice')}
          onChange={(value) => void voice.setCameraDevice(value)}
        />
      </Row>
    </>
  );
}
