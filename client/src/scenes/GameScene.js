import * as THREE from 'three';

export class GameScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });

    this.setupRenderer();
    this.setupScene();
    this.setupLights();
    this.setupBoard();

    this.players = new Map();
    this.enemies = new Map();
    this.selectedPlayer = null;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    this.socketService = null;
    this.roomCode = null;

    this.setupEventListeners();
    this.animate();
  }

  setupRenderer() {
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setClearColor(0x1a1a1a);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupScene() {
    this.scene.background = new THREE.Color(0x0a0a0a);
    // Camera positioned for better isometric-like view of larger map
    this.camera.position.set(100, 150, 150);
    this.camera.lookAt(0, 0, 0);
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);
  }

  setupBoard() {
    // Game board - DOTA-style large map (500x500 units)
    const boardGeometry = new THREE.PlaneGeometry(500, 500);
    const boardMaterial = new THREE.MeshLambertMaterial({ color: 0x1a3a1a });
    const board = new THREE.Mesh(boardGeometry, boardMaterial);
    board.receiveShadow = true;
    board.rotation.x = -Math.PI / 2;
    this.scene.add(board);

    // Large grid helper - like Dota map
    const gridHelper = new THREE.GridHelper(500, 50, 0x447744, 0x223322);
    gridHelper.position.y = 0.1;
    this.scene.add(gridHelper);

    // Radiant base (bottom-left, green)
    this.createBaseMarker(-200, 0, -200, 0x92a825, 'Radiant');
    
    // Dire base (top-right, red)
    this.createBaseMarker(200, 0, 200, 0x922620, 'Dire');

    // Add some arena walls/boundaries
    this.createWall(-250, 0, 0, 500, 'vertical');
    this.createWall(250, 0, 0, 500, 'vertical');
    this.createWall(0, 0, -250, 500, 'horizontal');
    this.createWall(0, 0, 250, 500, 'horizontal');
  }

  createWall(x, y, z, length, orientation) {
    const width = orientation === 'horizontal' ? length : 5;
    const depth = orientation === 'vertical' ? length : 5;
    const geometry = new THREE.BoxGeometry(width, 15, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.3 });
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(x, 7.5, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
  }

  createBaseMarker(x, y, z, color, name) {
    // Larger base marker - visible tower-like structure
    const geometry = new THREE.ConeGeometry(20, 40, 32);
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.4 });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(x, y, z);
    marker.castShadow = true;
    marker.receiveShadow = true;
    this.scene.add(marker);
    
    // Base circle on ground
    const baseGeometry = new THREE.CylinderGeometry(30, 30, 1, 32);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: color, opacity: 0.6, transparent: true });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(x, 0.5, z);
    base.receiveShadow = true;
    this.scene.add(base);
  }

  addPlayer(playerId, playerData, isCurrentPlayer = false) {
    if (this.players.has(playerId)) {
      this.updatePlayer(playerId, playerData);
      return;
    }

    const geometry = new THREE.CapsuleGeometry(3, 10, 4, 8);
    const material = new THREE.MeshStandardMaterial({
      color: playerData.team === 'team1' ? 0xff6b6b : 0x4ecdc4
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    mesh.position.set(playerData.position.x, 5, playerData.position.z);

    // Name label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.font = 'Bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(playerData.name, 128, 45);

    const texture = new THREE.CanvasTexture(canvas);
    const labelGeometry = new THREE.PlaneGeometry(8, 2);
    const labelMaterial = new THREE.MeshBasicMaterial({ map: texture });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.y = 15;
    mesh.add(label);

    this.scene.add(mesh);

    this.players.set(playerId, {
      mesh,
      data: playerData,
      isCurrentPlayer
    });
  }

  updatePlayer(playerId, playerData) {
    const player = this.players.get(playerId);
    if (player) {
      player.data = playerData;
      player.mesh.position.set(playerData.position.x, 5, playerData.position.z);
    }
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.scene.remove(player.mesh);
      this.players.delete(playerId);
    }
  }

  // Called by App.jsx to set socket reference and room code for emitting events
  setSocketService(socketService, roomCode) {
    this.socketService = socketService;
    this.roomCode = roomCode;
  }

  setupEventListeners() {
    this.container.addEventListener('click', (e) => this.onMouseClick(e));
    this.container.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }

  onMouseClick(event) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const playerMeshes = Array.from(this.players.values()).map(p => p.mesh);
    const intersects = this.raycaster.intersectObjects(playerMeshes);

    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object;
      for (const [playerId, player] of this.players) {
        if (player.mesh === clickedMesh) {
          this.selectPlayer(playerId);
          return;
        }
      }
    }

    // Click on ground to move
    const groundRay = new THREE.Raycaster();
    groundRay.setFromCamera(this.mouse, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    groundRay.ray.intersectPlane(plane, target);

    if (this.selectedPlayer && this.players.has(this.selectedPlayer)) {
      const player = this.players.get(this.selectedPlayer);
      if (player.isCurrentPlayer) {
        // CRITICAL FIX: Actually emit movement to socket with roomCode!
        if (this.socketService && this.roomCode) {
          this.socketService.emit('playerMove', {
            roomCode: this.roomCode,
            position: { x: target.x, z: target.z }
          });
        }
      }
    }
  }

  onMouseMove(event) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  selectPlayer(playerId) {
    // Remove previous selection highlight
    if (this.selectedPlayer && this.players.has(this.selectedPlayer)) {
      const previousPlayer = this.players.get(this.selectedPlayer);
      previousPlayer.mesh.material.emissive.setHex(0x000000);
    }

    // Add selection highlight
    if (this.players.has(playerId)) {
      const player = this.players.get(playerId);
      player.mesh.material.emissive.setHex(0x444444);
      this.selectedPlayer = playerId;
    }
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.container.removeEventListener('click', this.onMouseClick);
    this.container.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
