# RAPP MOBA Game

RAPP MOBA Game is a browser-based 3D MOBA prototype designed for local-network multiplayer. Players choose a hero, enter a battlefield, fight computer-controlled and human opponents, use skills, defeat monsters, and destroy the enemy team's main tower.

The project is split into a React/Three.js client, a Node.js game server, and shared configuration used by both sides.

## Features

- Single-player matches with computer-controlled allies and enemies.
- Multiplayer rooms that can be created and joined with a room code.
- Server-authoritative movement, combat, skills, monsters, summoned units, towers, and match results.
- 3D gameplay rendered with Three.js and animated GLB assets.
- Hero roles, basic attack combinations, mana, health, respawning, and role-based skills.
- Monster encounters that can reward gold and skills.
- In-game shop, skill loadouts, chat, music, sound effects, and victory/defeat screens.
- Map Generator for creating custom battlefields, placing objects, configuring towers, paths, sky, weather, and music.
- Character, skill, monster, and object libraries with uploadable assets.
- English and Bahasa Indonesia interface translations.

## Tech Stack

- React 18 and Vite
- Three.js
- Zustand
- Socket.IO
- Node.js, Express, and CORS
- JavaScript ES modules

## Requirements

- Node.js 18 or newer
- npm
- A modern desktop browser with WebGL support

## Project Structure

```text
client/    React frontend, Three.js scenes, UI, assets, and browser-side services
server/    Express API, Socket.IO server, game managers, persistent game data, and seed assets
shared/    Configuration and utilities shared by the client and server
```

## Installation

Install dependencies in each package directory:

```bash
cd client
npm install

cd ../server
npm install
```

## Running the Game

Start the server in one terminal:

```bash
cd server
npm start
```

The server listens on port `3001` by default. Set the `PORT` environment variable to use another port.

Start the Vite client in a second terminal:

```bash
cd client
npm run dev
```

The client runs on port `3002` and is configured to connect to the game server on port `3001`. Open the Vite URL shown in the terminal, usually:

```text
http://localhost:3002
```

For local-network play, open the client using the host computer's LAN IP address, for example `http://192.168.1.10:3002`. Make sure the host firewall allows traffic on ports `3001` and `3002`, and start the server before creating or joining a room.

## Available Scripts

### Client

```bash
npm run dev       # Start the Vite development server
npm run build     # Create a production build
npm run preview   # Preview the production build locally
```

### Server

```bash
npm start         # Start the game server
npm run dev       # Start the server with Node watch mode
```

## Controls

| Input | Action |
| --- | --- |
| `WASD` / Arrow keys | Move the hero |
| Left mouse button | Basic attack / interact with the battlefield |
| `Z` | Use skill 1 |
| `X` | Use skill 2 |
| `C` | Use skill 3 |
| `1` - `4` | Use equipped skill loadout slots |
| `Q` | Emote |
| `Space` | Jump |
| `B` | Open or close the shop |
| `K` | Open or close the skill inventory |
| Mouse drag / wheel | Rotate or zoom the game camera |

The exact available attacks and skills depend on the selected hero and equipped loadout.

## How to Play

1. Start the server and client.
2. Open the game in your browser and enter a hero name.
3. Select **Single Player** to start immediately with bots, or select **Multiplayer**.
4. Create a room, choose a battlefield and team size, then share the room code with other players.
5. Move around the arena, defeat enemies and monsters, use skills, and protect your team's towers.
6. Destroy the opposing team's main tower to win the match.

## Map and Content Authoring

The **Map Generator** is available from the main menu. It can be used to:

- Create and edit saved maps stored by the server.
- Place, move, rotate, scale, duplicate, and delete map objects.
- Configure two teams of towers, including each team's main tower and side tower.
- Create paths for moving objects and monsters.
- Configure map size, sky, weather, and background music.
- Preview a map before saving it.

The content tools also provide libraries for custom characters, skills, monsters, and GLB-based map objects. Uploaded content is stored and served by the Node.js server.

## API and Networking

The server exposes REST endpoints for rooms, maps, characters, objects, skills, monsters, and uploaded assets. Real-time gameplay uses Socket.IO events for room management, player movement, combat, skills, world entities, chat, and match state.

The default development endpoints are:

```text
HTTP API:  http://localhost:3001
Socket.IO: http://localhost:3001
Client:    http://localhost:3002
```

## Development Notes

- The server is authoritative for important gameplay state and combat resolution.
- Shared gameplay definitions live in `shared/` so the client and server use the same character, skill, map, monster, match, and economy rules.
- Maps and generated content are persisted under `server/data/`.
- Three.js models and browser assets are stored primarily under `client/src/` and `server/seed/`.
- This is an active prototype; gameplay balance, assets, and APIs may change during development.
