/**
 * Знак Voxa. Это тот же файл, что и иконка приложения, — так знак на сайте,
 * в окне и в панели задач совпадает до пикселя. Рисовать его вёрсткой нельзя:
 * скругление и форма буквы получались чуть другими.
 */
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <img className={`logo-mark${className ? ` ${className}` : ''}`} src="/icon-512.png" alt="" />
  );
}
