import AudioDeviceSelects from './AudioDeviceSelects';

/** Быстрый попап выбора устройств прямо из голосового канала */
export default function VoiceSettings({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="picker-backdrop" onClick={onClose} />
      <div className="voice-settings">
        <AudioDeviceSelects />
      </div>
    </>
  );
}
