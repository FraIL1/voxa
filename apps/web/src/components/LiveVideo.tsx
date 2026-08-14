import { forwardRef, type SyntheticEvent } from 'react';

/**
 * Видео разговора: камера или демонстрация экрана.
 *
 * Это прямой эфир, а не запись, поэтому у него нет и не должно быть
 * проигрывателя. Браузер по правому клику предлагает паузу и «картинку в
 * картинке» — пауза при этом останавливает только твой собственный просмотр,
 * собеседники продолжают всё видеть. Выглядит это так, будто эфир
 * остановился, поэтому меню отключено, а случайная пауза сразу снимается.
 */
const LiveVideo = forwardRef<HTMLVideoElement, { className?: string; muted?: boolean }>(
  function LiveVideo({ className, muted = true }, ref) {
    const resume = (e: SyntheticEvent<HTMLVideoElement>): void => {
      void e.currentTarget.play().catch(() => undefined);
    };

    return (
      <video
        ref={ref}
        className={className}
        autoPlay
        playsInline
        muted={muted}
        disablePictureInPicture
        controlsList="nodownload noplaybackrate noremoteplayback"
        onContextMenu={(e) => e.preventDefault()}
        onPause={resume}
      />
    );
  },
);

export default LiveVideo;
