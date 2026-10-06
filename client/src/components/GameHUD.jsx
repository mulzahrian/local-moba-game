import React from 'react';
import { useT } from '../i18n/index.js';
import { HeroCard } from './HeroCard.jsx';
import { SkillBar } from './SkillBar.jsx';
import '../styles/HUD.css';

export function GameHUD({ players, currentPlayerId, roomCode, getScene, onLeaveRoom }) {
  const t = useT();
  const currentPlayer = players.find((p) => p.id === currentPlayerId);

  return (
    <div className="game-hud">
      <div className="hud-top-left">
        <div className="hud-panel room-info">
          <span className="label">{t('hud.room')}</span>
          <span className="value">{roomCode}</span>
        </div>
        <button className="hud-btn leave-btn" onClick={onLeaveRoom}>
          ← {t('hud.leave')}
        </button>
      </div>

      <div className="hud-top-right">
        <div className="hud-panel players-list">
          <h4 className="list-title">{t('hud.players')}</h4>
          {players.map((player) => (
            <div
              key={player.id}
              className={`player-item ${player.team} ${player.id === currentPlayerId ? 'current' : ''}`}
            >
              <span className="player-name">{player.name}</span>
              <span className="player-level" title={t('hud.level')}>{player.level}</span>
              <span className="player-health" title={t('hud.health')}>{Math.max(0, Math.round(player.health))}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hud-dock">
        <HeroCard player={currentPlayer} />
        <SkillBar getScene={getScene} />
      </div>

      <div className="hud-bottom-right">
        <div className="hud-panel minimap">
          <canvas id="minimap-canvas"></canvas>
        </div>
      </div>
    </div>
  );
}
