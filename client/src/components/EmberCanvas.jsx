import React, { useEffect, useRef } from 'react';

const COLORS = ['255,214,102', '255,170,60', '255,120,30', '255,80,20'];

function spawn(width, height, randomY) {
  const size = 1 + Math.random() * 3.2;
  return {
    x: Math.random() * width,
    y: randomY ? Math.random() * height : height + 10 + Math.random() * 40,
    vy: 25 + Math.random() * 70,
    sway: 8 + Math.random() * 28,
    swaySpeed: 0.6 + Math.random() * 1.6,
    phase: Math.random() * Math.PI * 2,
    size,
    life: 0,
    maxLife: 4 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    flicker: 6 + Math.random() * 10
  };
}

// Rising embers / fire sparks drawn on a full-screen canvas.
export function EmberCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let particles = [];
    let frameId;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(220, Math.max(60, Math.round(width / 9)));
      particles = Array.from({ length: target }, () => spawn(width, height, true));
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now) => {
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      particles.forEach((p, i) => {
        p.life += delta;
        p.y -= p.vy * delta;
        const x = p.x + Math.sin(p.phase + p.life * p.swaySpeed) * p.sway;
        const progress = p.life / p.maxLife;
        if (progress >= 1 || p.y < -20) {
          particles[i] = spawn(width, height, false);
          return;
        }
        const fade = Math.sin(Math.min(progress, 1) * Math.PI); // fade in, fade out
        const twinkle = 0.75 + 0.25 * Math.sin(p.life * p.flicker);
        const alpha = fade * twinkle * 0.9;
        const radius = p.size * (1 - progress * 0.5);

        const glow = ctx.createRadialGradient(x, p.y, 0, x, p.y, radius * 5);
        glow.addColorStop(0, `rgba(${p.color},${alpha})`);
        glow.addColorStop(0.25, `rgba(${p.color},${alpha * 0.45})`);
        glow.addColorStop(1, `rgba(${p.color},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, p.y, radius * 5, 0, Math.PI * 2);
        ctx.fill();
      });

      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="ember-canvas" />;
}
