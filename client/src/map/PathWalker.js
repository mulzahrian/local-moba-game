import { MapObject } from './mapAssets.js';
import { measurePath, samplePath } from '../../../shared/pathConfig.js';

const TURN_RATE = 8; // how quickly the walker turns towards the next segment

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * An NPC that walks along a path of the map (see shared/pathConfig.js) while playing the chosen animation.
 * Its position comes from the wall clock, so every client sees the walkers at roughly the same spot.
 */
export class PathWalker {
  constructor(path) {
    this.object = null;
    this.yaw = null;
    this.setPath(path);
  }

  get root() {
    return this.object?.root || null;
  }

  setPath(path) {
    const previous = this.path;
    this.path = { ...path }; // a snapshot, so later edits of the same object are noticed as changes
    this.measured = measurePath(path.points, path.loop);

    const modelChanged = !previous || previous.type !== path.type || previous.scale !== path.scale;
    if (modelChanged) {
      const parent = this.object?.root.parent;
      this.object?.dispose();
      this.object = this.createObject(path);
      parent?.add(this.object.root);
      this.yaw = null;
      return;
    }
    if (previous.animation !== path.animation) {
      this.object.data.animation = path.animation; // also covers a model that is still loading
      this.object.setAnimation(path.animation);
    }
    if (previous.animSpeed !== path.animSpeed) this.object.setTimeScale(path.animSpeed);
  }

  createObject(path) {
    const object = new MapObject({
      uid: path.id,
      type: path.type,
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      scale: path.scale,
      animation: path.animation
    });
    object.root.userData.uid = undefined; // walkers are not pickable map objects
    object.ready.then(() => object.setTimeScale(path.animSpeed));
    return object;
  }

  update(delta) {
    const { root } = this.object;
    const { x, z, heading } = samplePath(this.measured, this.path.loop, (Date.now() / 1000) * this.path.speed);
    root.position.set(x, 0, z);
    if (this.yaw === null) {
      this.yaw = heading;
    } else {
      this.yaw += wrapAngle(heading - this.yaw) * (1 - Math.exp(-TURN_RATE * delta));
    }
    root.rotation.y = this.yaw;
    this.object.update(delta);
  }

  dispose() {
    this.object?.dispose();
    this.object = null;
  }
}
