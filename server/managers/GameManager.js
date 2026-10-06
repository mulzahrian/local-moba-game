import { BUILTIN_CHARACTER_ID, DEFAULT_ROLE, MANA_REGEN_PER_SECOND, RESPAWN_SECONDS, getRoleConfig } from '../../shared/characterConfig.js';
import { DEFAULT_MAP_SIZE, buildTowers, getSpawnPosition, getTowerForTeam } from '../../shared/mapConfig.js';
import { DEFAULT_TEAM_SIZE, TEAMS } from '../../shared/matchConfig.js';
import { BOT_TICK_MS, pickBotName, tickBots } from './bots.js';
import { resolveAction } from './combat.js';
import { createMonsters, publicUnit, unitRadius } from './entities.js';
import { getSkillDef } from './loadouts.js';
import { WORLD_TICK_MS, tickWorld } from './world.js';
import { isSkillSlot, skillIdOfSlot } from '../../shared/skillConfig.js';

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
    role: character.role,
    health: maxHealth,
    maxHealth,
    mana: maxMana,
    maxMana,
    level: 1,
    experience: 0,
    dead: false,
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

  // Monsters and summoned units act in every room, with or without computer players.
  updateWorld() {
    for (const room of this.rooms.values()) {
      if (!this.hasHumans(room) || (!room.monsters.length && !room.units.length)) continue;
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
      this.scheduleRespawn(room.code, payload.targetId);
      this.io.to(room.code).emit('playerDied', { playerId: payload.targetId, killerId: payload.id });
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
    }
    event.hits.filter((hit) => hit.died).forEach((hit) => {
      console.log(`[Combat] ${hit.targetId} was defeated by ${caster.id}`);
      this.scheduleRespawn(room.code, hit.targetId);
      this.io.to(room.code).emit('playerDied', { playerId: hit.targetId, killerId: caster.id });
    });
    event.monsterHits.filter((hit) => hit.died).forEach((hit) => {
      this.handleMonsterDeath(room, room.monsters.find((monster) => monster.id === hit.id));
    });
    event.unitHits.filter((hit) => hit.died).forEach((hit) => {
      this.removeUnit(room, room.units.find((unit) => unit.id === hit.id), 'killed');
    });
    return event;
  }

  // Team with free places and the fewest players (team1 on a tie); null when both teams are full.
  pickTeam(room) {
    const open = TEAMS.map((team) => ({ team, count: room.players.filter((p) => p.team === team).length }))
      .filter(({ count }) => count < room.teamSize)
      .sort((a, b) => a.count - b.count);
    return open[0]?.team || null;
  }

  addPlayer(room, id, name, character, isBot = false) {
    const team = this.pickTeam(room);
    if (!team) return null;
    const used = new Set(room.players.filter((p) => p.team === team).map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot += 1;

    const spawn = getSpawnPosition(getTowerForTeam(room.towers, team), room.map?.size || DEFAULT_MAP_SIZE, slot);
    const player = createPlayer(id, name, team, slot, spawn, character, isBot);
    room.players.push(player);
    return player;
  }

  // Fills every free place of a single-player match with computer players.
  fillWithBots(room, characters) {
    const pool = characters?.length ? characters : [{ id: BUILTIN_CHARACTER_ID, role: DEFAULT_ROLE }];
    while (room.players.length < room.maxPlayers) {
      const character = pool[Math.floor(Math.random() * pool.length)];
      this.botCounter += 1;
      if (!this.addPlayer(room, `bot-${this.botCounter}`, pickBotName(this.botCounter), character, true)) break;
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
    if (!player) return;
    player.dead = true;
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
      this.io.to(roomCode).emit('playerRespawned', { player: current });
    }, RESPAWN_SECONDS * 1000);
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

  joinRoom(roomCode, playerId, playerName, character) {
    console.log(`  [GameManager] Looking up room with code: "${roomCode}"`);
    const room = this.rooms.get(roomCode);

    if (!room || room.singlePlayer || room.gameState !== 'waiting') {
      console.log(`  [GameManager] ? Room "${roomCode}" not found or not open for joining`);
      return null;
    }

    if (room.players.length >= room.maxPlayers || !this.addPlayer(room, playerId, playerName, character)) {
      console.log(`  [GameManager] ? Room is full: ${room.players.length}/${room.maxPlayers}`);
      return null;
    }

    console.log(`  [GameManager] ? Player added. Room now: ${room.players.length}/${room.maxPlayers}`);

    if (room.players.length === room.maxPlayers) {
      room.gameState = 'in_progress';
    }

    return room;
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
          this.io.to(roomCode).emit('playerDisconnected', { 
            playerId,
            remainingPlayers: room.players 
          });
        } else {
          room.players = []; // computer players leave with the last human
          // Delete empty room after a grace period (allows brief reconnects)
          setTimeout(() => {
            const r = this.rooms.get(roomCode);
            if (r && r.players.length === 0) {
              this.rooms.delete(roomCode);
              console.log(`Room ${roomCode} deleted (empty for 60s)`);
            }
          }, 60000);
        }
        
        break;
      }
    }
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }
}

export default GameManager;
