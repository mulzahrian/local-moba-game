// Match format shared by the menu (client) and the game server: N vs N, from 1v1 up to 5v5.

export const MIN_TEAM_SIZE = 1;
export const MAX_TEAM_SIZE = 5;
export const DEFAULT_TEAM_SIZE = 1;
export const TEAM_SIZES = Array.from({ length: MAX_TEAM_SIZE - MIN_TEAM_SIZE + 1 }, (_, i) => MIN_TEAM_SIZE + i);

export const TEAMS = ['team1', 'team2'];

export function sanitizeTeamSize(value) {
  const size = Math.round(Number(value));
  if (!Number.isFinite(size)) return DEFAULT_TEAM_SIZE;
  return Math.min(MAX_TEAM_SIZE, Math.max(MIN_TEAM_SIZE, size));
}
