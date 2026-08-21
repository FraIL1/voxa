import { useTranslation } from 'react-i18next';

/**
 * Подпись с датой между днями переписки. У сообщений есть только время,
 * поэтому в длинной истории невозможно понять, где кончилось вчера и
 * началось сегодня.
 */

const dayFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });
/** Прошлые годы подписываем полностью: «12 августа» без года там сбивает с толку */
const dayYearFormat = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Начинается ли с этого сообщения новый день. Без предыдущего — да:
 * подпись нужна и в самом верху списка, а не только между днями.
 */
export function startsNewDay(previousIso: string | undefined, iso: string): boolean {
  if (!previousIso) return true;
  // toDateString сравнивает календарные сутки по часовому поясу человека
  return new Date(previousIso).toDateString() !== new Date(iso).toDateString();
}

export default function DaySeparator({ iso }: { iso: string }) {
  const { t } = useTranslation();

  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let label: string;
  if (date.toDateString() === today.toDateString()) {
    label = t('chat.today');
  } else if (date.toDateString() === yesterday.toDateString()) {
    label = t('chat.yesterday');
  } else {
    label =
      date.getFullYear() === today.getFullYear()
        ? dayFormat.format(date)
        : dayYearFormat.format(date);
  }

  return (
    <div className="day-sep">
      <span>{label}</span>
    </div>
  );
}
