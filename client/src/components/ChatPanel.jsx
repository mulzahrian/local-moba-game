import React, { useState, useEffect, useRef } from 'react';
import { useT } from '../i18n/index.js';
import { ChatIcon, ChevronIcon } from './HudIcons.jsx';
import '../styles/Chat.css';

export function ChatPanel({ messages, onSendMessage }) {
  const t = useT();
  const [inputValue, setInputValue] = useState('');
  const [minimized, setMinimized] = useState(false); // always open at the start of a match
  const [seen, setSeen] = useState(0);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (minimized) return;
    setSeen(messages.length);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, minimized]);

  const unread = minimized ? Math.max(0, messages.length - seen) : 0;

  const handleSend = () => {
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className={`chat-panel ${minimized ? 'minimized' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
      <button
        className="chat-header"
        onClick={() => setMinimized((value) => !value)}
        aria-expanded={!minimized}
        title={minimized ? t('hud.maximize') : t('hud.minimize')}
      >
        <ChatIcon size={20} />
        <span className="chat-title">{t('chat.title')}</span>
        {unread > 0 && <span className="chat-unread">{unread > 9 ? '9+' : unread}</span>}
        <ChevronIcon open={!minimized} />
      </button>

      <div className="chat-body">
        <div className="chat-body-inner">
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-empty">{t('chat.empty')}</div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className="chat-message">
                  <span className="message-player">{msg.playerName}</span>
                  <span className="message-text">{msg.message}</span>
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder={t('chat.placeholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
            />
            <button className="chat-send-btn" onClick={handleSend}>
              {t('chat.send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
