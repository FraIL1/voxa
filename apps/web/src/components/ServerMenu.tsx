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
import { useMembers } from '../hooks/useMembers';
import { useAuthStore } from '../stores/auth';
import CreateChannelModal from './CreateChannelModal';
import PromptModal from './PromptModal';
import ServerSettingsModal from './ServerSettingsModal';

/** Меню сервера (клик по названию): приглашения, настройки, создание, ник, выход */
export default function ServerMenu({ guildId }: { guildId: string }) {
  const { t } = useTranslation();
  const guild = useGuild(guildId);
  const myId = useAuthStore((s) => s.user?.id);
  const { data: members } = useMembers(guildId);
  const createCategory = useCreateCategory(guildId);
  const setNickname = useSetNickname(guildId);
  const leaveGuild = useLeaveGuild();

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<'profile' | 'invites' | null>(null);
  const [createChannel, setCreateChannel] = useState(false);
  const [prompt, setPrompt] = useState<'nick' | 'category' | null>(null);

  const mask = guild?.myPermissions ?? 0;
  const canManage = hasPermission(mask, Permissions.MANAGE_CHANNELS);
  const canInvite = hasPermission(mask, Permissions.CREATE_INVITES);
  const isOwner = guild?.ownerId != null && guild.ownerId === myId;
  const myNickname = members?.find((m) => m.id === myId)?.nickname ?? '';

  const close = (): void => setOpen(false);

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
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  setPrompt('category');
                }}
              >
                <FolderPlus size={16} /> {t('guild.menuCreateCategory')}
              </button>
            )}
            <button
              className="menu-item"
              onClick={() => {
                close();
                setPrompt('nick');
              }}
            >
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
      {prompt === 'nick' && (
        <PromptModal
          title={t('guild.menuNickname')}
          label={t('guild.nickLabel')}
          placeholder={guild?.name}
          initialValue={myNickname}
          allowEmpty
          maxLength={32}
          onSubmit={(v) => setNickname.mutate(v)}
          onClose={() => setPrompt(null)}
        />
      )}
      {prompt === 'category' && (
        <PromptModal
          title={t('guild.menuCreateCategory')}
          label={t('guild.categoryLabel')}
          onSubmit={(v) => createCategory.mutate(v)}
          onClose={() => setPrompt(null)}
          confirmLabel={t('roles.create')}
        />
      )}
    </>
  );
}
