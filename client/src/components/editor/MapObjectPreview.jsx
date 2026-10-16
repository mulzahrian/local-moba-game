import React, { useEffect, useRef } from 'react';
import { MapObjectPreviewScene } from '../../map/MapObjectPreviewScene.js';

export function MapObjectPreview({ type, settings }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const scene = new MapObjectPreviewScene(containerRef.current);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setObject(type, settings);
  }, [type, settings]);

  return <div className="ed-object-preview" ref={containerRef} aria-label="3D object preview" />;
}
