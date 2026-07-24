import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useFriends } from '../hooks/useFriends';
import { useCreateGroupDm } from '../hooks/useDm';

/** Создание групповой беседы: имя + выбор друзей (минимум двое) */
export default function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: friends } = useFriends();
  const createGroup = useCreateGroupDm();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!name.trim() || selected.size < 2) return;
    createGroup
      .mutateAsync({ name: name.trim(), userIds: [...selected] })
      .then((group) => {
        onClose();
        navigate(`/dm/${group.id}`);
      })
      .catch((err: Error) => setError(err.message));
  };

  const list = friends ?? [];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="add-server-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('dm.createGroup')}</h2>
        <form className="add-server-form" onSubmit={submit}>
          <label>
            {t('dm.groupNameLabel')}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('dm.groupNamePlaceholder')}
              maxLength={60}
              autoFocus
            />
          </label>

          <div className="group-pick-hint">{t('dm.groupPickMembers')}</div>
          <div className="group-pick-list">
            {list.length === 0 && <p className="settings-hint">{t('friends.empty')}</p>}
            {list.map((friend) => (
              <button
                type="button"
                key={friend.id}
                className={`group-pick-row${selected.has(friend.id) ? ' selected' : ''}`}
                onClick={() => toggle(friend.id)}
              >
                <div className="avatar friend-avatar" aria-hidden>
                  {friend.displayName.slice(0, 1).toUpperCase()}
                </div>
                <span className="friend-name">{friend.displayName}</span>
                {selected.has(friend.id) && <Check size={16} />}
              </button>
            ))}
          </div>

          {error && <p className="friends-add-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('chat.cancel')}
            </button>
            <button
              className="btn-primary"
              disabled={createGroup.isPending || !name.trim() || selected.size < 2}
            >
              {t('dm.groupCreateButton', { count: selected.size })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
