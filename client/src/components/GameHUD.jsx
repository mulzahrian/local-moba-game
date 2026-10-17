import React, { useEffect, useRef } from 'react';
import { useT } from '../i18n/index.js';
import { HeroCard } from './HeroCard.jsx';
import { SkillBar } from './SkillBar.jsx';
import '../styles/HUD.css';

export function GameHUD({ players, currentPlayerId, roomCode, currentMap, getScene, onLeaveRoom }) {
  const t = useT();
  const minimapRef = useRef(null);
  const currentPlayer = players.find((p) => p.id === currentPlayerId);

  useEffect(() => {
    let frame;
    const draw = () => {
      getScene()?.drawMinimap(minimapRef.current);
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [getScene]);

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

      <div className="hud-dock">
        <HeroCard player={currentPlayer} />
        <SkillBar getScene={getScene} />
      </div>

      <div className="hud-bottom-right">
        <div className="hud-panel minimap">
          <div className="minimap-heading">
            <span>{currentMap?.name || t('create.defaultMap')}</span>
            <small>{currentMap?.size || 500} × {currentMap?.size || 500}</small>
          </div>
          <canvas id="minimap-canvas" ref={minimapRef}></canvas>
          <div className="minimap-legend">
            <span><i className="legend-dot you" /> {t('hud.you')}</span>
            <span><i className="legend-dot ally" /> {t('hud.ally')}</span>
            <span><i className="legend-dot base" /> {t('hud.base')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
