import type { MemberDto } from '@voxa/shared';
import { MonitorUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useParams } from 'react-router';

import { useMembers } from '../hooks/useMembers';
import { allChannelsOf, useStructure } from '../hooks/useStructure';
import { useVoiceStates } from '../hooks/useVoiceStates';
import { openProfile } from '../stores/profileView';
import Avatar from './Avatar';
import MemberContextMenu, { type MenuState } from './MemberContextMenu';

interface Group {
  label: string;
  /** Позиция роли для сортировки; офлайн-группа всегда внизу */
  position: number;
  members: MemberDto[];
}

function groupMembers(members: MemberDto[], offlineLabel: string): Group[] {
  const groups = new Map<string, Group>();
  for (const member of members) {
    // «Отошёл» и «не беспокоить» — это присутствие, а не офлайн
    const online = member.status !== 'offline';
    const topRole = member.roles[0];
    const label = online ? (topRole?.name ?? '—') : offlineLabel;
    const position = online ? (topRole?.position ?? 0) : -1;
    const group = groups.get(label) ?? { label, position, members: [] };
    group.members.push(member);
    groups.set(label, group);
  }
  return [...groups.values()].sort((a, b) => b.position - a.position);
}

export default function MemberList() {
  const { t } = useTranslation();
  const { guildId } = useParams<{ guildId: string }>();
  const { data: members } = useMembers(guildId);
  const { data: voiceStates } = useVoiceStates();
  const { data: structure } = useStructure(guildId);

  /* Кто показывает экран именно здесь. Состояния голоса приходят по всем
     каналам сразу, поэтому отбираем только каналы этого сервера: иначе показ
     на одном сервере отмечался у человека на всех остальных. */
  const guildChannels = new Set(allChannelsOf(structure).map((c) => c.id));
  const sharingUsers = new Set(
    (voiceStates ?? [])
      .filter((state) => guildChannels.has(state.channelId))
      .flatMap((state) => state.participants.filter((p) => p.sharing).map((p) => p.userId)),
  );
  const [menu, setMenu] = useState<MenuState | null>(null);

  if (!members) {
    return <aside className="members" />;
  }

  const groups = groupMembers(members, t('members.offline'));

  return (
    <aside className="members">
      {groups.map((group) => (
        <div key={group.label} className="member-group">
          <div className="member-group-name">
            {group.label} — {group.members.length}
          </div>
          {group.members.map((member) => {
            // Цвет роли показываем всегда — и у офлайн-участников (как у владельца)
            const color = member.roles[0]?.color ?? undefined;
            return (
              <div
                key={member.id}
                className={`member ${member.status}`}
                role="button"
                tabIndex={0}
                onClick={(e) => openProfile(member.id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') openProfile(member.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, member });
                }}
              >
                <Avatar
                  name={member.nickname ?? member.displayName}
                  url={member.avatarUrl}
                  status={member.status}
                  className="member-avatar"
                />
                <span className="member-text">
                  <span className="member-name" style={color ? { color } : undefined}>
                    {member.nickname ?? member.displayName}
                  </span>
                  {sharingUsers.has(member.id) ? (
                    <span className="member-status-text sharing">
                      <MonitorUp size={11} /> {t('voice.sharingNow')}
                    </span>
                  ) : (
                    member.statusText && (
                      <span className="member-status-text">{member.statusText}</span>
                    )
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {menu && <MemberContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}
