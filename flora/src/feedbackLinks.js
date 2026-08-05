/** Каналы обратной связи — URL можно переопределить через переменные окружения. */
export const FEEDBACK_CHANNELS = [
  {
    id: "telegram",
    label: "Telegram",
    visible: false,
    href:
      process.env.REACT_APP_FEEDBACK_TELEGRAM_URL?.trim() ||
      "https://t.me/berndvonbrot"
  },
  {
    id: "max",
    label: "Канал проекта",
    visible: true,
    href:
      process.env.REACT_APP_FEEDBACK_MAX_URL?.trim() ||
      "https://max.ru/channel_flora35"
  }
];

export function getFeedbackChannels() {
  return FEEDBACK_CHANNELS.filter(({ visible = true }) => visible);
}
