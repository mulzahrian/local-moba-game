import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import wizardModelUrl from '../model/backround.glb?url';

// Decorative 3D character used only on the title screen. The canvas is transparent so
// the existing menu artwork remains the visual foundation behind the model.
export function MainMenuCharacter() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    camera.position.set(0, 2.55, 9.6);
    camera.lookAt(0, 2.25, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xffe8c1, 0x160d18, 1.7);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffd19a, 3.2);
    keyLight.position.set(-3, 8, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x8c7dff, 11, 10, 2);
    rimLight.position.set(3.5, 3.5, -2.5);
    scene.add(rimLight);

    const warmLight = new THREE.PointLight(0xff7135, 8, 9, 2);
    warmLight.position.set(-3.5, 1.4, 2.5);
    scene.add(warmLight);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    const loader = new GLTFLoader();
    const clock = new THREE.Clock();
    const mixerRef = { current: null };
    let model = null;
    let disposed = false;
    let animationFrame;
    let resizeObserver;

    const fitModel = (loadedModel) => {
      loadedModel.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(loadedModel);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const height = Math.max(size.y, 0.01);
      const scale = 4.9 / height;

      loadedModel.scale.setScalar(scale);
      loadedModel.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      loadedModel.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
      });

      modelRoot.add(loadedModel);
      model = loadedModel;

      if (loadedModel.userData?.gltfAnimations?.length) {
        const clips = loadedModel.userData.gltfAnimations;
        const idleClip = clips.find((clip) => /idle|stand|wait|breath|hover/i.test(clip.name)) || clips[0];
        mixerRef.current = new THREE.AnimationMixer(loadedModel);
        mixerRef.current.clipAction(idleClip).reset().fadeIn(0.35).play();
      }
    };

    const loadPromise = new Promise((resolve, reject) => {
      loader.load(wizardModelUrl, resolve, undefined, reject);
    });

    loadPromise
      .then((gltf) => {
        if (disposed) return;
        // Keep clips on the scene object so fitModel can remain focused on presentation.
        gltf.scene.userData.gltfAnimations = gltf.animations;
        fitModel(gltf.scene);
      })
      .catch((error) => {
        if (!disposed) console.warn('[MainMenuCharacter] Unable to load decorative model', error);
      });

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const animate = () => {
      if (disposed) return;
      animationFrame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.elapsedTime;
      mixerRef.current?.update(delta);

      if (model) {
        // A restrained breathing sway makes the character feel alive without competing
        // with the GLB's own spellcaster idle animation.
        modelRoot.rotation.y = Math.sin(elapsed * 0.42) * 0.075;
        modelRoot.position.y = Math.sin(elapsed * 1.15) * 0.035;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      mixerRef.current?.stopAllAction();

      modelRoot.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material?.dispose?.());
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="main-menu-character" ref={containerRef} aria-hidden="true" />;
}
