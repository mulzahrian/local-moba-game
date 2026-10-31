import { BUILTIN_CHARACTER_ID, BUILTIN_CHARACTER_NAME, DEFAULT_ROLE, MANA_REGEN_PER_SECOND, RESPAWN_BASE_SECONDS, RESPAWN_INCREMENT_SECONDS, getRoleConfig } from '../../shared/characterConfig.js';
import { DEFAULT_MAP_SIZE, buildTowers, getSpawnPosition, getTowerForTeam } from '../../shared/mapConfig.js';
import { DEFAULT_TEAM_SIZE, TEAMS } from '../../shared/matchConfig.js';
import { BOT_TICK_MS, pickBotName, tickBots } from './bots.js';
import { resolveAction } from './combat.js';
import { createMonsters, publicUnit, unitRadius } from './entities.js';
import { getSkillDef } from './loadouts.js';
import { WORLD_TICK_MS, tickWorld } from './world.js';
import { isSkillSlot, skillIdOfSlot } from '../../shared/skillConfig.js';
import { MINION_COUNT_PER_TEAM, MINION_RESPAWNS } from '../../shared/minionConfig.js';

// Builds a fresh in-room player for the chosen character (role decides health and mana pools).
function createPlayer(id, name, team, slot, position, character, isBot = false) {
  const { maxHealth, maxMana } = getRoleConfig(character.role);
  return {
    id,
    name,
    position,
    spawn: { ...position },
    team,
    slot, // spawn place within the team
    isBot,
    characterId: character.id,
    characterName: character.name,
    role: character.role,
    health: maxHealth,
    maxHealth,
    mana: maxMana,
    maxMana,
    level: 1,
    experience: 0,
    dead: false,
    deathCount: 0,
    respawnAt: 0,
    respawnDelay: 0,
    cooldowns: {},
    loadout: [], // ids of the equipped skills (see loadouts.js)
    invisibleUntil: 0
  };
}

class GameManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.botCounter = 0;
    this.manaTimer = setInterval(() => this.regenerateMana(), 1000);
    this.botTimer = setInterval(() => this.updateBots(), BOT_TICK_MS);
    this.worldTimer = setInterval(() => this.updateWorld(), WORLD_TICK_MS);
    this.unitCounter = 0;
  }

  // Towers, monsters and summoned units act in every room that has human players.
  updateWorld() {
    for (const room of this.rooms.values()) {
      if (!this.hasHumans(room)) continue;
      tickWorld(room, this, WORLD_TICK_MS / 1000);
    }
  }

  // Damage dealt to a hero by a monster or unit. The death (if any) is announced by broadcastAttack.
  damagePlayer(room, target, damage) {
    target.health = Math.max(0, target.health - damage);
    if (target.health <= 0) target.dead = true;
    return {
      targetId: target.id,
      damage,
      health: target.health,
      reaction: 'hit',
      position: { x: target.position.x, z: target.position.z },
      died: target.dead
    };
  }

  // A monster or unit attacked (or healed): clients play the animation / effect and apply the result.
  broadcastAttack(room, payload) {
    this.io.to(room.code).emit('entityAttack', { ...payload, players: room.players });
    if (payload.targetKind === 'player' && payload.hit?.died) {
      const respawn = this.scheduleRespawn(room.code, payload.targetId);
      this.io.to(room.code).emit('playerDied', { playerId: payload.targetId, killerId: payload.id, ...respawn });
    }
  }

  // A monster fell: it disappears and its killer is rewarded with money and (when the monster has one) a skill.
  handleMonsterDeath(room, monster) {
    if (!monster) return;
    monster.dead = true;
    monster.target = null;
    this.io.to(room.code).emit('entityDied', { kind: 'monster', id: monster.id });
    this.io.to(room.code).emit('monsterDefeated', {
      id: monster.id,
      name: monster.name,
      killerId: monster.killerId,
      team: room.players.find((player) => player.id === monster.killerId)?.team || null,
      skillId: monster.rewardSkillId,
      gold: monster.gold
    });
    console.log(`[World] ${monster.name} (${monster.id}) was defeated by ${monster.killerId} in room ${room.code}`);
  }

  removeUnit(room, unit, reason) {
    if (!unit) return;
    unit.dead = true;
    room.units = room.units.filter((candidate) => candidate !== unit);
    this.io.to(room.code).emit('entityDied', { kind: 'unit', id: unit.id, reason });
    if (unit.minion && reason === 'killed' && unit.respawnsLeft > 0) {
      unit.respawnsLeft -= 1;
      unit.respawnAt = Date.now() + 10000;
      setTimeout(() => {
        const currentRoom = this.rooms.get(room.code);
        if (!currentRoom || currentRoom.gameState !== 'in_progress') return;
        unit.dead = false;
        unit.health = unit.maxHealth;
        unit.position = { ...unit.home };
        unit.nextAttackAt = Date.now() + 1000;
        unit.respawnAt = 0;
        unit.sentState = null;
        currentRoom.units.push(unit);
        this.io.to(room.code).emit('unitRespawned', { unit: publicUnit(unit), delay: 10, respawnsLeft: unit.respawnsLeft });
      }, 10000);
    }
  }

  // Spawns the units of a necromancer / summoner / support skill next to the caster, replacing the ones
  // the same skill summoned before.
  summonUnits(room, caster, def, now) {
    room.units.filter((unit) => unit.ownerId === caster.id && unit.skillId === def.skillId).forEach((unit) => this.removeUnit(room, unit, 'replaced'));

    const limit = (room.map?.size || DEFAULT_MAP_SIZE) / 2 - 10;
    const count = def.units.length;
    const spawned = def.units.map((unit, index) => {
      const angle = (index / count) * Math.PI * 2 + Math.PI / 4;
      const p = unit.params;
      const entity = {
        id: `unit-${++this.unitCounter}`,
        ownerId: caster.id,
        team: caster.team,
        skillId: def.skillId,
        unitId: unit.id,
        power: unit.power,
        effect: unit.effect,
        movement: unit.movement,
        scale: p.scale,
        radius: unitRadius(p.scale),
        position: {
          x: Math.min(Math.max(caster.position.x + Math.cos(angle) * 3.5, -limit), limit),
          z: Math.min(Math.max(caster.position.z + Math.sin(angle) * 3.5, -limit), limit)
        },
        rotationY: 0,
        health: p.health,
        maxHealth: p.health,
        speed: p.speed,
        range: p.range,
        cooldown: p.cooldown,
        amount: p.amount,
        expiresAt: def.lifetime > 0 ? now + def.lifetime * 1000 : null,
        nextAttackAt: now + 800,
        stunUntil: 0,
        moving: false,
        dead: false
      };
      room.units.push(entity);
      return entity;
    });
    return spawned.map(publicUnit);
  }

  spawnMinions(room, defs) {
    const pool = [...defs.values()];
    if (!pool.length) return;
    for (const team of ['team1', 'team2']) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const tower = getTowerForTeam(room.towers, team);
      const enemyTower = room.towers.find((candidate) => candidate.team !== team && candidate.main) || room.towers.find((candidate) => candidate.team !== team);
      const laneX = (enemyTower?.position.x || 0) - tower.position.x;
      const laneZ = (enemyTower?.position.z || 0) - tower.position.z;
      const laneLength = Math.hypot(laneX, laneZ) || 1;
      const perpendicular = { x: -laneZ / laneLength, z: laneX / laneLength };
      for (let i = 0; i < MINION_COUNT_PER_TEAM; i += 1) {
        const def = shuffled[i % shuffled.length];
        const offset = (i - 1.5) * 3;
        const spawnPosition = { x: tower.position.x + perpendicular.x * offset, z: tower.position.z + perpendicular.z * offset };
        room.units.push({ id: `minion-${++this.unitCounter}`, minion: true, minionId: def.id, laneIndex: i, team, ownerId: null, skillId: null, unitId: null, movement: def.movement, attackType: def.attackType || 'sword', scale: def.params.scale, radius: Math.max(0.8, def.params.scale), position: spawnPosition, rotationY: 0, speed: def.params.speed, range: def.params.attackRange, cooldown: def.params.attackCooldown, amount: def.params.damage, health: def.params.health, maxHealth: def.params.health, nextAttackAt: Date.now() + 1000, stunUntil: 0, moving: false, dead: false, respawnsLeft: MINION_RESPAWNS, respawnAt: 0, home: { ...spawnPosition } });
      }
    }
  }

  hasHumans(room) {
    return room.players.some((p) => !p.isBot);
  }

  updateBots() {
    for (const room of this.rooms.values()) {
      if (!this.hasHumans(room) || !room.players.some((p) => p.isBot)) continue;
      const moved = tickBots(room, BOT_TICK_MS / 1000, (bot, slot, dir) => this.performAction(room, bot, slot, dir));
      moved.forEach((bot) => this.io.to(room.code).emit('playerMoved', { playerId: bot.id, position: bot.position }));
    }
  }

  // Resolves an attack / skill / emote through the combat rules and tells the room what happened.
  performAction(room, caster, slot, dir) {
    let custom = null;
    if (isSkillSlot(slot)) {
      custom = getSkillDef(caster, skillIdOfSlot(slot));
      if (!custom) return null; // not equipped
    }
    const event = resolveAction(room, caster, slot, dir, Date.now(), custom);
    if (!event) return null;

    if (custom?.summon) {
      event.spawned = this.summonUnits(room, caster, custom, Date.now());
    }

    this.io.to(room.code).emit('skillUsed', { ...event, players: room.players });
    if (event.winnerTeam) {
      console.log(`[Combat] ${event.winnerTeam} destroyed the enemy tower in room ${room.code}`);
      this.io.to(room.code).emit('gameOver', { winnerTeam: event.winnerTeam });
      this.removeRoom(room.code, 'game finished');
    }
    event.hits.filter((hit) => hit.died).forEach((hit) => {
      console.log(`[Combat] ${hit.targetId} was defeated by ${caster.id}`);
      const respawn = this.scheduleRespawn(room.code, hit.targetId);
      this.io.to(room.code).emit('playerDied', { playerId: hit.targetId, killerId: caster.id, ...respawn });
    });
    event.monsterHits.filter((hit) => hit.died).forEach((hit) => {
      this.handleMonsterDeath(room, room.monsters.find((monster) => monster.id === hit.id));
    });
    event.unitHits.filter((hit) => hit.died).forEach((hit) => {
      this.removeUnit(room, room.units.find((unit) => unit.id === hit.id), 'killed');
    });
    return event;
  }

  // Why a player cannot take a place in a team: 'full', 'characterTaken' (a teammate already plays that
  // character) or null when the place is free. `playerId` is ignored so a player can be checked for their own team.
  teamBlocker(room, team, characterId, playerId = null) {
    const members = room.players.filter((p) => p.team === team && p.id !== playerId);
    if (members.length >= room.teamSize) return 'full';
    if (characterId && members.some((p) => p.characterId === characterId)) return 'characterTaken';
    return null;
  }

  // Team with a free place the character may take and the fewest players (team1 on a tie).
  // Null when there is none; `reason` says whether the teams are full or the character is taken.
  pickTeam(room, characterId = null) {
    const blockers = TEAMS.map((team) => ({ team, blocker: this.teamBlocker(room, team, characterId) }));
    const open = blockers
      .filter(({ blocker }) => !blocker)
      .map(({ team }) => ({ team, count: room.players.filter((p) => p.team === team).length }))
      .sort((a, b) => a.count - b.count);
    if (open.length) return { team: open[0].team, reason: null };
    return { team: null, reason: blockers.some(({ blocker }) => blocker === 'characterTaken') ? 'characterTaken' : 'full' };
  }

  // First spawn slot of the team nobody else uses, and the matching spawn point.
  placeInTeam(room, team, playerId = null) {
    const used = new Set(room.players.filter((p) => p.team === team && p.id !== playerId).map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot += 1;
    const spawn = getSpawnPosition(getTowerForTeam(room.towers, team), room.map?.size || DEFAULT_MAP_SIZE, slot);
    return { slot, spawn };
  }

  // Adds a player to the given team, or to the best open team when none is given. Returns { player } or { error }.
  addPlayer(room, id, name, character, isBot = false, team = null) {
    let error = null;
    if (!team) ({ team, reason: error } = this.pickTeam(room, character.id));
    else error = this.teamBlocker(room, team, character.id);
    if (error || !team) return { error: error || 'full' };

    const { slot, spawn } = this.placeInTeam(room, team);
    const player = createPlayer(id, name, team, slot, spawn, character, isBot);
    room.players.push(player);
    return { player };
  }

  // Moves a waiting player to the other team (spawn point included) when it has room for their character.
  switchTeam(room, playerId, team) {
    const player = room.players.find((p) => p.id === playerId);
    if (!player || room.gameState !== 'waiting' || !TEAMS.includes(team)) return { error: 'invalid' };
    if (player.team === team) return { player };
    const error = this.teamBlocker(room, team, player.characterId, playerId);
    if (error) return { error };

    const { slot, spawn } = this.placeInTeam(room, team, playerId);
    Object.assign(player, { team, slot, position: spawn, spawn: { ...spawn } });
    return { player };
  }

  // Only the host starts a match, once every place of both teams is taken.
  startGame(room, playerId) {
    if (room.hostId !== playerId) return { error: 'notHost' };
    if (room.gameState !== 'waiting') return { error: 'invalid' };
    if (room.players.length < room.maxPlayers) return { error: 'notFull' };
    room.gameState = 'in_progress';
    return { room };
  }

  // Fills every free place of a single-player match with computer players. Bots avoid characters their
  // team already has (and only repeat one when the team has run out of different characters).
  fillWithBots(room, characters) {
    const pool = characters?.length ? characters : [{ id: BUILTIN_CHARACTER_ID, name: BUILTIN_CHARACTER_NAME, role: DEFAULT_ROLE }];
    while (room.players.length < room.maxPlayers) {
      const { team } = this.pickTeam(room);
      if (!team) break;
      const taken = new Set(room.players.filter((p) => p.team === team).map((p) => p.characterId));
      const fresh = pool.filter((c) => !taken.has(c.id));
      const choices = fresh.length ? fresh : pool;
      const character = choices[Math.floor(Math.random() * choices.length)];
      this.botCounter += 1;
      const { slot, spawn } = this.placeInTeam(room, team);
      room.players.push(createPlayer(`bot-${this.botCounter}`, pickBotName(this.botCounter), team, slot, spawn, character, true));
    }
  }

  regenerateMana() {
    for (const [roomCode, room] of this.rooms) {
      const changed = [];
      room.players.forEach((player) => {
        if (player.dead || player.mana >= player.maxMana) return;
        player.mana = Math.min(player.maxMana, player.mana + MANA_REGEN_PER_SECOND);
        changed.push({ id: player.id, health: player.health, mana: player.mana });
      });
      if (changed.length) this.io.to(roomCode).emit('statsUpdated', { stats: changed });
    }
  }

  // Marks a player dead and brings them back at their spawn point after a short delay.
  scheduleRespawn(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    const player = room?.players.find((p) => p.id === playerId);
    // Combat marks the player dead before this method is called; respawnAt is
    // the actual duplicate-scheduling guard.
    if (!player || player.respawnAt) return null;
    const respawnDelay = RESPAWN_BASE_SECONDS + player.deathCount * RESPAWN_INCREMENT_SECONDS;
    const respawnAt = Date.now() + respawnDelay * 1000;
    player.dead = true;
    player.deathCount += 1;
    player.respawnAt = respawnAt;
    player.respawnDelay = respawnDelay;
    setTimeout(() => {
      const current = this.rooms.get(roomCode)?.players.find((p) => p.id === playerId);
      if (!current) return;
      current.dead = false;
      current.health = current.maxHealth;
      current.mana = current.maxMana;
      current.position = { ...current.spawn };
      current.cooldowns = {};
      current.invisibleUntil = 0;
      current.dominatedUntil = 0;
      current.respawnAt = 0;
      current.respawnDelay = 0;
      this.io.to(roomCode).emit('playerRespawned', { player: current });
    }, respawnDelay * 1000);
    return { respawnAt, respawnDelay, deathCount: player.deathCount };
  }

  createRoom(roomCode, hostId, hostName, map = null, environment = null, character, options = {}) {
    console.log(`  [GameManager] Creating room with code: "${roomCode}"`);

    if (this.rooms.has(roomCode)) {
      console.log(`  [GameManager] ? Room code already exists!`);
      return null;
    }

    const teamSize = options.teamSize || DEFAULT_TEAM_SIZE;
    const room = {
      code: roomCode,
      hostId: hostId,
      players: [],
      towers: buildTowers(map), // the two bases; destroying the enemy tower wins the match
      monsters: createMonsters(map, options.monsterDefs || new Map()), // guards placed on the map
      units: [], // units summoned by skills
      winnerTeam: null,

      map, // full map JSON chosen by the host (null = default arena)
      environment, // { sky, weather } chosen by the host
      gameState: 'waiting', // waiting, starting, in_progress, finished
      createdAt: new Date(),
      teamSize, // N vs N
      maxPlayers: teamSize * 2,
      singlePlayer: Boolean(options.singlePlayer) // the other places are filled with computer players
    };
    this.spawnMinions(room, options.minionDefs || new Map());

    this.addPlayer(room, hostId, hostName, character);
    if (room.singlePlayer) {
      this.fillWithBots(room, options.botCharacters);
      room.gameState = 'in_progress';
    }

    this.rooms.set(roomCode, room);
    console.log(`  [GameManager] ? Room stored with key: "${roomCode}" (${teamSize}v${teamSize}${room.singlePlayer ? ', single player' : ''})`);
    console.log(`  [GameManager] Rooms now in storage: ${Array.from(this.rooms.keys()).join(", ")}`);

    return room;
  }

  // Adds a player to a waiting room. Returns { room } or { error } ('notFound', 'full' or 'characterTaken').
  joinRoom(roomCode, playerId, playerName, character) {
    console.log(`  [GameManager] Looking up room with code: "${roomCode}"`);
    const room = this.rooms.get(roomCode);

    if (!room || room.singlePlayer || room.gameState !== 'waiting') {
      console.log(`  [GameManager] ? Room "${roomCode}" not found or not open for joining`);
      return { error: 'notFound' };
    }

    const { error } = this.addPlayer(room, playerId, playerName, character);
    if (error) {
      console.log(`  [GameManager] ? Cannot join room (${error}): ${room.players.length}/${room.maxPlayers}`);
      return { error };
    }

    console.log(`  [GameManager] ? Player added. Room now: ${room.players.length}/${room.maxPlayers}`);
    return { room };
  }
  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  playerDisconnect(playerId) {
    for (const [roomCode, room] of this.rooms) {
      const playerIndex = room.players.findIndex(p => p.id === playerId);
      
      if (playerIndex !== -1) {
        const disconnectedPlayer = room.players[playerIndex];
        room.players.splice(playerIndex, 1);
        room.units.filter((unit) => unit.ownerId === playerId).forEach((unit) => this.removeUnit(room, unit, 'orphaned'));

        console.log(`Player ${disconnectedPlayer.name} disconnected from room ${roomCode} (${room.players.length} left)`);

        if (this.hasHumans(room)) {
          if (room.hostId === playerId) room.hostId = room.players.find((p) => !p.isBot).id;
          this.io.to(roomCode).emit('playerDisconnected', { 
            playerId,
            remainingPlayers: room.players,
            hostId: room.hostId
          });
        } else {
          this.removeRoom(roomCode, 'everybody left'); // computer players leave with the last human
        }
        
        break;
      }
    }
  }

  // Drops a room (it disappears from the room list and stops ticking).
  removeRoom(roomCode, reason) {
    if (!this.rooms.delete(roomCode)) return;
    console.log(`Room ${roomCode} deleted (${reason})`);
  }

  // Rooms a player can still join from the room list: multiplayer matches waiting in their lobby.
  listOpenRooms() {
    return this.getAllRooms()
      .filter((room) => !room.singlePlayer && room.gameState === 'waiting')
      .map((room) => ({
        code: room.code,
        hostName: room.players.find((p) => p.id === room.hostId)?.name || '',
        mapName: room.map?.name || null,
        teamSize: room.teamSize,
        players: room.players.length,
        maxPlayers: room.maxPlayers
      }));
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }
}

export default GameManager;
