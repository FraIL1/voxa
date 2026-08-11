import type { DmConversationDto } from '@voxa/shared';
import {
  Bell,
  BellOff,
  Check,
  ChevronRight,
  LogOut,
  MessageSquareOff,
  Phone,
  Pencil,
  Pin,
  PinOff,
  StickyNote,
  UserMinus,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { dmTitle } from '../api/dm-cache';
import {
  useHideConversation,
  useLeaveGroup,
  useMarkConversationRead,
  useMuteConversation,
  useToggleConversationPin,
} from '../hooks/useDm';
import { useRemoveFriend } from '../hooks/useFriends';
import { useSetUserNote } from '../hooks/useProfile';
import { useCallStore } from '../stores/call';
import { openProfile } from '../stores/profileView';
import PromptModal from './PromptModal';

export interface DmMenuState {
  x: number;
  y: number;
  conversation: DmConversationDto;
}

/** Варианты «заглушить»: минуты или null — пока не включу обратно */
const MUTE_OPTIONS: { key: string; minutes: number | null }[] = [
  { key: 'mute15m', minutes: 15 },
  { key: 'mute1h', minutes: 60 },
  { key: 'mute3h', minutes: 180 },
  { key: 'mute8h', minutes: 480 },
  { key: 'mute24h', minutes: 1440 },
  { key: 'muteForever', minutes: null },
];

/** Правый клик по диалогу: всё, что можно сделать с перепиской и человеком */
export default function DmContextMenu({
  menu,
  onClose,
}: {
  menu: DmMenuState;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [muteOpen, setMuteOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [aliasOpen, setAliasOpen] = useState(false);

  const togglePin = useToggleConversationPin();
  const markRead = useMarkConversationRead();
  const hide = useHideConversation();
  const mute = useMuteConversation();
  const leaveGroup = useLeaveGroup();
  const removeFriend = useRemoveFriend();
  const setNote = useSetUserNote();
  const startCall = useCallStore((s) => s.startCall);
  const callStatus = useCallStore((s) => s.status);

  const { conversation } = menu;
  const peer = conversation.peer;
  const title = dmTitle(conversation);
  const muted = Boolean(conversation.mutedUntil && new Date(conversation.mutedUntil) > new Date());

  // Меню у правого края экрана: подменю раскрываем влево
  const flipLeft = menu.x > window.innerWidth - 480;

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const act =
    (fn: () => void): (() => void) =>
    () => {
      onClose();
      fn();
    };

  return (
    <>
      <div
        className={`context-menu${flipLeft ? ' flip-left' : ''}`}
        ref={ref}
        style={{
          left: flipLeft ? undefined : menu.x,
          right: flipLeft ? 12 : undefined,
          top: menu.y,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="menu-title">{title}</div>

        {conversation.unreadCount > 0 && (
          <button className="menu-item" onClick={act(() => markRead.mutate(conversation.id))}>
            <Check size={15} /> {t('dm.markRead')}
          </button>
        )}

        <button
          className="menu-item"
          onClick={act(() =>
            togglePin.mutate({ conversationId: conversation.id, pinned: conversation.pinned }),
          )}
        >
          {conversation.pinned ? <PinOff size={15} /> : <Pin size={15} />}
          {conversation.pinned ? t('dm.unpinChat') : t('dm.pinChat')}
        </button>

        <div className="menu-divider" />

        {peer && (
          <>
            <button className="menu-item" onClick={act(() => openProfile(peer.id))}>
              <UserRound size={15} /> {t('profile.title')}
            </button>
            <button
              className="menu-item"
              disabled={callStatus !== 'idle'}
              onClick={act(
                () => void startCall(conversation.id, peer.displayName, false, peer.avatarUrl),
              )}
            >
              <Phone size={15} /> {t('dm.startCallShort')}
            </button>
            <button className="menu-item" onClick={act(() => setNoteOpen(true))}>
              <StickyNote size={15} /> {t('dm.addNote')}
            </button>
            <button className="menu-item" onClick={act(() => setAliasOpen(true))}>
              <Pencil size={15} /> {t('dm.addAlias')}
            </button>
          </>
        )}

        <div className="menu-divider" />

        {/* Заглушить: подменю сроков, повторный клик по пункту снимает */}
        {muted ? (
          <button
            className="menu-item"
            onClick={act(() =>
              mute.mutate({ conversationId: conversation.id, minutes: undefined }),
            )}
          >
            <Bell size={15} /> {t('dm.unmute')}
          </button>
        ) : (
          <div
            className="menu-sub"
            onMouseEnter={() => setMuteOpen(true)}
            onMouseLeave={() => setMuteOpen(false)}
          >
            <button className="menu-item" onClick={() => setMuteOpen(true)}>
              <BellOff size={15} /> {t('dm.mute', { name: title })}
              <ChevronRight size={15} className="menu-chevron" />
            </button>
            {muteOpen && (
              <div className="menu-sub-list">
                {MUTE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    className="menu-item"
                    onClick={act(() =>
                      mute.mutate({ conversationId: conversation.id, minutes: option.minutes }),
                    )}
                  >
                    {t(`dm.${option.key}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {conversation.isGroup ? (
          <button
            className="menu-item danger"
            onClick={act(() =>
              leaveGroup.mutate(conversation.id, { onSuccess: () => navigate('/home') }),
            )}
          >
            <LogOut size={15} /> {t('dm.groupLeave')}
          </button>
        ) : (
          <button className="menu-item" onClick={act(() => hide.mutate(conversation.id))}>
            <MessageSquareOff size={15} /> {t('dm.closeChat')}
          </button>
        )}

        {peer && (
          <button className="menu-item danger" onClick={act(() => removeFriend.mutate(peer.id))}>
            <UserMinus size={15} /> {t('profile.removeFriend')}
          </button>
        )}
      </div>

      {noteOpen && peer && (
        <PromptModal
          title={t('dm.noteTitle', { name: peer.displayName })}
          label={t('dm.noteLabel')}
          maxLength={500}
          allowEmpty
          onClose={() => setNoteOpen(false)}
          onSubmit={(value) => setNote.mutate({ userId: peer.id, note: value })}
        />
      )}

      {aliasOpen && peer && (
        <PromptModal
          title={t('dm.aliasTitle', { name: peer.displayName })}
          label={t('dm.aliasLabel')}
          maxLength={32}
          allowEmpty
          onClose={() => setAliasOpen(false)}
          onSubmit={(value) => setNote.mutate({ userId: peer.id, alias: value })}
        />
      )}
    </>
  );
}
