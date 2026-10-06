import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MenuScreen } from './components/MenuScreen.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { GameHUD } from './components/GameHUD.jsx';
import { GameScene } from './scenes/GameScene.js';
import { useGameStore } from './store/gameStore.js';
import { socketService } from './services/SocketService.js';
import { useSkillStore } from './store/skillStore.js';
import { useWalletStore } from './store/walletStore.js';
import { useToastStore } from './store/toastStore.js';
import { WIN_REWARD_GOLD } from '../../shared/economyConfig.js';
import { ensureSkillLibrary, getSkill, refreshSkillLibrary } from './skill/skillLibrary.js';
import { RewardToasts } from './components/RewardToasts.jsx';
import { audioService } from './services/audioService.js';
import { MenuBackdrop } from './components/MenuBackdrop.jsx';
import { MagicLoader } from './components/MagicLoader.jsx';
import { GameResultOverlay } from './components/GameResultOverlay.jsx';
import { useSettingsStore } from './store/settingsStore.js';
import { translate, useT } from './i18n/index.js';
import './styles/App.css';

function App() {
  const t = useT();
  const musicOn = useSettingsStore((state) => state.musicOn);
  const currentMap = useGameStore((state) => state.currentMap);
  const setCurrentMap = useGameStore((state) => state.setCurrentMap);
  const currentEnvironment = useGameStore((state) => state.currentEnvironment);
  const setCurrentEnvironment = useGameStore((state) => state.setCurrentEnvironment);
  const gameState = useGameStore((state) => state.gameState);
  const roomCode = useGameStore((state) => state.roomCode);
  const players = useGameStore((state) => state.players);
  const teamSize = useGameStore((state) => state.teamSize);
  const setTeamSize = useGameStore((state) => state.setTeamSize);
  const currentPlayer = useGameStore((state) => state.currentPlayer);
  const messages = useGameStore((state) => state.messages);
  const [gameResult, setGameResult] = useState(null); // { winnerTeam } once a tower has fallen

  const setGameState = useGameStore((state) => state.setGameState);
  const setRoomCode = useGameStore((state) => state.setRoomCode);
  const setPlayers = useGameStore((state) => state.setPlayers);
  const setCurrentPlayer = useGameStore((state) => state.setCurrentPlayer);
  const addMessage = useGameStore((state) => state.addMessage);
  const reset = useGameStore((state) => state.reset);

  useEffect(() => {
    audioService.setEnabled(musicOn);
  }, [musicOn]);

  // Menu music on menu screens, loading music while waiting in the lobby, the map's own music in a match.
  useEffect(() => {
    if (gameState === 'in_game') {
      if (!gameResult) audioService.setMatchMusic(currentMap?.music);
      return;
    }
    audioService.setTrack(gameState === 'room_lobby' ? 'loading' : 'menu');
  }, [gameState, currentMap, gameResult]);

  // Victory / defeat jingle once the match has been decided.
  useEffect(() => {
    if (!gameResult) return;
    const { players: current } = useGameStore.getState();
    const myTeamNow = current.find((p) => p.id === socketService.socket?.id)?.team;
    audioService.playResult(gameResult.winnerTeam === myTeamNow);
  }, [gameResult]);

  // Click sound for every button in the app.
  useEffect(() => {
    const onClick = (e) => {
      const btn = e.target instanceof Element ? e.target.closest('button') : null;
      if (btn && !btn.disabled) audioService.playClick();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Tell the server which skills are equipped (keys 1-4) once the match runs and whenever they change.
  const equippedSkills = useSkillStore((state) => state.equipped);
  useEffect(() => {
    if (gameState !== 'in_game' || !roomCode) return;
    socketService.emit('setLoadout', { roomCode, skillIds: equippedSkills.filter(Boolean) });
  }, [gameState, roomCode, equippedSkills]);

  const gameContainerRef = useRef(null);
  const gameSceneRef = useRef(null);
  const getGameScene = useCallback(() => gameSceneRef.current, []);

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
      setCurrentMap(data.map || null);
      setCurrentEnvironment(data.environment || null);
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

    // Attacks, skills and emotes resolved by the server (damage, knockback, animations, effects)
    socketService.on('skillUsed', (data) => {
      setPlayers(data.players);
      if (gameSceneRef.current) gameSceneRef.current.handleSkillUsed(data);
    });

    socketService.on('statsUpdated', (data) => {
      const stats = new Map(data.stats.map((s) => [s.id, s]));
      setPlayers(useGameStore.getState().players.map((p) => (stats.has(p.id) ? { ...p, ...stats.get(p.id) } : p)));
    });

    // Monsters and summoned units (server-driven)
    socketService.on('worldState', (data) => {
      if (gameSceneRef.current) gameSceneRef.current.handleWorldState(data);
    });

    socketService.on('entityAttack', (data) => {
      if (data.players) setPlayers(data.players);
      if (gameSceneRef.current) gameSceneRef.current.handleEntityAttack(data);
    });

    socketService.on('entityDied', (data) => {
      if (gameSceneRef.current) gameSceneRef.current.handleEntityDied(data);
    });

    // The one who defeated a monster gets its reward: money and (when it has one) a skill.
    socketService.on('monsterDefeated', (data) => {
      if (data.killerId !== socketService.socket?.id) return;
      const { push } = useToastStore.getState();
      if (data.gold > 0) {
        useWalletStore.getState().add(data.gold);
        push(translate(useSettingsStore.getState().language, 'reward.gold', { name: data.name, gold: data.gold }));
      }
      if (!data.skillId) return;
      ensureSkillLibrary().then(async () => {
        if (!getSkill(data.skillId)) await refreshSkillLibrary();
        const skill = getSkill(data.skillId);
        if (!skill) return;
        const { owned, addSkill } = useSkillStore.getState();
        const language = useSettingsStore.getState().language;
        if (owned.includes(skill.id)) {
          push(translate(language, 'reward.skillOwned', { skill: skill.name }));
        } else {
          addSkill(skill.id);
          push(translate(language, 'reward.skill', { skill: skill.name }));
        }
      });
    });

    socketService.on('playerDied', (data) => {
      if (gameSceneRef.current) gameSceneRef.current.handlePlayerDied(data.playerId);
    });

    socketService.on('gameOver', (data) => {
      if (gameSceneRef.current) gameSceneRef.current.handleGameOver();
      setGameResult({ winnerTeam: data.winnerTeam });
      const { players: current } = useGameStore.getState();
      const myTeamNow = current.find((p) => p.id === socketService.socket?.id)?.team;
      if (data.winnerTeam === myTeamNow) {
        useWalletStore.getState().add(WIN_REWARD_GOLD);
        useToastStore.getState().push(translate(useSettingsStore.getState().language, 'reward.win', { gold: WIN_REWARD_GOLD }));
      }
    });

    socketService.on('playerRespawned', (data) => {
      setPlayers(useGameStore.getState().players.map((p) => (p.id === data.player.id ? { ...p, ...data.player } : p)));
      if (gameSceneRef.current) gameSceneRef.current.handlePlayerRespawned(data.player);
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
      gameSceneRef.current.loadMap(currentMap);
      gameSceneRef.current.setEnvironment(currentEnvironment);
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
  const handleCreateRoom = (playerName, mapId, environment, match) => {
    socketService.createRoom(playerName, mapId, environment, useSettingsStore.getState().characterId, match, (response) => {
      if (response.success) {
        console.log('Room created:', response.roomCode);
        setRoomCode(response.roomCode);
        setCurrentMap(response.room.map || null);
        setCurrentEnvironment(response.room.environment || null);
        setCurrentPlayer({
          id: socketService.socket.id,
          name: playerName
        });
        setPlayers(response.room.players);
        setTeamSize(response.room.teamSize);
        // A single-player match starts right away (the computer fills the other places)
        setGameState(response.room.gameState === 'in_progress' ? 'in_game' : 'room_lobby');
      } else {
        alert(response.message);
      }
    });
  };

  // Handle join room
  const handleJoinRoom = (playerName, code) => {
    console.log(`[Client] Attempting to join room: ${code}`);
    socketService.joinRoom(code, playerName, useSettingsStore.getState().characterId, (response) => {
      console.log(`[Client] Join response:`, response);
      if (response.success) {
        setRoomCode(response.room.code);
        setCurrentMap(response.room.map || null);
        setCurrentEnvironment(response.room.environment || null);
        setCurrentPlayer({
          id: socketService.socket.id,
          name: playerName
        });
        setPlayers(response.room.players);
        setTeamSize(response.room.teamSize);
        // Wait in the lobby until every place is taken (the server then sends gameStarted)
        // Scene creation is handled by the gameState effect
        setGameState(response.room.gameState === 'in_progress' ? 'in_game' : 'room_lobby');
      } else {
        console.error(`[Client] Failed to join room: ${response.message}`);
        alert(t('join.failed', { message: response.message }));
      }
    });
  };

  // Handle send message
  const handleSendMessage = (message) => {
    socketService.sendMessage(roomCode, message);
  };

  // Handle leave room
  const handleLeaveRoom = () => {
    setGameResult(null);
    socketService.leaveRoom();
    reset(); // gameState becomes 'menu'; the effect disposes the scene
  };

  const myTeam = players.find((p) => p.id === socketService.socket?.id)?.team;
  const won = gameResult && gameResult.winnerTeam === myTeam;

  return (
    <div className="app-container">
      {gameState === 'menu' && (
        <MenuScreen
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      )}

      {gameState === 'room_lobby' && (
        <MenuBackdrop>
          <div className="menu-panel lobby-box">
            <h2 className="panel-title">{t('lobby.title')}</h2>
            <p className="lobby-meta">{t('lobby.roomCode')}</p>
            <div className="lobby-code">{roomCode}</div>
            <p className="lobby-meta">
              {t('lobby.map')}: {currentMap ? currentMap.name : t('create.defaultMap')}
            </p>
            <p className="lobby-meta">{t('lobby.players')}: {players.length}/{teamSize * 2} ({teamSize}v{teamSize})</p>
            <div className="lobby-players">
              {players.map((player) => (
                <div key={player.id} className="lobby-player">
                  <span>{player.name}</span>
                  <span className={`team-badge ${player.team}`}>{player.team}</span>
                </div>
              ))}
            </div>
            <MagicLoader />
            <p className="lobby-waiting">{t('lobby.waiting')}</p>
            <div className="menu-buttons">
              <button className="fantasy-btn ghost" onClick={handleLeaveRoom}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </MenuBackdrop>
      )}

      {gameState === 'in_game' && (
        <>
          <div className="game-container" ref={gameContainerRef}></div>
          <GameHUD
            players={players}
            currentPlayerId={socketService.socket?.id}
            roomCode={roomCode}
            getScene={getGameScene}
            onLeaveRoom={handleLeaveRoom}
          />
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
          />
          <RewardToasts />
          {gameResult && (
            <GameResultOverlay
              won={won}
              title={won ? t('game.victory') : t('game.defeat')}
              hint={won ? t('game.victoryHint') : t('game.defeatHint')}
              buttonLabel={t('game.backToMenu')}
              onContinue={handleLeaveRoom}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
