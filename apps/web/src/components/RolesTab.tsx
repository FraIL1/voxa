import { Permissions, hasPermission, type PermissionKey, type RoleDto } from '@voxa/shared';
import { Check, GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateRole, useDeleteRole, useGuildRoles, useUpdateRole } from '../hooks/useGuildAdmin';

/** Права, доступные для настройки роли (ADMINISTRATOR — только у владельца, отдельно) */
/* Права собраны по смыслу: десять строк подряд не дают понять, что
   именно ты выдаёшь человеку. */
const PERM_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  { label: 'roles.groupText', keys: ['SEND_MESSAGES', 'UPLOAD_FILES', 'DELETE_MESSAGES'] },
  { label: 'roles.groupVoice', keys: ['MUTE_MEMBERS'] },
  {
    label: 'roles.groupPeople',
    keys: ['CREATE_INVITES', 'KICK_MEMBERS', 'BAN_MEMBERS', 'MANAGE_CHANNELS', 'MANAGE_ROLES'],
  },
  { label: 'roles.groupLook', keys: ['MENTION_EVERYONE'] },
];

/* Опасные права горят красным: видно, что даёшь, не вчитываясь */
const DANGEROUS: PermissionKey[] = [
  'DELETE_MESSAGES',
  'MUTE_MEMBERS',
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'MANAGE_CHANNELS',
  'MANAGE_ROLES',
];

function RoleEditor({ guildId, role }: { guildId: string; role: RoleDto }) {
  const { t } = useTranslation();
  const updateRole = useUpdateRole(guildId);
  const deleteRole = useDeleteRole(guildId);
  const locked = role.isOwnerRole;
  // Локальный цвет для живого превью; на сервер шлём только по завершении выбора
  const [color, setColor] = useState(role.color ?? '#99aab5');

  /* Права копятся в черновике и уходят на сервер одной кнопкой.
     По щелчку сохранять нельзя: человек снимает одно право, чтобы выдать
     другое, и между двумя щелчками роль на секунду оказывается неверной. */
  const [draft, setDraft] = useState(role.permissions);
  useEffect(() => setDraft(role.permissions), [role.id, role.permissions]);
  const dirty = draft !== role.permissions;

  const toggle = (bit: number): void => {
    setDraft((current) => (hasPermission(current, bit) ? current & ~bit : current | bit));
  };

  return (
    <div className="role-editor">
      {/* Шапка: цветная точка и имя — сразу видно, какую роль правишь */}
      <div className="role-editor-top">
        <span className="roles-dot big" style={{ background: color }} aria-hidden />
        <h3>{role.name}</h3>
        {!locked && !role.isDefault && (
          <button
            className="icon-button danger role-editor-del"
            title={t('roles.delete')}
            onClick={() => deleteRole.mutate(role.id)}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <div className="role-editor-fields">
        <label>
          {t('roles.nameLabel')}
          <input
            className="role-name-input"
            defaultValue={role.name}
            disabled={locked}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== role.name)
                updateRole.mutate({ roleId: role.id, input: { name } });
            }}
          />
        </label>

        <div className="role-colors">
          <span className="role-colors-label">{t('roles.colorLabel')}</span>
          <div className="role-swatches">
            {ROLE_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className={`role-swatch${color.toLowerCase() === value ? ' active' : ''}`}
                style={{ background: value }}
                title={value}
                disabled={locked}
                onClick={() => {
                  setColor(value);
                  updateRole.mutate({ roleId: role.id, input: { color: value } });
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {locked ? (
        <p className="settings-hint">{t('roles.ownerAll')}</p>
      ) : (
        <>
          {PERM_GROUPS.map((group) => (
            <section key={group.label} className="perm-group">
              <h4>{t(group.label)}</h4>
              <div className="role-perms">
                {group.keys.map((key) => {
                  const on = hasPermission(draft, Permissions[key]);
                  const danger = DANGEROUS.includes(key);
                  return (
                    <label key={key} className="role-perm">
                      <span className="role-perm-text">
                        <span className="role-perm-name">{t(`perm.${key}`)}</span>
                        <span className="role-perm-hint">{t(`permHint.${key}`, '')}</span>
                      </span>
                      <span
                        className={`owner-switch perm-switch${danger ? ' danger' : ''}${
                          on ? ' on' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(Permissions[key])}
                        />
                        <span className="owner-switch-track" />
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {!locked && (
        <div className={`role-savebar${dirty ? ' on' : ''}`}>
          <span>{dirty ? t('roles.unsaved') : t('roles.saved')}</span>
          <button
            className="btn-secondary"
            disabled={!dirty}
            onClick={() => setDraft(role.permissions)}
          >
            <RotateCcw size={15} /> {t('roles.revert')}
          </button>
          <button
            className="btn-primary"
            disabled={!dirty || updateRole.isPending}
            onClick={() => updateRole.mutate({ roleId: role.id, input: { permissions: draft } })}
          >
            <Check size={15} /> {t('settings.save')}
          </button>
        </div>
      )}
    </div>
  );
}

/* Готовая палитра: системный выбор цвета выглядит чужим и даёт
   выбрать цвета, которые не читаются на тёмном фоне. */
const ROLE_COLORS = [
  '#22d3ee',
  '#2dd4bf',
  '#34d399',
  '#a78bfa',
  '#f472b6',
  '#fbbf24',
  '#fb7185',
  '#8fa0b5',
];

/** Вкладка «Роли» в настройках сервера: создание, настройка прав, удаление */
export default function RolesTab({ guildId }: { guildId: string }) {
  const { t } = useTranslation();
  const { data: roles } = useGuildRoles(guildId);
  const createRole = useCreateRole(guildId);
  const updateRole = useUpdateRole(guildId);
  const [newName, setNewName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  /* Перетащили одну роль на место другой — меняем старшинство.
     Позиции считаем от конца списка: чем выше в списке, тем больше число. */
  const drop = (targetId: string): void => {
    const ids = (roles ?? []).map((role) => role.id);
    const from = ids.indexOf(dragId ?? '');
    const to = ids.indexOf(targetId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;

    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    next.forEach((id, index) => {
      const position = Math.max(0, Math.min(99, next.length - index));
      const role = (roles ?? []).find((r) => r.id === id);
      if (role && !role.isOwnerRole && role.position !== position) {
        updateRole.mutate({ roleId: id, input: { position } });
      }
    });
  };

  const create = (): void => {
    const name = newName.trim();
    if (!name) return;
    createRole.mutate(
      { name, color: null, permissions: Permissions.SEND_MESSAGES | Permissions.UPLOAD_FILES },
      { onSuccess: () => setNewName('') },
    );
  };

  const list = roles ?? [];
  const current = list.find((role) => role.id === selected) ?? list[0];

  return (
    <div className="roles-layout">
      {/* Слева список, справа права: раньше все роли шли развёрнутыми подряд,
          и до нужной приходилось прокручивать десяток чужих переключателей. */}
      <aside className="roles-list">
        <header>
          <b>{t('roles.title')}</b>
        </header>

        <div className="roles-new">
          <input
            placeholder={t('roles.newPlaceholder')}
            value={newName}
            maxLength={32}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="btn-primary"
            title={t('roles.create')}
            disabled={createRole.isPending || !newName.trim()}
            onClick={create}
          >
            <Plus size={15} />
          </button>
        </div>

        <p className="settings-hint roles-hint">{t('roles.orderHint')}</p>

        {list.map((role) => (
          <div
            key={role.id}
            className={`roles-item${current?.id === role.id ? ' active' : ''}${
              dragId === role.id ? ' dragging' : ''
            }${overId === role.id && dragId !== role.id ? ' over' : ''}`}
            onClick={() => setSelected(role.id)}
            /* Владельца не двигаем: он всегда старший, иначе сервер останется
               без хозяина прав. */
            draggable={!role.isOwnerRole}
            onDragStart={(e) => {
              setDragId(role.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', role.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              if (!dragId || role.isOwnerRole) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOverId(role.id);
            }}
            onDragLeave={() => setOverId((id) => (id === role.id ? null : id))}
            onDrop={(e) => {
              e.preventDefault();
              drop(role.id);
            }}
          >
            {!role.isOwnerRole && <GripVertical size={13} className="roles-grip" />}
            <span
              className="roles-dot"
              style={{ background: role.color ?? 'var(--text-faint)' }}
              aria-hidden
            />
            <span className="roles-item-name">{role.name}</span>
            {role.isDefault ? (
              <span className="roles-item-tag">{t('roles.everyone')}</span>
            ) : (
              <span className="roles-item-count">{role.memberCount}</span>
            )}
          </div>
        ))}
      </aside>

      <div className="roles-editor-pane">
        {current ? (
          <RoleEditor key={current.id} guildId={guildId} role={current} />
        ) : (
          <p className="empty-state">{t('roles.pick')}</p>
        )}
      </div>
    </div>
  );
}
