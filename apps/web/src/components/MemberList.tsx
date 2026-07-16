import type { MemberDto } from '@voxa/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMembers } from '../hooks/useMembers';
import { useAuthStore } from '../stores/auth';
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
    const online = member.status === 'online';
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
  const { data: members } = useMembers();
  const myId = useAuthStore((s) => s.user?.id);
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
            const color =
              member.status === 'online' ? (member.roles[0]?.color ?? undefined) : undefined;
            return (
              <div
                key={member.id}
                className={`member ${member.status}`}
                onContextMenu={(e) => {
                  if (member.id === myId) return;
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, member });
                }}
              >
                <div className="avatar member-avatar" aria-hidden>
                  {member.username.slice(0, 1).toUpperCase()}
                  <span className={`status-dot ${member.status}`} />
                </div>
                <span className="member-name" style={color ? { color } : undefined}>
                  {member.username}
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
