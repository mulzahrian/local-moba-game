export function generateRoomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

export function calculateDistance(pos1, pos2) {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export const GAME_CONFIG = {
  BOARD_SIZE: 200,
  PLAYER_SPEED: 0.5,
  ATTACK_RANGE: 20,
  INITIAL_HEALTH: 100,
  INITIAL_MANA: 100,
  MAX_PLAYERS_PER_ROOM: 2
};
