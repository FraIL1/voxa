import { Permissions, hasPermission, type PermissionKey, type RoleDto } from '@voxa/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateRole, useDeleteRole, useGuildRoles, useUpdateRole } from '../hooks/useGuildAdmin';

/** Права, доступные для настройки роли (ADMINISTRATOR — только у владельца, отдельно) */
const EDITABLE: PermissionKey[] = [
  'MANAGE_CHANNELS',
  'MANAGE_ROLES',
  'DELETE_MESSAGES',
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'MUTE_MEMBERS',
  'CREATE_INVITES',
  'MENTION_EVERYONE',
  'UPLOAD_FILES',
  'SEND_MESSAGES',
];

function RoleEditor({ guildId, role }: { guildId: string; role: RoleDto }) {
  const { t } = useTranslation();
  const updateRole = useUpdateRole(guildId);
  const deleteRole = useDeleteRole(guildId);
  const locked = role.isOwnerRole;

  const toggle = (bit: number): void => {
    if (locked) return;
    const permissions = hasPermission(role.permissions, bit)
      ? role.permissions & ~bit
      : role.permissions | bit;
    updateRole.mutate({ roleId: role.id, input: { permissions } });
  };

  return (
    <div className="role-editor">
      <div className="role-editor-head">
        <input
          className="role-name-input"
          defaultValue={role.name}
          disabled={locked}
          style={role.color ? { color: role.color } : undefined}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== role.name) updateRole.mutate({ roleId: role.id, input: { name } });
          }}
        />
        <input
          type="color"
          className="role-color-input"
          value={role.color ?? '#99aab5'}
          disabled={locked}
          onChange={(e) => updateRole.mutate({ roleId: role.id, input: { color: e.target.value } })}
        />
        {!locked && !role.isDefault && (
          <button
            className="icon-button danger"
            title={t('roles.delete')}
            onClick={() => deleteRole.mutate(role.id)}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
      {locked ? (
        <p className="settings-hint">{t('roles.ownerAll')}</p>
      ) : (
        <div className="role-perms">
          {EDITABLE.map((key) => (
            <label key={key} className="role-perm">
              <input
                type="checkbox"
                checked={hasPermission(role.permissions, Permissions[key])}
                onChange={() => toggle(Permissions[key])}
              />
              {t(`perm.${key}`)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Вкладка «Роли» в настройках сервера: создание, настройка прав, удаление */
export default function RolesTab({ guildId }: { guildId: string }) {
  const { t } = useTranslation();
  const { data: roles } = useGuildRoles(guildId);
  const createRole = useCreateRole(guildId);
  const [newName, setNewName] = useState('');

  const create = (): void => {
    const name = newName.trim();
    if (!name) return;
    createRole.mutate(
      { name, color: null, permissions: Permissions.SEND_MESSAGES | Permissions.UPLOAD_FILES },
      { onSuccess: () => setNewName('') },
    );
  };

  return (
    <>
      <h2>{t('roles.title')}</h2>
      <div className="invite-form">
        <input
          placeholder={t('roles.newPlaceholder')}
          value={newName}
          maxLength={32}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          className="btn-primary"
          disabled={createRole.isPending || !newName.trim()}
          onClick={create}
        >
          <Plus size={15} /> {t('roles.create')}
        </button>
      </div>
      {(roles ?? []).map((role) => (
        <RoleEditor key={role.id} guildId={guildId} role={role} />
      ))}
    </>
  );
}
