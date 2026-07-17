import type { MessageDto } from '@voxa/shared';
import { create } from 'zustand';

interface TypingEntry {
  username: string;
  /** После этого момента запись считается устаревшей */
  expiresAt: number;
}

interface ChatState {
  /** Сообщение, на которое готовится ответ (баннер в композере) */
  replyTo: MessageDto | null;
  setReplyTo: (message: MessageDto | null) => void;

  /** Только что выданный таймаут — модалка по центру (null — скрыта) */
  timeoutNotice: string | null;
  setTimeoutNotice: (until: string | null) => void;

  /** channelId → userId → кто печатает */
  typing: Record<string, Record<string, TypingEntry>>;
  markTyping: (channelId: string, userId: string, username: string) => void;
  /** Удаление протухших записей; вызывается по таймеру индикатора */
  pruneTyping: () => void;
  /** Печатающий отправил сообщение — сразу убираем его из индикатора */
  clearTypingUser: (channelId: string, userId: string) => void;
}

const TYPING_TTL_MS = 4000;

export const useChatStore = create<ChatState>()((set) => ({
  replyTo: null,
  setReplyTo: (message) => set({ replyTo: message }),

  timeoutNotice: null,
  setTimeoutNotice: (until) => set({ timeoutNotice: until }),

  typing: {},

  markTyping: (channelId, userId, username) =>
    set((state) => ({
      typing: {
        ...state.typing,
        [channelId]: {
          ...state.typing[channelId],
          [userId]: { username, expiresAt: Date.now() + TYPING_TTL_MS },
        },
      },
    })),

  pruneTyping: () =>
    set((state) => {
      const now = Date.now();
      let changed = false;
      const next: ChatState['typing'] = {};
      for (const [channelId, users] of Object.entries(state.typing)) {
        const alive = Object.fromEntries(
          Object.entries(users).filter(([, entry]) => entry.expiresAt > now),
        );
        if (Object.keys(alive).length !== Object.keys(users).length) changed = true;
        if (Object.keys(alive).length > 0) next[channelId] = alive;
      }
      return changed ? { typing: next } : state;
    }),

  clearTypingUser: (channelId, userId) =>
    set((state) => {
      const users = state.typing[channelId];
      if (!users?.[userId]) return state;
      const rest = { ...users };
      delete rest[userId];
      return { typing: { ...state.typing, [channelId]: rest } };
    }),
}));
