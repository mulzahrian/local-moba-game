import React, { useState } from 'react';
import { TEAMS } from '../../../shared/matchConfig.js';
import { socketService } from '../services/SocketService.js';
import { useT } from '../i18n/index.js';
import { MagicLoader } from './MagicLoader.jsx';
import { PlayerAvatar } from './character/PlayerAvatar.jsx';

// Waiting room: both teams side by side. Everybody picks their own team (a teammate can't play the same
// character); the host starts the match once every place is taken.
export function LobbyView({ roomCode, mapName, players, teamSize, hostId, onLeave }) {
  const t = useT();
  const [error, setError] = useState('');
  const myId = socketService.socket?.id;
  const me = players.find((p) => p.id === myId);
  const full = players.length >= teamSize * 2;
  const isHost = hostId === myId;

  const switchTeam = (team) => {
    setError('');
    socketService.switchTeam(roomCode, team, (response) => {
      if (!response?.success) setError(t(`lobby.error.${response?.code}`));
    });
  };

  const start = () => {
    setError('');
    socketService.startGame(roomCode, (response) => {
      if (!response?.success) setError(t(`lobby.error.${response?.code}`));
    });
  };

  return (
    <div className="menu-panel lobby-box lobby-wide">
      <h2 className="panel-title">{t('lobby.title')}</h2>
      <p className="lobby-meta">{t('lobby.roomCode')}</p>
      <div className="lobby-code">{roomCode}</div>
      <p className="lobby-meta">{t('lobby.map')}: {mapName}</p>
      <p className="lobby-meta">{t('lobby.players')}: {players.length}/{teamSize * 2} ({teamSize}v{teamSize})</p>

      <div className="lobby-teams">
        {TEAMS.map((team) => {
          const members = players.filter((p) => p.team === team);
          const emptySlots = Math.max(0, teamSize - members.length);
          return (
            <div key={team} className={`lobby-team ${team} ${me?.team === team ? 'mine' : ''}`}>
              <div className="lobby-team-header">
                <span>{t(`team.${team}`)}</span>
                <span>{members.length}/{teamSize}</span>
              </div>
              {members.map((player) => (
                <div key={player.id} className={`lobby-member ${player.id === myId ? 'me' : ''}`}>
                  <PlayerAvatar player={player} size={36} />
                  <span className="lobby-member-info">
                    <strong>{player.name}{player.id === hostId ? ' ★' : ''}</strong>
                    <span>{player.characterName} • {t(`role.${player.role}`)}</span>
                  </span>
                </div>
              ))}
              {Array.from({ length: emptySlots }, (_, i) => (
                <div key={`empty-${i}`} className="lobby-member empty">{t('lobby.emptySlot')}</div>
              ))}
              {me && me.team !== team && (
                <button className="fantasy-btn ghost lobby-join" onClick={() => switchTeam(team)}>
                  {t('lobby.joinTeam')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="lobby-error">{error}</p>}

      {full && isHost ? (
        <div className="menu-buttons">
          <button className="fantasy-btn primary" onClick={start}>{t('lobby.start')}</button>
        </div>
      ) : (
        <>
          <MagicLoader />
          <p className="lobby-waiting">{full ? t('lobby.waitingHost') : t('lobby.waiting')}</p>
        </>
      )}
      <div className="menu-buttons">
        <button className="fantasy-btn ghost" onClick={onLeave}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
