import Logo from './Logo';

/**
 * Экран запуска: показывается, пока приложение проверяет сохранённый вход.
 * Своя анимация вместо крутящегося колечка — знак и звуковая волна под ним.
 */
export default function Splash({ hint }: { hint: string }) {
  return (
    <div className="splash">
      <div className="splash-mark">
        <span className="splash-ring" aria-hidden />
        <span className="splash-ring delayed" aria-hidden />
        <Logo className="splash-logo" />
      </div>

      <div className="splash-wave" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <p className="splash-hint">{hint}</p>
    </div>
  );
}
