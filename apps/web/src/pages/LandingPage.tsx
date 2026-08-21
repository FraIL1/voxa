import {
  ChevronDown,
  Hash,
  Headphones,
  Mail,
  Maximize2,
  MessageCircle,
  Mic,
  Monitor,
  MonitorUp,
  Palette,
  Paperclip,
  PhoneOff,
  Plus,
  SendHorizontal,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  Video,
  Volume2,
  Waves,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router';

import Logo from '../components/Logo';
import { isTauri } from '../lib/tauri';
import { useAuthStore } from '../stores/auth';
import '../landing.css';

const DOWNLOAD_URL = import.meta.env.VITE_DOWNLOAD_URL as string | undefined;

/** Через сколько сцена в шапке начинается заново */
const SCENE_LOOP_MS = 14_000;

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <Volume2 size={20} />,
    title: 'Голос без задержек',
    text: 'Голосовые каналы, камера и показ экрана со звуком. Задержка видна прямо в углу — не надо гадать, у кого лагает.',
  },
  {
    icon: <Mail size={20} />,
    title: 'Переписка и личные',
    text: 'Каналы на сервере и личные сообщения с друзьями. Файлы, картинки, ответы, закреплённое — всё на месте.',
  },
  {
    icon: <Shield size={20} />,
    title: 'Ты решаешь, кому что можно',
    text: 'Кто пишет, кто заходит в голосовой, кто наводит порядок. Раздал роли за минуту — и забыл.',
  },
  {
    icon: <Users size={20} />,
    title: 'Вход только по коду',
    text: 'Никакой открытой регистрации. Владелец выдаёт коды сам и в любой момент их отзывает.',
  },
  {
    icon: <Palette size={20} />,
    title: 'Свой облик',
    text: 'Тёмная и светлая тема, плотность списков, свои звуки. Настроил один раз — и приложение твоё.',
  },
  {
    icon: <Monitor size={20} />,
    title: 'Windows и браузер',
    text: 'Настольное приложение и веб-версия работают одинаково. Один аккаунт, одни настройки, разницы не заметишь.',
  },
];

const SHIELD: { title: string; text: string }[] = [
  {
    title: 'Звонки зашифрованы всегда',
    text: 'Никто со стороны не подключится и не послушает, о чём вы говорите.',
  },
  {
    title: 'Пароль знаешь только ты',
    text: 'Мы его не видим и восстановить не можем. Он нигде не лежит.',
  },
  {
    title: 'Чужие сюда не попадут',
    text: 'Зайти можно только по коду, который выдаёшь ты. Больше никак.',
  },
  {
    title: 'Ни рекламы, ни слежки',
    text: 'Никто не изучает ваши разговоры и никому их не продаёт.',
  },
];

const STEPS: { title: string; text: string }[] = [
  { title: 'Заведи аккаунт', text: 'По коду приглашения от того, кто позвал тебя в Voxa.' },
  {
    title: 'Заполни профиль',
    text: 'Аватар, имя, пара слов о себе и цвет карточки — минута дела.',
  },
  { title: 'Начни разговор', text: 'Добавь друзей, создай сервер — и заходи в голосовой.' },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Нужно ли что-то платить?',
    a: 'Нет. В Voxa нет подписок, внутренних покупок и платных возможностей — всё доступно сразу.',
  },
  {
    q: 'Чем приложение отличается от версии в браузере?',
    a: 'Ничем по возможностям. Приложение дополнительно умеет сворачиваться в трей, запускаться вместе с системой и выключать микрофон горячими клавишами, даже когда окно неактивно.',
  },
  {
    q: 'Кто видит мою переписку?',
    a: 'Только те, кому ты пишешь. Рекламы и аналитики в приложении нет, переписка не используется ни для каких рекомендаций.',
  },
  {
    q: 'Можно ли зарегистрироваться без приглашения?',
    a: 'Нет. Аккаунт создаётся по коду приглашения — так в Voxa не попадают случайные люди.',
  },
  {
    q: 'Сколько серверов можно создать?',
    a: 'Предел задаёт владелец приложения в настройках. У каждого сервера свои каналы, роли и участники — можно завести отдельный под каждую компанию или увлечение.',
  },
];

/** Участники сервера так же, как их группирует само приложение: по старшей роли */
const MEMBER_GROUPS: { label: string; color?: string; people: string[] }[] = [
  { label: 'Владелец', color: '#fbbf24', people: ['Егор'] },
  { label: 'Модератор', color: '#4ea8de', people: ['Марина'] },
  { label: 'Участник', people: ['Кирилл', 'Дима'] },
  { label: 'Не в сети', people: ['Настя', 'Паша'] },
];

/**
 * Живая сцена в шапке: окно приложения собирается из панелей, наполняется,
 * потом призрачный курсор нажимает голосовой канал и экран переезжает туда.
 *
 * Окно нарисовано по настоящему приложению: те же значки, те же подписи, то же
 * деление участников по ролям. Придумывать здесь ничего нельзя — человек
 * потом откроет Voxa и должен узнать то, что видел.
 *
 * Всё держится на таймерах, а не на прокрутке: прокрутку человек может и не
 * начать, а показать приложение надо сразу.
 */
function Showcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const voiceRowRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState('');

  // Кнопка «Проиграть заново» должна показывать ту же сцену целиком, а не
  // огрызок: держим ссылку на настоящий запуск и на круг повтора
  const playRef = useRef<() => void>(() => {});
  const loopRef = useRef(0);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void): void => {
      timers.push(window.setTimeout(fn, ms));
    };

    const moveGhost = (x: number, y: number, animate: boolean): void => {
      const ghost = ghostRef.current;
      if (!ghost) return;
      if (!animate) ghost.style.transition = 'none';
      ghost.style.transform = `translate(${x}px,${y}px)`;
      if (!animate) {
        void ghost.offsetWidth;
        ghost.style.transition = '';
      }
    };

    const play = (): void => {
      timers.forEach(clearTimeout);
      timers.length = 0;

      const root = rootRef.current;
      const ghost = ghostRef.current;
      if (!root || !ghost) return;

      setPhase('');
      ghost.style.opacity = '0';
      const box = root.getBoundingClientRect();
      moveGhost(box.width * 0.66, box.height * 0.92, false);

      /* Шаги разнесены так, чтобы каждый успевал доиграть до конца следующего,
         но нигде не возникало пустой паузы: окно раскрывается, панели
         прилетают по очереди, потом наполняются, потом падают сообщения. */
      at(150, () => setPhase('a1'));
      at(2100, () => setPhase('a1 a2'));
      at(3150, () => setPhase('a1 a2 a3'));

      // Курсор приходит и нажимает голосовой канал
      at(4750, () => {
        const rootBox = rootRef.current?.getBoundingClientRect();
        const rowBox = voiceRowRef.current?.getBoundingClientRect();
        if (!rootBox || !rowBox) return;
        // На узком экране столбца каналов нет — нажимать нечего, и курсор
        // уехал бы в угол. Сцена просто переходит в голосовой сама.
        if (rowBox.width === 0) return;
        ghost.style.opacity = '1';
        moveGhost(
          rowBox.left - rootBox.left + rowBox.width * 0.42,
          rowBox.top - rootBox.top + rowBox.height * 0.45,
          true,
        );
      });
      at(6200, () => setPhase('a1 a2 a3 click'));
      at(6550, () => setPhase('a1 a2 a3 voice'));
      at(7400, () => {
        ghost.style.opacity = '0';
      });
    };

    // После показа руками круг отсчитывается заново, иначе повтор наложится
    // на середину сцены
    const playAndReschedule = (): void => {
      play();
      window.clearInterval(loopRef.current);
      loopRef.current = window.setInterval(play, SCENE_LOOP_MS);
    };
    playRef.current = playAndReschedule;

    const start = window.setTimeout(playAndReschedule, 450);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(loopRef.current);
      timers.forEach(clearTimeout);
    };
  }, []);

  const replay = (): void => playRef.current();
  const inVoice = phase.includes('voice');

  return (
    <div className="lp-showwrap">
      <div className={`lp-showcase ${phase}`} ref={rootRef}>
        <div className="lp-frame">
          <div className="lp-chrome">
            <i />
            <i />
            <i />
            <span>Voxa</span>
          </div>

          <div className="lp-mini">
            {/* Столбец слева: личные, серверы, «добавить» */}
            <div className="lp-mc lp-mrail lp-apan lp-p1">
              <div className="lp-rhome lp-pop" style={{ '--pd': '0ms' } as React.CSSProperties}>
                <MessageCircle size={20} />
                <span>Личные</span>
              </div>
              <div className="lp-rdiv lp-pop" style={{ '--pd': '90ms' } as React.CSSProperties} />
              <div className="lp-mi on lp-pop" style={{ '--pd': '170ms' } as React.CSSProperties}>
                V
              </div>
              <div className="lp-mi lp-pop" style={{ '--pd': '250ms' } as React.CSSProperties}>
                И
              </div>
              <div className="lp-mi lp-pop" style={{ '--pd': '330ms' } as React.CSSProperties}>
                Р
              </div>
              <div className="lp-mi add lp-pop" style={{ '--pd': '410ms' } as React.CSSProperties}>
                <Plus size={16} />
              </div>
            </div>

            {/* Каналы, панель связи и своя карточка внизу */}
            <div className="lp-mc lp-apan lp-p2 lp-col">
              <div className="lp-srv lp-pop" style={{ '--pd': '60ms' } as React.CSSProperties}>
                <span>Voxa</span>
                <ChevronDown size={15} />
              </div>

              <div className="lp-chtree">
                <div className="lp-cat lp-pop" style={{ '--pd': '140ms' } as React.CSSProperties}>
                  <ChevronDown size={11} /> Текст
                </div>
                <div
                  className="lp-mrow on lp-pop"
                  style={{ '--pd': '200ms' } as React.CSSProperties}
                >
                  <Hash size={15} /> общий
                </div>
                <div className="lp-mrow lp-pop" style={{ '--pd': '260ms' } as React.CSSProperties}>
                  <Hash size={15} /> мемы
                </div>
                <div className="lp-mrow lp-pop" style={{ '--pd': '320ms' } as React.CSSProperties}>
                  <Hash size={15} /> важное
                </div>

                <div className="lp-cat lp-pop" style={{ '--pd': '380ms' } as React.CSSProperties}>
                  <ChevronDown size={11} /> Голос
                </div>
                <div
                  className="lp-mrow lp-hit lp-pop"
                  ref={voiceRowRef}
                  style={{ '--pd': '440ms' } as React.CSSProperties}
                >
                  <Volume2 size={15} /> Общий
                </div>

                {/* Кто уже в канале — приложение показывает их прямо под строкой */}
                <div className="lp-vps lp-pop" style={{ '--pd': '500ms' } as React.CSSProperties}>
                  <div className="lp-vp">
                    <span className="lp-av xs">К</span>
                    Кирилл
                    <span className="lp-air">
                      <MonitorUp size={10} /> В эфире
                    </span>
                  </div>
                  <div className="lp-vp">
                    <span className="lp-av xs">М</span>
                    Марина
                  </div>
                  {/* Своя строка появляется, только когда зашёл */}
                  <div className="lp-vpme">
                    <div>
                      <div className="lp-vp">
                        <span className="lp-av xs">Е</span>
                        Егор
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lp-mrow lp-pop" style={{ '--pd': '560ms' } as React.CSSProperties}>
                  <Volume2 size={15} /> Игры
                </div>
              </div>

              {/* Панель связи: в приложении её нет, пока не зашёл в голосовой */}
              <div className="lp-vpanel">
                <div>
                  <div className="lp-vpi">
                    <div className="lp-vp-head">
                      <span className="lp-vp-state">
                        <span className="lp-bars">
                          <i />
                          <i />
                          <i />
                        </span>
                        Голос подключён
                      </span>
                      <span className="lp-vp-ping">24 мс</span>
                    </div>
                    <div className="lp-vp-where">
                      <Volume2 size={13} />
                      <span className="lp-vp-name">Общий</span>
                      <span className="lp-vp-guild">/ Сервер Voxa</span>
                    </div>
                    <div className="lp-vp-acts">
                      {/* Камера включена — в голосовом у Егора идёт видео */}
                      <span className="lp-vp-btn on">
                        <Video size={15} />
                      </span>
                      <span className="lp-vp-btn">
                        <MonitorUp size={15} />
                      </span>
                      <span className="lp-vp-btn on">
                        <Waves size={15} />
                      </span>
                      <span className="lp-vp-btn leave">
                        <PhoneOff size={15} />
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lp-ucard lp-pop" style={{ '--pd': '620ms' } as React.CSSProperties}>
                <span className="lp-av sm">
                  Е<span className="lp-sd on" />
                </span>
                <span className="lp-uc-names">
                  <b>Егор</b>
                  <span>В сети</span>
                </span>
                <span className="lp-uc-btn">
                  <Mic size={15} />
                </span>
                <span className="lp-uc-btn">
                  <Headphones size={15} />
                </span>
                <span className="lp-uc-btn">
                  <Settings size={15} />
                </span>
              </div>
            </div>

            {/* Главное окно: переписка сменяется голосовым каналом */}
            <div className="lp-mc lp-apan lp-p3 lp-col">
              <div className="lp-mtop">
                {inVoice ? <Volume2 size={16} /> : <Hash size={16} />}
                <span>{inVoice ? 'Общий' : 'общий'}</span>
              </div>

              <div className="lp-scenes">
                <div className="lp-scene lp-sc-chat">
                  <div className="lp-mfeed">
                    {[
                      ['К', 'Кирилл', '14:02', 'Собираемся в голосовом в девять?'],
                      ['М', 'Марина', '14:07', 'Я за. Захвачу фильм на вечер'],
                      ['К', 'Кирилл', '14:09', 'Уже там, включаю экран'],
                    ].map(([letter, name, time, text], i) => (
                      <div
                        key={time}
                        className="lp-mmsg"
                        style={{ '--pd': `${i * 340}ms` } as React.CSSProperties}
                      >
                        <div className="lp-av sm">{letter}</div>
                        <div>
                          <b>{name}</b>
                          <i>{time}</i>
                          <p>{text}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="lp-typing">
                    <span className="lp-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    Марина печатает…
                  </div>
                  {/* Скрепка слева, отправка справа — как в поле ввода приложения */}
                  <div className="lp-mcomp">
                    <span className="lp-mcomp-btn">
                      <Paperclip size={14} />
                    </span>
                    <span className="lp-mcomp-text">Написать в #общий</span>
                    <span className="lp-mcomp-btn">
                      <SendHorizontal size={14} />
                    </span>
                  </div>
                </div>

                <div className="lp-scene lp-sc-voice">
                  <div className="lp-vst">
                    <div className="lp-stabs">
                      <span className="lp-stab on">
                        <MonitorUp size={12} /> Кирилл
                      </span>
                    </div>

                    <div className="lp-vbig">
                      <div className="lp-sov">
                        <span className="lp-sov-what">
                          <MonitorUp size={12} />
                          Демонстрация экрана
                          <span className="lp-sov-air">
                            <i /> Кирилл · в эфире
                          </span>
                        </span>
                        <span className="lp-sov-tools">
                          <span className="lp-sov-tool on">
                            <Volume2 size={12} /> Звук включён
                          </span>
                          <span className="lp-sov-tool">
                            <Maximize2 size={12} /> Во весь экран
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="lp-vtiles">
                      <div className="lp-vt" style={{ '--pd': '260ms' } as React.CSSProperties}>
                        <div className="lp-av md">К</div>
                        <span className="lp-vt-name">Кирилл</span>
                        <span className="lp-air">
                          <MonitorUp size={10} /> В эфире
                        </span>
                      </div>
                      <div
                        className="lp-vt speak"
                        style={{ '--pd': '340ms' } as React.CSSProperties}
                      >
                        <div className="lp-av md">М</div>
                        <span className="lp-vt-name">Марина</span>
                      </div>
                      <div className="lp-vt cam" style={{ '--pd': '420ms' } as React.CSSProperties}>
                        <span className="lp-vt-name">Егор</span>
                      </div>
                    </div>
                  </div>

                  {/* Кнопки без подписей — ровно как в приложении */}
                  <div className="lp-vctl">
                    <span className="lp-vb">
                      <Mic size={17} />
                    </span>
                    <span className="lp-vb">
                      <Headphones size={17} />
                    </span>
                    <span className="lp-vb on">
                      <Video size={17} />
                    </span>
                    <span className="lp-vb">
                      <MonitorUp size={17} />
                    </span>
                    <span className="lp-vb danger">
                      <PhoneOff size={17} />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Участники: группы по ролям, как в приложении */}
            <div className="lp-mc lp-apan lp-p4">
              {MEMBER_GROUPS.map((group, gi) => (
                <div key={group.label}>
                  <div
                    className="lp-mgrp lp-pop"
                    style={{ '--pd': `${160 + gi * 130}ms` } as React.CSSProperties}
                  >
                    {group.label} — {group.people.length}
                  </div>
                  {group.people.map((name, i) => (
                    <div
                      key={name}
                      className={`lp-mprow lp-pop${group.label === 'Не в сети' ? ' dim' : ''}`}
                      style={{ '--pd': `${220 + gi * 130 + i * 55}ms` } as React.CSSProperties}
                    >
                      <div className="lp-av xs">
                        {name[0]}
                        <span className={`lp-sd ${group.label === 'Не в сети' ? 'off' : 'on'}`} />
                      </div>
                      <span className="lp-mp-text">
                        <span style={group.color ? { color: group.color } : undefined}>{name}</span>
                        {name === 'Кирилл' && (
                          <span className="lp-mp-sharing">
                            <MonitorUp size={10} /> демонстрирует экран
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="lp-sweep" />
        </div>

        <div className="lp-ghost" ref={ghostRef}>
          <span className="lp-rip" />
        </div>
      </div>

      <div className="lp-replaywrap">
        <button className="lp-playbtn" type="button" onClick={replay}>
          <span className="lp-tri" /> Проиграть заново
        </button>
      </div>
    </div>
  );
}

/** Блок, который выезжает, когда до него доскроллили */
function Reveal({
  children,
  delay = 0,
  kind = '',
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  kind?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          setShown(true);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`lp-rv ${kind} ${shown ? 'in' : ''} ${className}`}
      style={{ '--d': `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** Приветственная страница: то, что видят до входа */
export default function LandingPage() {
  const status = useAuthStore((s) => s.status);
  const [downloadNote, setDownloadNote] = useState(false);
  const [openQuestion, setOpenQuestion] = useState(0);
  const [stuck, setStuck] = useState(false);

  // Шапка уплотняется, как только страницу тронули
  useEffect(() => {
    const onScroll = (): void => setStuck(window.scrollY > 30);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Вошедшего сразу пускаем внутрь: витрина ему уже не нужна
  if (status === 'authed') return <Navigate to="/home" replace />;
  // В десктопном приложении витрины быть не должно — это сайт, а не окно
  if (isTauri()) return <Navigate to="/login" replace />;

  const downloadButton = (extra = ''): ReactNode =>
    DOWNLOAD_URL ? (
      <a className={`lp-btn pri ${extra}`} href={DOWNLOAD_URL} rel="noreferrer noopener">
        <Monitor size={17} /> Скачать для Windows
      </a>
    ) : (
      <button className={`lp-btn pri ${extra}`} onClick={() => setDownloadNote(true)}>
        <Monitor size={17} /> Скачать для Windows
      </button>
    );

  /* Пятно под курсором на карточке: считаем прямо здесь, а не в состоянии —
     положение мыши меняется десятки раз в секунду, перерисовывать нечего. */
  const trackGlow = (e: React.MouseEvent<HTMLDivElement>): void => {
    const card = e.currentTarget;
    const box = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - box.left}px`);
    card.style.setProperty('--my', `${e.clientY - box.top}px`);
  };

  return (
    <div className="lp" id="top">
      {/* Живой фон: медленно плывущие световые пятна */}
      <div className="lp-aurora" aria-hidden>
        <span className="g1" />
        <span className="g2" />
        <span className="g3" />
      </div>

      <header className={`lp-hdr${stuck ? ' stuck' : ''}`}>
        <div className="lp-hin">
          <a className="lp-logo" href="#top">
            <Logo className="lp-logo-mark" />
            <b>Voxa</b>
          </a>
          <nav className="lp-nav">
            <a href="#zashita">Защита</a>
            <a href="#vnutri">Возможности</a>
            <a href="#kak-nachat">Как начать</a>
            <a href="#voprosy">Вопросы</a>
          </nav>
          <div className="lp-hb">
            <Link className="lp-btn ghost" to="/login">
              Войти
            </Link>
            {downloadButton()}
          </div>
        </div>
      </header>

      <div className="lp-wrap">
        <section className="lp-hero">
          <Reveal delay={60}>
            <span className="lp-eyebrow">
              <i /> Только для своих
            </span>
          </Reveal>

          {/* Заголовок выезжает построчно из-под маски */}
          <h1>
            <span className="lp-line">
              <span style={{ '--d': '180ms' } as React.CSSProperties}>
                Свой голос. Свой сервер.
              </span>
            </span>
            <span className="lp-line">
              <span style={{ '--d': '320ms' } as React.CSSProperties}>
                <em>Свои люди.</em>
              </span>
            </span>
          </h1>

          <Reveal delay={480}>
            <p className="lp-lead">
              Voxa — место, где собирается своя компания. Пишите в личку и в общие каналы, заходите
              в голосовой одним кликом, звоните с камерой, добавляйте друзей и создавайте серверы
              под каждое увлечение.
            </p>
          </Reveal>

          <Reveal delay={600}>
            <div className="lp-cta">
              {downloadButton('big')}
              <Link className="lp-btn ghost big" to="/login">
                Открыть в браузере
              </Link>
            </div>
            {downloadNote && (
              <p className="lp-note warn">Установщик появится после публикации сборки.</p>
            )}
          </Reveal>

          <Reveal delay={700}>
            <p className="lp-note">Бесплатно · без рекламы · без чужой модерации</p>
          </Reveal>

          <Showcase />
        </section>

        <section className="lp-sec" id="zashita">
          <Reveal>
            <h2 className="lp-stitle">Здесь можно говорить спокойно</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="lp-ssub">Ничего включать и настраивать не надо — всё работает сразу.</p>
          </Reveal>

          <Reveal delay={150} kind="zoom" className="lp-shield-wrap">
            <div className="lp-shield">
              {SHIELD.map((item, i) => (
                <div key={item.title} className="lp-sp">
                  {/* Щит выскакивает с пружинкой, по очереди */}
                  <span
                    className="lp-shg"
                    style={{ '--d': `${200 + i * 100}ms` } as React.CSSProperties}
                    aria-hidden
                  >
                    <ShieldCheck size={18} />
                  </span>
                  <div>
                    <b>{item.title}</b>
                    <span>{item.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="lp-sec" id="vnutri">
          <Reveal>
            <h2 className="lp-stitle">Что внутри</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="lp-ssub">
              Всё, ради чего обычно ставят такие приложения. И ничего лишнего.
            </p>
          </Reveal>

          <div className="lp-cards">
            {FEATURES.map((feature, i) => (
              <Reveal key={feature.title} delay={(i % 3) * 90}>
                <div className="lp-fc" onMouseMove={trackGlow}>
                  <span className="lp-fg">{feature.icon}</span>
                  <b>{feature.title}</b>
                  <p>{feature.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="lp-sec" id="kak-nachat">
          <Reveal>
            <p className="lp-kicker">Как начать</p>
          </Reveal>
          <Reveal delay={60}>
            <h2 className="lp-stitle">Три шага до первого сообщения</h2>
          </Reveal>

          <div className="lp-steps">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 90}>
                <div className="lp-step">
                  <span className="lp-stepnum">{i + 1}</span>
                  <b>{step.title}</b>
                  <p>{step.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="lp-sec" id="voprosy">
          <Reveal>
            <p className="lp-kicker">Вопросы</p>
          </Reveal>
          <Reveal delay={60}>
            <h2 className="lp-stitle">Коротко о главном</h2>
          </Reveal>

          <div className="lp-faq">
            {FAQ.map((item, i) => (
              <Reveal key={item.q} delay={i * 60}>
                <div className={`lp-q${openQuestion === i ? ' open' : ''}`}>
                  {/* Заголовок — настоящая кнопка: до вопроса надо доходить и с клавиатуры */}
                  <button
                    type="button"
                    className="lp-qh"
                    aria-expanded={openQuestion === i}
                    onClick={() => setOpenQuestion(openQuestion === i ? -1 : i)}
                  >
                    {item.q}
                    <span className="lp-pm" aria-hidden>
                      +
                    </span>
                  </button>
                  <div className="lp-qa">
                    <div>
                      <p>{item.a}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <Reveal kind="zoom">
          <section className="lp-final">
            <b>Позови своих</b>
            <p>
              Поставь приложение, создай сервер и раздай коды. Пять минут — и вы уже в голосовом.
            </p>
            <div className="lp-cta">
              {downloadButton('big')}
              <Link className="lp-btn ghost big" to="/login">
                Открыть в браузере
              </Link>
            </div>
          </section>
        </Reveal>
      </div>

      <footer className="lp-foot">
        <div className="lp-fin">
          <a className="lp-logo" href="#top">
            <Logo className="lp-logo-mark sm" />
            <b>Voxa</b>
          </a>
          <div className="lp-flinks">
            <a href="#zashita">Защита</a>
            <a href="#vnutri">Возможности</a>
            <a href="#kak-nachat">Как начать</a>
            <a href="#voprosy">Вопросы</a>
          </div>
        </div>
        <p className="lp-copy">© 2026 Voxa. Все права защищены.</p>
      </footer>
    </div>
  );
}
