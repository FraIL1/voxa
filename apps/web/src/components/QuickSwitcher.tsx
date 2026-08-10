import { useQueries } from '@tanstack/react-query';
import type { CommunityStructureDto, GuildDto } from '@voxa/shared';
import { AtSign, Hash, Search, Server, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { api } from '../api/client';
import { dmTitle } from '../api/dm-cache';
import { useDmConversations, useOpenDm } from '../hooks/useDm';
import { useFriends } from '../hooks/useFriends';
import { useGuilds } from '../hooks/useGuilds';
import Avatar from './Avatar';

type EntryKind = 'guild' | 'channel' | 'dm' | 'friend';

interface Entry {
  id: string;
  kind: EntryKind;
  title: string;
  /** Уточнение справа: сервер канала, логин человека */
  hint?: string;
  avatarUrl?: string | null;
  /** Куда идти; для друга без диалога маршрут вычисляется при выборе */
  path?: string;
  /** id пользователя — для друга, с которым диалога ещё нет */
  userId?: string;
}

function iconOf(kind: EntryKind, voice: boolean): React.ReactNode {
  if (kind === 'guild') return <Server size={15} />;
  if (kind === 'channel') return voice ? <Volume2 size={15} /> : <Hash size={15} />;
  return <AtSign size={15} />;
}

/** Простое совпадение по подстроке — списки здесь небольшие */
function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query);
}

/**
 * Быстрый переход по Ctrl+K: серверы, каналы, диалоги и друзья в одном
 * списке. Каналы берём по всем серверам сразу — искать «где-то там»
 * приходится чаще, чем внутри открытого сервера.
 */
export default function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const { data: guilds } = useGuilds();
  const { data: conversations } = useDmConversations();
  const { data: friends } = useFriends();
  const openDm = useOpenDm();

  // Структуры всех серверов: без них каналы в поиск не попадут
  const structures = useQueries({
    queries: (guilds ?? []).map((guild: GuildDto) => ({
      queryKey: ['structure', guild.id],
      queryFn: () => api<CommunityStructureDto>(`/guilds/${guild.id}/structure`),
      staleTime: 60_000,
    })),
  });

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];

    for (const guild of guilds ?? []) {
      list.push({
        id: `g:${guild.id}`,
        kind: 'guild',
        title: guild.name,
        avatarUrl: guild.iconUrl,
        path: `/guilds/${guild.id}`,
      });
    }

    (guilds ?? []).forEach((guild, index) => {
      const structure = structures[index]?.data;
      if (!structure) return;
      const channels = [
        ...structure.categories.flatMap((c) => c.channels),
        ...structure.uncategorized,
      ];
      for (const channel of channels) {
        list.push({
          id: `c:${channel.id}`,
          kind: 'channel',
          title: channel.name,
          hint: guild.name,
          path: `/guilds/${guild.id}/channels/${channel.id}`,
        });
      }
    });

    for (const conversation of conversations ?? []) {
      list.push({
        id: `d:${conversation.id}`,
        kind: 'dm',
        title: dmTitle(conversation),
        hint: conversation.peer ? `@${conversation.peer.username}` : undefined,
        avatarUrl: conversation.peer?.avatarUrl,
        path: `/dm/${conversation.id}`,
      });
    }

    // Друзья без начатой переписки: диалог создастся при выборе
    const known = new Set(
      (conversations ?? []).map((c) => c.peer?.id).filter((id): id is string => Boolean(id)),
    );
    for (const friend of friends ?? []) {
      if (known.has(friend.id)) continue;
      list.push({
        id: `f:${friend.id}`,
        kind: 'friend',
        title: friend.displayName,
        hint: `@${friend.username}`,
        avatarUrl: friend.avatarUrl,
        userId: friend.id,
      });
    }

    return list;
  }, [guilds, structures, conversations, friends]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const source = normalized
      ? entries.filter((e) => matches(e.title, normalized) || matches(e.hint ?? '', normalized))
      : entries;
    return source.slice(0, 12);
  }, [entries, query]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => inputRef.current?.focus(), []);

  const choose = (entry: Entry): void => {
    onClose();
    if (entry.path) {
      navigate(entry.path);
      return;
    }
    if (entry.userId) {
      openDm.mutate(entry.userId, { onSuccess: ({ id }) => navigate(`/dm/${id}`) });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (results.length === 0 ? 0 : (c + 1) % results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (results.length === 0 ? 0 : (c - 1 + results.length) % results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = results[cursor];
      if (entry) choose(entry);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="settings-overlay switcher-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="switcher">
        <div className="switcher-input">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder={t('switcher.placeholder')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>

        {results.length === 0 ? (
          <p className="empty-state">{t('switcher.empty')}</p>
        ) : (
          <div className="switcher-list">
            {results.map((entry, index) => (
              <button
                key={entry.id}
                className={`switcher-row${index === cursor ? ' active' : ''}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(entry)}
              >
                {entry.kind === 'dm' || entry.kind === 'friend' || entry.avatarUrl ? (
                  <Avatar name={entry.title} url={entry.avatarUrl} className="switcher-avatar" />
                ) : (
                  <span className="switcher-icon">{iconOf(entry.kind, false)}</span>
                )}
                <span className="switcher-title">{entry.title}</span>
                {entry.hint && <span className="switcher-hint">{entry.hint}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="switcher-footer">{t('switcher.hint')}</div>
      </div>
    </div>
  );
}
