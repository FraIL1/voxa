import type { UserPublicDto } from '@voxa/shared';
import {
  Headphones,
  HeadphoneOff,
  Maximize,
  Maximize2,
  Mic,
  MonitorPlay,
  MonitorUp,
  MicOff,
  Minimize2,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthStore } from '../stores/auth';
import {
  localVideoTrack,
  remoteVideoTrack,
  screenTrackOf,
  SELF_SCREEN_CALL,
  useCallStore,
} from '../stores/call';
import { useVoiceStore } from '../stores/voice';
import Avatar from './Avatar';
import LiveVideo from './LiveVideo';
import ShareOptionsModal from './ShareOptionsModal';
import VolumeMenu, { type VolumeMenuState } from './VolumeMenu';

/** Плитка участника: экран, если показывает; иначе видео или аватар */
function CallTile({
  userId,
  speaking = false,
  name,
  avatarUrl,
  self,
  withVideo,
  version,
  leaving = false,
  screenOwner = null,
  focused = false,
  onToggleFocus,
  onVolumeMenu,
}: {
  userId: string;
  /** Говорит прямо сейчас — плитка подсвечивается */
  speaking?: boolean;
  name: string;
  avatarUrl?: string | null;
  self?: boolean;
  withVideo: boolean;
  /** Смена дорожек: заново привязываем видео, не пересоздавая плитку */
  version: number;
  /** Человек вышел — плитка доигрывает уход и только потом пропадает */
  leaving?: boolean;
  /** Ключ дорожки демонстрации; null — человек экран не показывает */
  screenOwner?: string | null;
  /** Плитка развёрнута на всю ширину сцены */
  focused?: boolean;
  onToggleFocus?: () => void;
  /** Правый клик по чужой плитке — настройка его громкости */
  onVolumeMenu?: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    const track = self ? localVideoTrack() : remoteVideoTrack(userId);
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [userId, self, withVideo, version]);

  /* Демонстрация живёт в плитке того, кто показывает: раньше она уезжала
     отдельным блоком под звонок, и было непонятно, чей это экран. */
  useEffect(() => {
    const element = screenRef.current;
    const track = screenOwner ? screenTrackOf(screenOwner) : null;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [screenOwner, version]);

  const goFullscreen = (): void => {
    void boxRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  /* Ушедшего снимаем с потока в его последней позиции: соседи сразу
     смыкаются, а плитка гаснет там, где сидела. Иначе на её месте на всё
     время анимации оставалась дыра. */
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || !leaving) return;
    const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = el;
    el.style.left = `${offsetLeft}px`;
    el.style.top = `${offsetTop}px`;
    el.style.width = `${offsetWidth}px`;
    el.style.height = `${offsetHeight}px`;
    el.style.position = 'absolute';
  }, [leaving]);

  return (
    <div
      ref={boxRef}
      className={`call-tile${self ? ' self' : ''}${withVideo || screenOwner ? ' video' : ''}${
        speaking ? ' speaking' : ''
      }${leaving ? ' leaving' : ''}${screenOwner ? ' screen' : ''}${focused ? ' focused' : ''}`}
      onContextMenu={onVolumeMenu}
    >
      {screenOwner ? (
        <LiveVideo ref={screenRef} className="call-video call-video-screen" muted />
      ) : withVideo ? (
        <LiveVideo ref={ref} className="call-video" muted={self} />
      ) : (
        <Avatar name={name} url={avatarUrl} className="call-tile-avatar" />
      )}

      {/* По экрану можно щёлкнуть, чтобы развернуть его на всю сцену */}
      {screenOwner && (
        <button
          className="call-screen-hit"
          title={focused ? t('call.screenCollapse') : t('call.screenExpand')}
          onClick={onToggleFocus}
        />
      )}

      <span className="call-tile-label">
        {screenOwner && <MonitorPlay size={12} />}
        {screenOwner ? t('call.screenOf', { name }) : name}
      </span>

      {screenOwner && (
        <div className="call-screen-tools">
          <button
            className="icon-button"
            title={focused ? t('call.screenCollapse') : t('call.screenExpand')}
            onClick={onToggleFocus}
          >
            {focused ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button className="icon-button" title={t('call.screenFullscreen')} onClick={goFullscreen}>
            <Maximize size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Сколько плитка доигрывает уход, прежде чем пропасть */
const LEAVE_ANIM_MS = 320;

interface RosterEntry {
  user: UserPublicDto;
  leaving: boolean;
}

/**
 * Состав разговора с задержкой на уход: тот, кто вышел, остаётся в списке
 * ещё на время анимации. Без этого плитки появлялись и исчезали рывком, и
 * по экрану нельзя было понять, что кто-то присоединился или ушёл.
 */
function useCallRoster(present: UserPublicDto[]): RosterEntry[] {
  const key = present.map((p) => p.id).join(',');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    setRoster((prev) => {
      const next: RosterEntry[] = [];

      // Кто в разговоре сейчас; вернувшемуся снимаем метку ухода
      for (const user of present) {
        const timer = timers.current.get(user.id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          timers.current.delete(user.id);
        }
        next.push({ user, leaving: false });
      }

      // Кого уже нет — держим, пока доиграет анимация
      for (const entry of prev) {
        if (present.some((p) => p.id === entry.user.id)) continue;
        next.push({ user: entry.user, leaving: true });
        if (timers.current.has(entry.user.id)) continue;
        const id = window.setTimeout(() => {
          timers.current.delete(entry.user.id);
          setRoster((cur) => cur.filter((e) => !(e.user.id === entry.user.id && e.leaving)));
        }, LEAVE_ANIM_MS);
        timers.current.set(entry.user.id, id);
      }
      return next;
    });
    // present меняется каждый рендер по ссылке — следим за составом, не за массивом
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending.values()) window.clearTimeout(id);
    };
  }, []);

  return roster;
}

/** Длительность разговора в формате мм:сс (часы добавляются после часа) */
function useDuration(startedAt: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = String(Math.floor(total / 60) % 60).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

/** Экран активного разговора: участники, видео и управление */
export default function CallPanel({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const status = useCallStore((s) => s.status);
  const activeConversation = useCallStore((s) => s.conversationId);
  const peerName = useCallStore((s) => s.peerName);
  const peerAvatar = useCallStore((s) => s.peerAvatar);
  const isGroup = useCallStore((s) => s.isGroup);
  const speaking = useCallStore((s) => s.speaking);
  const participants = useCallStore((s) => s.participants);
  const muted = useCallStore((s) => s.muted);
  const deafened = useCallStore((s) => s.deafened);
  const cameraOn = useCallStore((s) => s.cameraOn);
  const videoUserIds = useCallStore((s) => s.videoUserIds);
  const startedAt = useCallStore((s) => s.startedAt);
  // Пересоздаём привязку видео, когда дорожки меняются
  const videoVersion = useCallStore((s) => s.videoVersion);
  const error = useCallStore((s) => s.error);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleDeafen = useCallStore((s) => s.toggleDeafen);
  const toggleCamera = useCallStore((s) => s.toggleCamera);
  const hangUp = useCallStore((s) => s.hangUp);
  const toggleScreenShare = useCallStore((s) => s.toggleScreenShare);
  const sharing = useCallStore((s) => s.sharing);
  const screenSharers = useCallStore((s) => s.screenSharers);
  const [shareOpen, setShareOpen] = useState(false);
  const [volumeMenu, setVolumeMenu] = useState<VolumeMenuState | null>(null);
  const shareOptions = useVoiceStore((s) => s.shareOptions);

  /* Кто показывает экран: свой ключ отдельный, чужие — по id участника.
     Демонстрация уходит в плитку человека, а не в блок под звонком. */
  const [focusedScreen, setFocusedScreen] = useState<string | null>(null);
  useEffect(() => {
    const owners = [...(sharing ? [SELF_SCREEN_CALL] : []), ...screenSharers];
    // Появившийся экран разворачиваем сам — как в голосовом канале
    setFocusedScreen((current) =>
      current && owners.includes(current) ? current : (owners[0] ?? null),
    );
  }, [sharing, screenSharers]);

  const others = useMemo(
    () => participants.filter((p) => p.id !== me?.id),
    [participants, me?.id],
  );
  // Состав держим хуком — он же доигрывает уход вышедших
  const roster = useCallRoster(others);
  const [collapsed, setCollapsed] = useState(false);
  const duration = useDuration(startedAt);

  if (activeConversation !== conversationId || (status !== 'active' && status !== 'outgoing')) {
    return null;
  }

  /* Пока идёт дозвон — крупная карточка того, кому звоним. Как только
     разговор пошёл, показываем плитками всех, включая себя: раньше вдвоём
     была видна только аватарка собеседника, и было непонятно, кто уже здесь. */
  const ringing = status === 'outgoing';
  const asGrid = !ringing;

  const statusText =
    status === 'outgoing'
      ? t('call.calling', { name: peerName })
      : (duration ?? t('call.connecting'));

  return (
    <div
      className={`call-stage${collapsed ? ' collapsed' : ''}${asGrid ? ' with-video' : ''}${
        status === 'outgoing' ? ' ringing' : ''
      }`}
    >
      <button
        className="icon-button call-collapse"
        title={collapsed ? t('call.expand') : t('call.collapse')}
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
      </button>

      {asGrid ? (
        <div className={`call-tiles${focusedScreen ? ' spotlight' : ''}`}>
          {roster.map(({ user, leaving }) => {
            const screen = screenSharers.includes(user.id) ? user.id : null;
            return (
              <CallTile
                key={user.id}
                userId={user.id}
                name={user.displayName}
                avatarUrl={user.avatarUrl}
                withVideo={videoUserIds.includes(user.id)}
                speaking={speaking[user.id] ?? false}
                version={videoVersion}
                leaving={leaving}
                screenOwner={screen}
                focused={Boolean(screen) && focusedScreen === screen}
                onToggleFocus={() =>
                  setFocusedScreen((current) => (current === screen ? null : screen))
                }
                onVolumeMenu={(e) => {
                  e.preventDefault();
                  setVolumeMenu({
                    x: e.clientX,
                    y: e.clientY,
                    userId: user.id,
                    name: user.displayName,
                    hasScreen: Boolean(screen),
                  });
                }}
              />
            );
          })}
          <CallTile
            userId={me?.id ?? 'me'}
            name={t('call.you')}
            avatarUrl={me?.avatarUrl}
            withVideo={cameraOn}
            speaking={speaking[me?.id ?? ''] ?? false}
            version={videoVersion}
            self
            screenOwner={sharing ? SELF_SCREEN_CALL : null}
            focused={sharing && focusedScreen === SELF_SCREEN_CALL}
            onToggleFocus={() =>
              setFocusedScreen((current) =>
                current === SELF_SCREEN_CALL ? null : SELF_SCREEN_CALL,
              )
            }
          />
        </div>
      ) : (
        <div className="call-hero">
          <div className="call-avatar-wrap">
            <span className="call-pulse" aria-hidden />
            <span className="call-pulse delayed" aria-hidden />
            <Avatar
              name={others[0]?.displayName ?? peerName}
              url={others[0]?.avatarUrl ?? peerAvatar}
              className="call-avatar"
            />
          </div>
          <div className="call-name">{peerName}</div>
          <div className="call-substatus">{statusText}</div>
        </div>
      )}

      {asGrid && (
        <div className="call-overlay-status">
          <span className="call-name">{peerName}</span>
          <span className="call-substatus">
            {statusText}
            {isGroup &&
              others.length > 0 &&
              ` · ${t('call.participants', { count: others.length + 1 })}`}
          </span>
        </div>
      )}

      {error && <div className="call-error">{error}</div>}

      <div className="call-controls">
        <button
          className={`call-control${muted ? ' engaged' : ''}`}
          title={muted ? t('voice.unmute') : t('voice.mute')}
          onClick={() => void toggleMute()}
        >
          {muted ? <MicOff size={19} /> : <Mic size={19} />}
        </button>
        <button
          className={`call-control${deafened ? ' engaged' : ''}`}
          title={deafened ? t('voice.undeafen') : t('voice.deafen')}
          onClick={() => void toggleDeafen()}
        >
          {deafened ? <HeadphoneOff size={19} /> : <Headphones size={19} />}
        </button>
        <button
          className={`call-control${cameraOn ? ' engaged' : ''}`}
          title={cameraOn ? t('call.cameraOff') : t('call.cameraOn')}
          onClick={() => void toggleCamera()}
        >
          {cameraOn ? <Video size={19} /> : <VideoOff size={19} />}
        </button>
        <button
          className={`call-control${sharing ? ' engaged' : ''}`}
          title={sharing ? t('voice.stopShare') : t('voice.shareScreen')}
          onClick={() => (sharing ? void toggleScreenShare() : setShareOpen(true))}
        >
          <MonitorUp size={19} />
        </button>
        <button
          className="call-control hangup"
          title={t('call.hangUp')}
          onClick={() => void hangUp()}
        >
          <PhoneOff size={19} />
        </button>
      </div>

      {volumeMenu && <VolumeMenu menu={volumeMenu} onClose={() => setVolumeMenu(null)} />}

      {shareOpen && (
        <ShareOptionsModal
          initial={shareOptions}
          onStart={(options) => void toggleScreenShare(options)}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
