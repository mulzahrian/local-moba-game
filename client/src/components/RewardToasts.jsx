import React from 'react';
import { useToastStore } from '../store/toastStore.js';
import '../styles/Skills.css';

// Short rewards / notices shown over the match (money, skills won from monsters, ...).
export function RewardToasts() {
  const toasts = useToastStore((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="reward-toasts">
      {toasts.map((toast) => (
        <div className="reward-toast" key={toast.id}>{toast.text}</div>
      ))}
    </div>
  );
}
