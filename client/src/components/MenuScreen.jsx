import React, { useState } from 'react';
import '../styles/Menu.css';

export function MenuScreen({ onCreateRoom, onJoinRoom }) {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState('menu'); // menu, create, join

  const handleCreateRoom = () => {
    if (playerName.trim()) {
      onCreateRoom(playerName);
    }
  };

  const handleJoinRoom = () => {
    if (playerName.trim() && roomCode.trim()) {
      onJoinRoom(playerName, roomCode);
    }
  };

  if (mode === 'menu') {
    return (
      <div className="menu-container">
        <div className="menu-content">
          <div className="menu-header">
            <h1 className="title">⚔️ MOBA GAME</h1>
            <p className="subtitle">Multiplayer Online Battle Arena</p>
          </div>

          <div className="menu-input-group">
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && playerName.trim()) {
                  setMode('create');
                }
              }}
              className="menu-input"
            />
          </div>

          <div className="menu-buttons">
            <button
              className="menu-btn primary"
              onClick={() => {
                if (playerName.trim()) setMode('create');
              }}
              disabled={!playerName.trim()}
            >
              Create Room
            </button>
            <button
              className="menu-btn secondary"
              onClick={() => {
                if (playerName.trim()) setMode('join');
              }}
              disabled={!playerName.trim()}
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="menu-container">
        <div className="menu-content">
          <h2 className="mode-title">Create New Room</h2>
          <p className="player-info">Player: <strong>{playerName}</strong></p>

          <button className="menu-btn primary large" onClick={handleCreateRoom}>
            Create Room
          </button>

          <button className="menu-btn ghost" onClick={() => setMode('menu')}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'join') {
    return (
      <div className="menu-container">
        <div className="menu-content">
          <h2 className="mode-title">Join Room</h2>
          <p className="player-info">Player: <strong>{playerName}</strong></p>

          <input
            type="text"
            placeholder="Enter room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && roomCode.trim()) {
                handleJoinRoom();
              }
            }}
            className="menu-input large"
            maxLength="6"
          />

          <button
            className="menu-btn primary large"
            onClick={handleJoinRoom}
            disabled={!roomCode.trim()}
          >
            Join Room
          </button>

          <button className="menu-btn ghost" onClick={() => setMode('menu')}>
            ← Back
          </button>
        </div>
      </div>
    );
  }
}
