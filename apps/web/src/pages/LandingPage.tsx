import {
  ArrowRight,
  ChevronDown,
  Hash,
  Headphones,
  Lock,
  MessageSquare,
  Mic,
  Monitor,
  MonitorUp,
  Palette,
  Paperclip,
  Phone,
  PhoneOff,
  Plus,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router';

import { isTauri } from '../lib/tauri';
import { useAuthStore } from '../stores/auth';
import Logo from '../components/Logo';
import '../landing.css';

/** Где лежит установщик; задаётся при сборке (VITE_DOWNLOAD_URL) */
const DOWNLOAD_URL = import.meta.env.VITE_DOWNLOAD_URL as string | undefined;

const YEAR = new Date().getFullYear();

/**
 * Блок, который проявляется при прокрутке. Наблюдатель срабатывает один
 * раз: повторное появление не должно перезапускать анимацию.
 */
function Reveal({
  children,
  delay = 0,
  from = 'up',
}: {
  children: ReactNode;
  delay?: number;
  from?: 'up' | 'left' | 'right' | 'zoom';
}) {
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
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`reveal from-${from}`} ref={ref} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Число, которое досчитывается до значения, когда попадает на экран */
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(to);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      const started = performance.now();
      const DURATION = 1100;
      const step = (now: number): void => {
        const progress = Math.min(1, (now - started) / DURATION);
        // Замедление к концу: счётчик «доезжает», а не обрывается
        setValue(Math.round(to * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [to]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

/** Карточка возможности с подсветкой под курсором */
function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  const onMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const box = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - box.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - box.top}px`);
  };

  return (
    <div className="lp-feature" onMouseMove={onMove}>
      <span className="lp-feature-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

/** Вопрос с раскрывающимся ответом */
function Faq({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lp-faq${open ? ' open' : ''}`}>
      <button onClick={() => setOpen((v) => !v)}>
        {question}
        <ChevronDown size={18} />
      </button>
      <div className="lp-faq-answer">
        <p>{answer}</p>
      </div>
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
      <div className="lp-preview-bar">
        <span />
        <span />
        <span />
      </div>
      <div className="lp-preview-body">
        <div className="lp-preview-rail">
          <span className="lp-rail-dot home">
            <MessageSquare size={15} />
          </span>
          <span className="lp-rail-dot active">Н</span>
          <span className="lp-rail-dot add">
            <Plus size={14} />
          </span>
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
            <span className="lp-msg-avatar a">А</span>
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
            <span className="lp-send">
              <Send size={13} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Приветственная страница: что такое Voxa и как начать */
export default function LandingPage() {
  const status = useAuthStore((s) => s.status);
  const heroRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [downloadNote, setDownloadNote] = useState(false);

  // Подсветка следует за курсором в первом экране
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const onMove = (e: MouseEvent): void => {
      const box = hero.getBoundingClientRect();
      hero.style.setProperty('--gx', `${e.clientX - box.left}px`);
      hero.style.setProperty('--gy', `${e.clientY - box.top}px`);
    };
    hero.addEventListener('mousemove', onMove);
    return () => hero.removeEventListener('mousemove', onMove);
  }, []);

  // Плавающая кнопка появляется, когда шапка уходит вверх, и прячется у
  // самого низа страницы — иначе она перекрывает строку о правах
  useEffect(() => {
    const onScroll = (): void => {
      const bottomReached = window.scrollY + window.innerHeight > document.body.scrollHeight - 160;
      setScrolled(window.scrollY > 520 && !bottomReached);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Вошедшего сразу пускаем внутрь: витрина ему уже не нужна
  if (status === 'authed') return <Navigate to="/home" replace />;
  // В десктопном приложении витрины быть не должно — это сайт, а не окно
  if (isTauri()) return <Navigate to="/login" replace />;

  const downloadButton = (extra = ''): ReactNode =>
    DOWNLOAD_URL ? (
      <a className={`lp-btn primary ${extra}`} href={DOWNLOAD_URL} rel="noreferrer noopener">
        <Monitor size={17} /> Скачать для Windows
      </a>
    ) : (
      <button className={`lp-btn primary ${extra}`} onClick={() => setDownloadNote(true)}>
        <Monitor size={17} /> Скачать для Windows
      </button>
    );

  return (
    <div className="lp" id="top">
      {/* Живой фон: медленно плывущие световые пятна */}
      <div className="lp-aurora" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <a className="lp-logo" href="#top">
            <Logo className="lp-logo-mark" />
            Voxa
          </a>
          <nav className="lp-nav">
            <a href="#features">Возможности</a>
            <a href="#voice">Голос</a>
            <a href="#steps">Как начать</a>
            <a href="#faq">Вопросы</a>
          </nav>
          <Link className="lp-btn ghost" to="/login">
            Открыть Voxa
          </Link>
        </div>
      </header>

      <section className="lp-hero" ref={heroRef}>
        <div className="lp-wrap">
          <div className="lp-hero-text">
            <p className="lp-eyebrow rise" style={{ animationDelay: '60ms' }}>
              <Sparkles size={14} /> Приложение для общения
            </p>
            <h1>
              <span className="rise" style={{ animationDelay: '140ms' }}>
                Голос, чаты и звонки —
              </span>
              <span className="rise accent" style={{ animationDelay: '240ms' }}>
                всё в одном месте
              </span>
            </h1>
            <p className="lp-lead rise" style={{ animationDelay: '340ms' }}>
              Voxa — место, где собирается своя компания. Пишите в личку и в общие каналы, заходите
              в голосовой одним кликом, звоните с камерой, добавляйте друзей и создавайте серверы
              под каждое увлечение.
            </p>
            <div className="lp-cta rise" style={{ animationDelay: '440ms' }}>
              {downloadButton()}
              <Link className="lp-btn" to="/login">
                Открыть в браузере <ArrowRight size={16} />
              </Link>
            </div>
            {downloadNote && (
              <p className="lp-note warn">Установщик появится после публикации сборки.</p>
            )}
            <p className="lp-note rise" style={{ animationDelay: '540ms' }}>
              После входа — чистый профиль: заполняете его и зовёте своих.
            </p>
          </div>

          <div className="lp-preview-wrap rise" style={{ animationDelay: '620ms' }}>
            <AppPreview />
          </div>

          <div className="lp-stats">
            <Reveal delay={0}>
              <div className="lp-stat">
                <b>
                  <Counter to={15} />
                </b>
                <span>человек в одном голосовом канале</span>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="lp-stat">
                <b>
                  <Counter to={20} />
                </b>
                <span>участников в групповой беседе</span>
              </div>
            </Reveal>
            <Reveal delay={160}>
              <div className="lp-stat">
                <b>
                  <Counter to={0} />
                </b>
                <span>рекламы и слежки за вами</span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="lp-section" id="features">
        <div className="lp-wrap">
          <Reveal>
            <p className="lp-kicker">Возможности</p>
            <h2>Всё для общения — в одном приложении</h2>
            <p className="lp-section-lead">
              Личные сообщения, общие каналы, голос и видео. Ничего лишнего и ничего, за что нужно
              доплачивать.
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
                title="Серверы под любую компанию"
                text="Отдельное пространство для друзей, игр или учёбы: каналы, роли и права настраиваются под каждое."
              />
            </Reveal>
            <Reveal delay={120}>
              <Feature
                icon={<Palette size={20} />}
                title="Свой профиль"
                text="Аватар, имя, статус и акцентный цвет карточки. Тёмная и светлая темы, интерфейс полностью на русском."
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="lp-section lp-voice" id="voice">
        <div className="lp-wrap lp-split">
          <Reveal from="left">
            <div>
              <p className="lp-kicker">Голос</p>
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
          <Reveal from="right" delay={120}>
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
                <span className="lp-voice-btn">
                  <Mic size={17} />
                </span>
                <span className="lp-voice-btn">
                  <Headphones size={17} />
                </span>
                <span className="lp-voice-btn">
                  <MonitorUp size={17} />
                </span>
                <span className="lp-voice-btn danger">
                  <PhoneOff size={17} />
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-section" id="own">
        <div className="lp-wrap lp-split reverse">
          <Reveal from="left">
            <div className="lp-own-card">
              <Lock size={22} />
              <p>
                Никакой рекламы, рекомендаций и сбора данных. Переписка нужна только вам и вашим
                собеседникам — и остаётся между вами.
              </p>
            </div>
          </Reveal>
          <Reveal from="right" delay={120}>
            <div>
              <p className="lp-kicker">Приватность</p>
              <h2>Личное остаётся личным</h2>
              <p className="lp-section-lead">
                Voxa не зарабатывает на ваших разговорах: здесь нет рекламы, подписок и встроенной
                аналитики.
              </p>
              <ul className="lp-list">
                <li>
                  <ShieldCheck size={16} /> Пароли хранятся хешами, вход защищён от перебора
                </li>
                <li>
                  <Lock size={16} /> Соединение по HTTPS, файлы отдаются в песочнице
                </li>
                <li>
                  <Users size={16} /> Закрытый круг: аккаунт создаётся по приглашению
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-section lp-steps" id="steps">
        <div className="lp-wrap">
          <Reveal>
            <p className="lp-kicker">Как начать</p>
            <h2>Три шага до первого сообщения</h2>
          </Reveal>
          <div className="lp-steps-row">
            <Reveal delay={0}>
              <div className="lp-step">
                <span className="lp-step-num">1</span>
                <h3>Заведите аккаунт</h3>
                <p>По коду приглашения от того, кто позвал вас в Voxa.</p>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="lp-step">
                <span className="lp-step-num">2</span>
                <h3>Заполните профиль</h3>
                <p>Аватар, имя, пара слов о себе и цвет карточки — минута дела.</p>
              </div>
            </Reveal>
            <Reveal delay={180}>
              <div className="lp-step">
                <span className="lp-step-num">3</span>
                <h3>Позовите своих</h3>
                <p>Добавьте друзей, создайте сервер — и заходите в голосовой.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="lp-section" id="faq">
        <div className="lp-wrap lp-faq-wrap">
          <Reveal>
            <p className="lp-kicker">Вопросы</p>
            <h2>Коротко о главном</h2>
          </Reveal>
          <Reveal delay={80}>
            <div className="lp-faqs">
              <Faq
                question="Нужно ли что-то платить?"
                answer="Нет. В Voxa нет подписок, внутренних покупок и платных возможностей — все функции доступны сразу."
              />
              <Faq
                question="Чем приложение отличается от версии в браузере?"
                answer="Ничем по возможностям. Приложение дополнительно умеет сворачиваться в трей, запускаться вместе с системой и выключать микрофон горячими клавишами, даже когда окно неактивно."
              />
              <Faq
                question="Кто видит мою переписку?"
                answer="Только те, кому вы пишете. Рекламных модулей и аналитики в приложении нет, переписка не используется ни для каких рекомендаций."
              />
              <Faq
                question="Сколько человек выдержит голосовой канал?"
                answer="Пятнадцать одновременно говорящих проверены нагрузочным тестом. Обычной компании этого хватает с запасом."
              />
              <Faq
                question="Можно ли зарегистрироваться без приглашения?"
                answer="Нет. Аккаунт создаётся по коду приглашения — так в Voxa не попадают случайные люди."
              />
              <Faq
                question="Что я увижу сразу после входа?"
                answer="Свой профиль и пустые списки друзей, диалогов и серверов. Дальше всё зависит от вас: добавляете друзей, создаёте сервер или принимаете приглашение в чужой."
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap">
          <Reveal from="zoom">
            <h2>Соберите своих</h2>
            <p className="lp-section-lead">
              Установите приложение или откройте Voxa прямо в браузере — возможности одинаковые.
            </p>
            <div className="lp-cta center">
              {downloadButton()}
              <Link className="lp-btn" to="/login">
                Открыть в браузере <ArrowRight size={16} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <a className="lp-logo small" href="#top">
            <Logo className="lp-logo-mark" />
            Voxa
          </a>
          <span className="lp-footer-note">© {YEAR} Voxa. Все права защищены.</span>
        </div>
      </footer>

      {/* Кнопка догоняет читателя, когда шапка уже далеко вверху */}
      <Link className={`lp-float${scrolled ? ' shown' : ''}`} to="/login">
        Открыть Voxa <ArrowRight size={16} />
      </Link>
    </div>
  );
}
