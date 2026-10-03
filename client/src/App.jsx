import React, { useState, useEffect, useRef } from 'react';
import { MenuScreen } from './components/MenuScreen.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { GameHUD } from './components/GameHUD.jsx';
import { GameScene } from './scenes/GameScene.js';
import { useGameStore } from './store/gameStore.js';
import { socketService } from './services/SocketService.js';
import './styles/App.css';

function App() {
  const gameState = useGameStore((state) => state.gameState);
  const roomCode = useGameStore((state) => state.roomCode);
  const players = useGameStore((state) => state.players);
  const currentPlayer = useGameStore((state) => state.currentPlayer);
  const messages = useGameStore((state) => state.messages);

  const setGameState = useGameStore((state) => state.setGameState);
  const setRoomCode = useGameStore((state) => state.setRoomCode);
  const setPlayers = useGameStore((state) => state.setPlayers);
  const setCurrentPlayer = useGameStore((state) => state.setCurrentPlayer);
  const addMessage = useGameStore((state) => state.addMessage);
  const reset = useGameStore((state) => state.reset);

  const gameContainerRef = useRef(null);
  const gameSceneRef = useRef(null);

  // Initialize socket connection ONCE on mount.
  // IMPORTANT: empty dependency array — re-running this effect would
  // disconnect/reconnect the socket and kick the player out of the room.
  useEffect(() => {
    socketService.connect();

    socketService.on('playerJoined', (data) => {
      console.log('Player joined:', data);
      setPlayers(data.players);
    });

    socketService.on('gameStarted', (data) => {
      console.log('Game started!', data);
      setPlayers(data.players);
      setRoomCode(data.roomCode);
      setGameState('in_game');
    });

    socketService.on('playerMoved', (data) => {
      if (gameSceneRef.current) {
        const player = useGameStore.getState().players.find(p => p.id === data.playerId);
        gameSceneRef.current.updatePlayer(data.playerId, {
          ...player,
          position: data.position
        });
      }
    });

    socketService.on('playerAttacked', (data) => {
      console.log('Player attacked:', data);
    });

    socketService.on('messageReceived', (data) => {
      addMessage(data);
    });

    socketService.on('playerDisconnected', (data) => {
      console.log('Player disconnected:', data);
      const remaining = useGameStore.getState().players.filter(p => p.id !== data.playerId);
      setPlayers(remaining);
      if (gameSceneRef.current) {
        gameSceneRef.current.removePlayer(data.playerId);
      }
    });

    return () => {
      socketService.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create/destroy the Three.js scene when entering/leaving the game.
  // Runs AFTER React renders the container div, so the ref is guaranteed to exist.
  useEffect(() => {
    if (gameState === 'in_game' && gameContainerRef.current && !gameSceneRef.current) {
      gameSceneRef.current = new GameScene(gameContainerRef.current);
      // CRITICAL FIX: Pass socketService and roomCode to scene so movement events get emitted properly
      gameSceneRef.current.setSocketService(socketService, roomCode);
    }
    if (gameState !== 'in_game' && gameSceneRef.current) {
      gameSceneRef.current.dispose();
      gameSceneRef.current = null;
    }
  }, [gameState, roomCode, socketService]);

  // Keep the scene in sync with the player list (adds new players, updates existing).
  useEffect(() => {
    if (gameSceneRef.current) {
      players.forEach((player) => {
        gameSceneRef.current.addPlayer(
          player.id,
          player,
          player.id === socketService.socket?.id
        );
      });
    }
  }, [players, gameState]);

  // Handle create room
  const handleCreateRoom = (playerName) => {
    socketService.createRoom(playerName, (response) => {
      if (response.success) {
        console.log('Room created:', response.roomCode);
        setRoomCode(response.roomCode);
        setCurrentPlayer({
          id: socketService.socket.id,
          name: playerName
        });
        setPlayers(response.room.players);
        setGameState('room_lobby');
      } else {
        alert(response.message);
      }
    });
  };

  // Handle join room
  const handleJoinRoom = (playerName, code) => {
    console.log(`[Client] Attempting to join room: ${code}`);
    socketService.joinRoom(code, playerName, (response) => {
      console.log(`[Client] Join response:`, response);
      if (response.success) {
        setRoomCode(response.room.code);
        setCurrentPlayer({
          id: socketService.socket.id,
          name: playerName
        });
        setPlayers(response.room.players);
        // Scene creation is handled by the gameState effect
        setGameState('in_game');
      } else {
        console.error(`[Client] Failed to join room: ${response.message}`);
        alert(`Failed to join room: ${response.message}`);
      }
    });
  };

  // Handle send message
  const handleSendMessage = (message) => {
    socketService.sendMessage(roomCode, message);
  };

  // Handle leave room
  const handleLeaveRoom = () => {
    reset(); // gameState becomes 'menu'; the effect disposes the scene
  };

  return (
    <div className="app-container">
      {gameState === 'menu' && (
        <MenuScreen
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      )}

      {gameState === 'room_lobby' && (
        <div className="lobby-container">
          <div className="lobby-content">
            <h2>Game Lobby</h2>
            <p>Room Code: <strong>{roomCode}</strong></p>
            <p>Players: {players.length}/2</p>
            <div className="player-list">
              {players.map((player) => (
                <div key={player.id} className="player-info">
                  <span>{player.name}</span>
                  <span className={`team-badge ${player.team}`}>{player.team}</span>
                </div>
              ))}
            </div>
            <p className="waiting-text">Waiting for opponent...</p>
            <button className="cancel-btn" onClick={handleLeaveRoom}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {gameState === 'in_game' && (
        <>
          <div className="game-container" ref={gameContainerRef}></div>
          <GameHUD
            players={players}
            currentPlayerId={socketService.socket?.id}
            roomCode={roomCode}
            onLeaveRoom={handleLeaveRoom}
          />
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
          />
        </>
      )}
    </div>
  );
}

export default App;
