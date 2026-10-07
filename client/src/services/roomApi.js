import { getServerUrl } from '../config/server.js';

// Rooms waiting for players: [{ code, hostName, mapName, teamSize, players, maxPlayers }]
export async function listOpenRooms() {
  const response = await fetch(`${getServerUrl()}/api/rooms`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.message || `Request failed (${response.status})`);
  return data.rooms;
}
