import React, { useEffect, useState } from 'react';
import { MINION_ANIMATION_SLOTS, MINION_ATTACK_TYPES, defaultMinion } from '../../../../shared/minionConfig.js';
import { minionApi } from '../../minion/minionApi.js';
import { invalidateMinion } from '../../minion/minionAssets.js';
import { ActorSetup } from './ActorSetup.jsx';
import '../../styles/ObjectLibrary.css';

const draftOf = (minion) => ({ name: minion.name, movement: minion.movement, attackType: minion.attackType || 'sword', animations: { ...minion.animations }, params: { ...minion.params } });

export function MinionGeneratorView({ onBack }) {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(defaultMinion());
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const selected = list.find((minion) => minion.id === selectedId);

  const refresh = () => minionApi.list().then(setList).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const open = (id) => {
    const minion = list.find((item) => item.id === id);
    setSelectedId(id);
    setDraft(minion ? draftOf(minion) : defaultMinion());
    setFile(null);
    setError('');
  };
  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const updateParam = (key, value) => update({ params: { ...draft.params, [key]: value } });

  const save = async () => {
    if (!draft.name.trim()) return setError('Nama minion wajib diisi.');
    if (!file && !selected?.hasModel) return setError('GLB minion wajib dipilih.');
    try {
      let result = selected ? await minionApi.update(selected.id, draft) : await minionApi.create(draft);
      if (file) result = await minionApi.uploadModel(result.id, file);
      invalidateMinion(result.id);
      setList((items) => items.some((item) => item.id === result.id) ? items.map((item) => item.id === result.id ? result : item) : [...items, result]);
      setSelectedId(result.id);
      setDraft(draftOf(result));
      setFile(null);
      setError('Tersimpan.');
    } catch (e) { setError(e.message); }
  };

  const remove = async () => {
    if (!selected || !window.confirm(`Hapus ${selected.name}?`)) return;
    await minionApi.remove(selected.id);
    invalidateMinion(selected.id);
    setList((items) => items.filter((item) => item.id !== selected.id));
    setSelectedId(null);
  };

  return (
    <div className="menu-panel wide character-select-panel minion-generator-panel">
      <h2 className="panel-title">Minion Generator</h2>
      <p className="hint">Atur model, animasi, dan ukuran minion sebelum digunakan di dalam match.</p>
      {error && <p className="hint error">{error}</p>}
      <div className="ol-layout">
        <div className="ol-groups">
          <button className="fantasy-btn primary ol-new" onClick={() => open('new')}>+ Minion baru</button>
          {list.map((minion) => <button key={minion.id} className={`map-card row ol-group ${minion.id === selectedId ? 'selected' : ''}`} onClick={() => open(minion.id)}><div className="map-card-info"><span className="map-card-name">{minion.name}</span><span className="map-card-meta">{minion.hasModel ? 'GLB siap' : 'Belum ada GLB'}</span></div></button>)}
        </div>

        <div className="ol-detail">
          {selectedId && <>
            <label className="field-label" htmlFor="minion-name">Nama minion</label>
            <input id="minion-name" className="fantasy-input" value={draft.name} onChange={(e) => update({ name: e.target.value })} />

            <label className="field-label" htmlFor="minion-attack-type">Tipe serangan</label>
            <select id="minion-attack-type" className="fantasy-input minion-attack-select" value={draft.attackType} onChange={(e) => update({ attackType: e.target.value })}>
              {MINION_ATTACK_TYPES.map((type) => <option key={type} value={type}>{type === 'sword' ? 'Pedang' : type === 'punch' ? 'Pukulan' : type === 'shot' ? 'Tembakan' : 'Panah'}</option>)}
            </select>

            <div className="minion-scale-card">
              <div className="minion-scale-head"><label htmlFor="minion-scale">Ukuran minion</label><output htmlFor="minion-scale">{Number(draft.params.scale).toFixed(1)}x</output></div>
              <input id="minion-scale" className="minion-scale-range" type="range" min="0.3" max="5" step="0.1" value={draft.params.scale} onChange={(e) => updateParam('scale', e.target.value)} />
              <div className="minion-scale-labels"><span>Kecil</span><span>Normal</span><span>Besar</span></div>
            </div>

            <ActorSetup slots={MINION_ANIMATION_SLOTS} scaleSpec={{ min: 0.3, max: 5, step: 0.1 }} value={{ movement: draft.movement, scale: draft.params.scale, animations: draft.animations }} file={file} modelUrl={selected?.modelUrl || null} onFile={setFile} onChange={(patch) => { const { scale, ...rest } = patch; update({ ...rest, params: scale === undefined ? draft.params : { ...draft.params, scale } }); }} />
            <div className="sk-grid">{['health', 'damage', 'speed', 'attackRange', 'attackCooldown'].map((key) => <label className="ol-field" key={key}><span>{key}</span><input className="fantasy-input" type="number" value={draft.params[key]} onChange={(e) => updateParam(key, e.target.value)} /></label>)}</div>
            <div className="ol-form-row sk-actions"><button className="mini-btn ol-primary" onClick={save}>Opslaan</button>{selected && <button className="mini-btn danger" onClick={remove}>Hapus</button>}</div>
          </>}
        </div>
      </div>
      <div className="menu-buttons"><button className="fantasy-btn ghost" onClick={onBack}>Kembali</button></div>
    </div>
  );
}
