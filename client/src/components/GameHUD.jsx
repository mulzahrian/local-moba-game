import React from 'react';
import { SkillBar } from './SkillBar.jsx';
import '../styles/HUD.css';

export function GameHUD({ players, currentPlayerId, roomCode, getScene, onLeaveRoom }) {
  const currentPlayer = players.find(p => p.id === currentPlayerId);

  return (
    <div className="game-hud">
      {/* Room Info */}
      <div className="hud-top-left">
        <div className="room-info">
          <span className="label">Room:</span>
          <span className="value">{roomCode}</span>
        </div>
        <button className="leave-btn" onClick={onLeaveRoom}>
          ← Leave
        </button>
      </div>

      {/* Player Stats */}
      <div className="hud-top-right">
        {currentPlayer && (
          <div className="player-stats">
            <div className="stat-item">
              <span className="stat-label">HP</span>
              <div className="stat-bar hp-bar">
                <div
                  className="stat-fill"
                  style={{ width: `${(currentPlayer.health / (currentPlayer.maxHealth || 100)) * 100}%` }}
                ></div>
              </div>
              <span className="stat-value">{Math.round(currentPlayer.health)}/{currentPlayer.maxHealth || 100}</span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Mana</span>
              <div className="stat-bar mana-bar">
                <div
                  className="stat-fill"
                  style={{ width: `${(currentPlayer.mana / (currentPlayer.maxMana || 100)) * 100}%` }}
                ></div>
              </div>
              <span className="stat-value">{Math.round(currentPlayer.mana)}/{currentPlayer.maxMana || 100}</span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Level</span>
              <span className="stat-value-large">{currentPlayer.level}</span>
            </div>
          </div>
        )}
      </div>

      {/* Players List */}
      <div className="hud-bottom-left">
        <div className="players-list">
          <h4 className="list-title">Players</h4>
          {players.map((player) => (
            <div
              key={player.id}
              className={`player-item ${player.team} ${
                player.id === currentPlayerId ? 'current' : ''
              }`}
            >
              <span className="player-name">{player.name}</span>
              <span className="player-level">L{player.level}</span>
              <span className="player-health">{player.health} HP</span>
            </div>
          ))}
        </div>
      </div>

      <SkillBar getScene={getScene} />

      {/* Mini Map */}
      <div className="hud-bottom-right">
        <div className="minimap">
          <canvas id="minimap-canvas"></canvas>
          <div className="minimap-label">Minimap</div>
        </div>
      </div>
    </div>
  );
}
