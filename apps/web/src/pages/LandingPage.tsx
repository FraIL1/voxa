import {
  ArrowRight,
  Hash,
  Headphones,
  Lock,
  MessageSquare,
  Monitor,
  Palette,
  Paperclip,
  Phone,
  Server,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router';

import { useAuthStore } from '../stores/auth';
import '../landing.css';

/** Где лежит установщик; задаётся при сборке, иначе — страница релизов */
const DOWNLOAD_URL =
  (import.meta.env.VITE_DOWNLOAD_URL as string | undefined) ??
  'https://github.com/FraIL1/voxa/releases/latest';

/**
 * Блок, который проявляется при прокрутке. Наблюдатель ставит класс один
 * раз: повторное появление не должно перезапускать анимацию.
 */
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('shown');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="reveal" ref={ref} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Карточка возможности */
function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="lp-feature">
      <span className="lp-feature-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

/**
 * Макет приложения, нарисованный вёрсткой. Настоящий скриншот пришлось бы
 * пересобирать после каждой правки интерфейса, а этот живёт вместе с темой.
 */
function AppPreview() {
  return (
    <div className="lp-preview" aria-hidden>
      <div className="lp-preview-rail">
        <span className="lp-rail-dot active" />
        <span className="lp-rail-dot" />
        <span className="lp-rail-dot" />
      </div>
      <div className="lp-preview-side">
        <div className="lp-side-title">Наш сервер</div>
        <div className="lp-side-group">Текст</div>
        <div className="lp-side-item active">
          <Hash size={12} /> общий
        </div>
        <div className="lp-side-item">
          <Hash size={12} /> мемы
        </div>
        <div className="lp-side-group">Голос</div>
        <div className="lp-side-item voice">
          <Headphones size={12} /> Посиделки
          <span className="lp-side-badge">3</span>
        </div>
      </div>
      <div className="lp-preview-main">
        <div className="lp-msg">
          <span className="lp-msg-avatar a">A</span>
          <div>
            <b>Артём</b>
            <p>Собираемся в голосовом в девять?</p>
          </div>
        </div>
        <div className="lp-msg">
          <span className="lp-msg-avatar b">М</span>
          <div>
            <b>Марина</b>
            <p>Я за. Захвачу фильм на вечер</p>
          </div>
        </div>
        <div className="lp-msg">
          <span className="lp-msg-avatar c">К</span>
          <div>
            <b>Кирилл</b>
            <p>Уже там 🎧</p>
          </div>
        </div>
        <div className="lp-composer">
          <Paperclip size={13} />
          <span>Написать в #общий</span>
          <span className="lp-send" />
        </div>
      </div>
    </div>
  );
}

/** Приветственная страница: что такое Voxa и как начать */
export default function LandingPage() {
  const status = useAuthStore((s) => s.status);

  // Вошедшего сразу пускаем внутрь: витрина ему уже не нужна
  if (status === 'authed') return <Navigate to="/home" replace />;

  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <span className="lp-logo">
            <span className="lp-logo-mark">V</span>
            Voxa
          </span>
          <nav className="lp-nav">
            <a href="#features">Возможности</a>
            <a href="#voice">Голос</a>
            <a href="#own">Свой сервер</a>
          </nav>
          <Link className="lp-btn ghost" to="/login">
            Открыть Voxa
          </Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap">
          <Reveal>
            <p className="lp-eyebrow">Своё место для общения</p>
            <h1>
              Голос, чаты и звонки —<br />
              на вашем собственном сервере
            </h1>
            <p className="lp-lead">
              Voxa — приложение для общения компанией: голосовые каналы, переписка, личные сообщения
              и звонки. Работает на вашем сервере, поэтому переписка и записи остаются только у вас
              — без рекламы, подписок и чужих глаз.
            </p>
            <div className="lp-cta">
              <a className="lp-btn primary" href={DOWNLOAD_URL} rel="noreferrer noopener">
                <Monitor size={17} /> Скачать для Windows
              </a>
              <Link className="lp-btn" to="/login">
                Открыть в браузере <ArrowRight size={16} />
              </Link>
            </div>
            <p className="lp-note">
              Регистрация по приглашению — случайные люди на ваш сервер не попадут.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <AppPreview />
          </Reveal>
        </div>
      </section>

      <section className="lp-section" id="features">
        <div className="lp-wrap">
          <Reveal>
            <h2>Всё, что нужно компании</h2>
            <p className="lp-section-lead">
              Каналы для разговоров, роли для порядка и личка для того, что не для всех.
            </p>
          </Reveal>

          <div className="lp-features">
            <Reveal delay={0}>
              <Feature
                icon={<Headphones size={20} />}
                title="Голосовые каналы"
                text="Заходишь и говоришь — без звонков и приглашений. Видно, кто в канале, кто говорит и у кого выключен микрофон."
              />
            </Reveal>
            <Reveal delay={60}>
              <Feature
                icon={<MessageSquare size={20} />}
                title="Каналы и переписка"
                text="Разметка, ответы, реакции, закреплённые сообщения и упоминания. История ищется по любому слову."
              />
            </Reveal>
            <Reveal delay={120}>
              <Feature
                icon={<Phone size={20} />}
                title="Звонки в личке"
                text="Голос и видео один на один или беседой. Опоздавший видит, что разговор идёт, и присоединяется одним кликом."
              />
            </Reveal>
            <Reveal delay={0}>
              <Feature
                icon={<Users size={20} />}
                title="Друзья и беседы"
                text="Заявки в друзья, личные диалоги, группы до двадцати человек, свои имена и заметки о людях."
              />
            </Reveal>
            <Reveal delay={60}>
              <Feature
                icon={<Server size={20} />}
                title="Свои серверы и роли"
                text="Создавайте отдельные пространства, раздавайте роли и права, закрывайте каналы от посторонних."
              />
            </Reveal>
            <Reveal delay={120}>
              <Feature
                icon={<Palette size={20} />}
                title="Тёмная и светлая темы"
                text="Оформление на выбор, свой акцент профиля и аватары. Интерфейс полностью на русском."
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="lp-section lp-voice" id="voice">
        <div className="lp-wrap lp-split">
          <Reveal>
            <div>
              <h2>Разговор без задержки</h2>
              <p className="lp-section-lead">
                Голос идёт напрямую между участниками, а сервер лишь соединяет их. Пятнадцать
                человек в одном канале — проверено нагрузочным тестом.
              </p>
              <ul className="lp-list">
                <li>
                  <Zap size={16} /> Демонстрация экрана со звуком, 720p
                </li>
                <li>
                  <Headphones size={16} /> Выбор микрофона и наушников, громкость каждого отдельно
                </li>
                <li>
                  <ShieldCheck size={16} /> Отключение микрофона и звука общей кнопкой в любом месте
                </li>
              </ul>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="lp-voice-card">
              <div className="lp-voice-tiles">
                <div className="lp-voice-tile speaking">
                  <span className="lp-msg-avatar a">А</span>
                  Артём
                </div>
                <div className="lp-voice-tile">
                  <span className="lp-msg-avatar b">М</span>
                  Марина
                </div>
                <div className="lp-voice-tile">
                  <span className="lp-msg-avatar c">К</span>
                  Кирилл
                </div>
              </div>
              <div className="lp-voice-controls">
                <span className="lp-voice-btn" />
                <span className="lp-voice-btn" />
                <span className="lp-voice-btn" />
                <span className="lp-voice-btn danger" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-section" id="own">
        <div className="lp-wrap lp-split reverse">
          <Reveal>
            <div className="lp-own-card">
              <Lock size={22} />
              <p>
                Переписка, файлы и записи разговоров лежат на вашем сервере. Никакой аналитики,
                рекламы и сторонних сервисов.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div>
              <h2>Сервер ваш — и данные тоже</h2>
              <p className="lp-section-lead">
                Voxa разворачивается на любом сервере одной командой. Вы решаете, кто получит
                приглашение, и в любой момент можете забрать все данные.
              </p>
              <ul className="lp-list">
                <li>
                  <ShieldCheck size={16} /> Пароли хранятся хешами, вход защищён от перебора
                </li>
                <li>
                  <Lock size={16} /> Соединение по HTTPS, файлы отдаются в песочнице
                </li>
                <li>
                  <Users size={16} /> Регистрация только по коду приглашения
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap">
          <Reveal>
            <h2>Соберите своих</h2>
            <p className="lp-section-lead">
              Установите приложение или откройте Voxa прямо в браузере — работает одинаково.
            </p>
            <div className="lp-cta center">
              <a className="lp-btn primary" href={DOWNLOAD_URL} rel="noreferrer noopener">
                <Monitor size={17} /> Скачать для Windows
              </a>
              <Link className="lp-btn" to="/login">
                Открыть в браузере <ArrowRight size={16} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <span className="lp-logo small">
            <span className="lp-logo-mark">V</span>
            Voxa
          </span>
          <span className="lp-footer-note">Открытый исходный код · Работает на вашем сервере</span>
          <a
            className="lp-footer-link"
            href="https://github.com/FraIL1/voxa"
            rel="noreferrer noopener"
          >
            Исходный код
          </a>
        </div>
      </footer>
    </div>
  );
}
