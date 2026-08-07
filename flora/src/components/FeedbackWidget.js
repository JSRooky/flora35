import React from "react";
import { getFeedbackChannels } from "../feedbackLinks";
import { ReactComponent as MaxIcon } from "../images/max_icon.svg";
import { ReactComponent as TelegramIcon } from "../images/telegram_icon.svg";
import "../styles/FeedbackWidget.css";

const CHANNEL_ICONS = {
  telegram: TelegramIcon,
  max: MaxIcon
};

function FeedbackChannelIcon({ id }) {
  const Icon = CHANNEL_ICONS[id];

  if (!Icon) {
    return null;
  }

  return <Icon className="feedback-widget-icon-image" aria-hidden="true" focusable="false" />;
}

/** Панель иконок-ссылок для обратной связи (Telegram, Max и т.п.). */
export default function FeedbackWidget() {
  const channels = getFeedbackChannels();

  return (
    <div className="feedback-widget" aria-label="Контакты для обратной связи">
      <div className="feedback-widget-bar">
        {channels.map(({ id, label, href }) => {
          if (!CHANNEL_ICONS[id]) {
            return null;
          }

          if (href) {
            return (
              <a
                key={id}
                href={href}
                className={`feedback-widget-icon feedback-widget-icon--${id}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={label}
              >
                <FeedbackChannelIcon id={id} />
              </a>
            );
          }

          return (
            <span
              key={id}
              className={`feedback-widget-icon feedback-widget-icon--${id} feedback-widget-icon--disabled`}
              aria-label={`${label} (ссылка не настроена)`}
              title="Ссылка не настроена"
            >
              <FeedbackChannelIcon id={id} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
