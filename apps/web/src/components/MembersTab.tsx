import type { MemberDto } from '@voxa/shared';
import { useTranslation } from 'react-i18next';

import { useAssignRole, useGuildRoles } from '../hooks/useGuildAdmin';
import { useMembers } from '../hooks/useMembers';

/** Вкладка «Участники»: список + выдача/снятие ролей чекбоксами */
export default function MembersTab({ guildId }: { guildId: string }) {
  const { t } = useTranslation();
  const { data: members } = useMembers(guildId);
  const { data: roles } = useGuildRoles(guildId);
  const assignRole = useAssignRole(guildId);

  // Роль «Владелец» не выдаётся вручную
  const assignable = (roles ?? []).filter((r) => !r.isOwnerRole);

  return (
    <>
      <h2>{t('serverSettings.members')}</h2>
      {(members ?? []).map((member: MemberDto) => {
        const has = new Set(member.roles.map((r) => r.id));
        return (
          <div key={member.id} className="member-manage-row">
            <div className="member-manage-name">
              <span>{member.nickname ?? member.displayName}</span>
              <span className="member-handle">@{member.username}</span>
            </div>
            <div className="member-role-chips">
              {assignable.map((role) => {
                const active = has.has(role.id);
                return (
                  <button
                    key={role.id}
                    className={`role-chip${active ? ' active' : ''}`}
                    style={
                      active && role.color
                        ? { borderColor: role.color, color: role.color }
                        : undefined
                    }
                    onClick={() =>
                      assignRole.mutate({ userId: member.id, roleId: role.id, assign: !active })
                    }
                  >
                    {role.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
