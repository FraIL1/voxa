import { hasPermission, Permissions } from '@voxa/shared';
import {
  ChevronDown,
  FolderPlus,
  LogOut,
  Pencil,
  PlusCircle,
  Settings,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useGuild, useLeaveGuild } from '../hooks/useGuilds';
import { useCreateCategory, useSetNickname } from '../hooks/useGuildAdmin';
import { useAuthStore } from '../stores/auth';
import CreateChannelModal from './CreateChannelModal';
import ServerSettingsModal from './ServerSettingsModal';

/** Меню сервера (клик по названию): приглашения, настройки, создание, ник, выход */
export default function ServerMenu({ guildId }: { guildId: string }) {
  const { t } = useTranslation();
  const guild = useGuild(guildId);
  const myId = useAuthStore((s) => s.user?.id);
  const createCategory = useCreateCategory(guildId);
  const setNickname = useSetNickname(guildId);
  const leaveGuild = useLeaveGuild();

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<'profile' | 'invites' | null>(null);
  const [createChannel, setCreateChannel] = useState(false);

  const mask = guild?.myPermissions ?? 0;
  const canManage = hasPermission(mask, Permissions.MANAGE_CHANNELS);
  const canInvite = hasPermission(mask, Permissions.CREATE_INVITES);
  const isOwner = guild?.ownerId != null && guild.ownerId === myId;

  const close = (): void => setOpen(false);

  const changeNick = (): void => {
    close();
    const current = ''; // ник узнаём из участников при желании; здесь просто ввод
    const next = window.prompt(t('guild.nickPrompt'), current);
    if (next !== null) setNickname.mutate(next);
  };

  const addCategory = (): void => {
    close();
    const name = window.prompt(t('guild.categoryPrompt'));
    if (name?.trim()) createCategory.mutate(name.trim());
  };

  return (
    <>
      <button className="server-header" onClick={() => setOpen((v) => !v)}>
        <span className="server-header-name">{guild?.name ?? t('app.communityName')}</span>
        <ChevronDown size={18} />
      </button>

      {open && (
        <>
          <div className="picker-backdrop" onClick={close} />
          <div className="server-dropdown">
            {canInvite && (
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  setSettings('invites');
                }}
              >
                <UserPlus size={16} /> {t('guild.menuInvite')}
              </button>
            )}
            {canManage && (
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  setSettings('profile');
                }}
              >
                <Settings size={16} /> {t('guild.menuSettings')}
              </button>
            )}
            {canManage && (
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  setCreateChannel(true);
                }}
              >
                <PlusCircle size={16} /> {t('guild.menuCreateChannel')}
              </button>
            )}
            {canManage && (
              <button className="menu-item" onClick={addCategory}>
                <FolderPlus size={16} /> {t('guild.menuCreateCategory')}
              </button>
            )}
            <button className="menu-item" onClick={changeNick}>
              <Pencil size={16} /> {t('guild.menuNickname')}
            </button>
            {!isOwner && (
              <button
                className="menu-item danger"
                onClick={() => {
                  close();
                  leaveGuild.mutate(guildId);
                }}
              >
                <LogOut size={16} /> {t('guild.menuLeave')}
              </button>
            )}
          </div>
        </>
      )}

      {settings && (
        <ServerSettingsModal
          guildId={guildId}
          initialTab={settings}
          onClose={() => setSettings(null)}
        />
      )}
      {createChannel && (
        <CreateChannelModal guildId={guildId} onClose={() => setCreateChannel(false)} />
      )}
    </>
  );
}
