import React, { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n/index.js';
import { objectApi } from '../../map/objectApi.js';
import { getModelAnimationNames, invalidateObjectLibrary } from '../../map/mapAssets.js';
import { MapTabs } from './MapTabs.jsx';
import '../../styles/ObjectLibrary.css';

const NEW_GROUP = 'new';
const TOWER_DEFAULT_SIZE = 20; // towers are auto-fitted to this size, see TOWER_MODEL_HEIGHT in shared/mapConfig.js

const isGlbFile = (file) => /\.glb$/i.test(file.name);
const nameFromFile = (file) => file.name.replace(/\.glb$/i, '').replace(/[_-]+/g, ' ').trim();

function Logo({ url, size = 40 }) {
  const t = useT();
  return url ? (
    <img className="ol-logo" src={url} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="ol-logo ol-logo-empty" style={{ width: size, height: size }} title={t('objects.noLogo')}>
      ?
    </span>
  );
}

// Name, logo and "tower" flag of a main object (creates it when `group` is null).
function GroupForm({ group, onSaved, onError }) {
  const t = useT();
  const [name, setName] = useState(group?.name || '');
  const [tower, setTower] = useState(Boolean(group?.tower));
  const [logoFile, setLogoFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!logoFile) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(logoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const chooseLogo = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return onError(t('objects.imageOnly'));
    setLogoFile(file);
  };

  const save = async () => {
    if (!name.trim()) return onError(t('objects.needName'));
    setBusy(true);
    try {
      let saved = group
        ? await objectApi.update(group.id, { name, tower })
        : await objectApi.create({ name, tower });
      if (logoFile) saved = await objectApi.uploadLogo(saved.id, logoFile);
      setLogoFile(null);
      onSaved(saved);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ol-form">
      <Logo url={preview || group?.logoUrl} size={72} />
      <div className="ol-form-fields">
        <label className="field-label" htmlFor="ol-name">{t('objects.name')}</label>
        <input
          id="ol-name"
          className="fantasy-input"
          type="text"
          maxLength={40}
          placeholder={t('objects.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="ol-form-row">
          <label className="mini-btn ol-file-btn">
            {t('objects.chooseLogo')}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={chooseLogo} />
          </label>
          {logoFile && <span className="ol-file-name">{logoFile.name}</span>}
        </div>
        <label className="ol-check">
          <input type="checkbox" checked={tower} onChange={(e) => setTower(e.target.checked)} />
          <span>{t('objects.tower')}</span>
        </label>
        {tower && <p className="ol-note">{t('objects.towerHint')}</p>}
        <div className="ol-form-row">
          <button className="mini-btn ol-primary" disabled={busy} onClick={save}>
            {group ? t('objects.save') : t('objects.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange, step = 1 }) {
  return (
    <label className="ol-field">
      <span>{label}</span>
      <input className="fantasy-input" type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// One uploaded GLB: its name, fit size, offsets and default animation.
function ObjectRow({ group, object, onGroupChange, onError }) {
  const t = useT();
  const [name, setName] = useState(object.name);
  const [size, setSize] = useState(String(object.size));
  const [yOffset, setYOffset] = useState(String(object.yOffset));
  const [rotationY, setRotationY] = useState(String(object.rotationY));
  const [animation, setAnimation] = useState(object.defaultAnimation || '');
  const [clips, setClips] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getModelAnimationNames(object.modelUrl).then((names) => {
      if (!cancelled) setClips(names);
    });
    return () => {
      cancelled = true;
    };
  }, [object.modelUrl]);

  const run = async (action) => {
    setBusy(true);
    setSaved(false);
    try {
      await action();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const updated = await objectApi.updateObject(group.id, object.id, {
        name,
        size: parseFloat(size),
        yOffset: parseFloat(yOffset),
        rotationY: parseFloat(rotationY),
        defaultAnimation: animation
      });
      invalidateObjectLibrary();
      onGroupChange(updated);
      setSaved(true);
    });

  const replaceModel = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isGlbFile(file)) return onError(t('objects.glbOnly'));
    run(async () => {
      const updated = await objectApi.uploadModel(group.id, object.id, file);
      invalidateObjectLibrary();
      onGroupChange(updated);
    });
  };

  const remove = () => {
    if (!window.confirm(t('objects.confirmDeleteObject', { name: object.name }))) return;
    run(async () => {
      const updated = await objectApi.removeObject(group.id, object.id);
      invalidateObjectLibrary();
      onGroupChange(updated);
    });
  };

  return (
    <div className="ol-object">
      <div className="ol-object-head">
        <input
          className="fantasy-input ol-object-name"
          type="text"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="map-card-actions">
          <label className="mini-btn ol-file-btn">
            {t('objects.replaceModel')}
            <input type="file" accept=".glb" hidden disabled={busy} onChange={replaceModel} />
          </label>
          <button className="mini-btn ol-primary" disabled={busy} onClick={save}>
            {saved ? `✓ ${t('objects.saved')}` : t('objects.save')}
          </button>
          <button className="mini-btn danger" disabled={busy} onClick={remove}>{t('common.delete')}</button>
        </div>
      </div>
      <div className="ol-object-fields">
        <NumberInput label={t('objects.size')} value={size} onChange={setSize} step={1} />
        <NumberInput label={t('objects.yOffset')} value={yOffset} onChange={setYOffset} step={0.5} />
        <NumberInput label={t('objects.rotation')} value={rotationY} onChange={setRotationY} step={15} />
        <label className="ol-field">
          <span>{t('objects.animation')}</span>
          <select className="fantasy-input" value={animation} onChange={(e) => setAnimation(e.target.value)}>
            <option value="">{t('objects.noAnimation')}</option>
            {animation && !clips.includes(animation) && <option value={animation}>{animation}</option>}
            {clips.map((clip) => (
              <option key={clip} value={clip}>{clip}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// The GLB sub objects of a main object, plus the upload button that adds new ones.
function ObjectsSection({ group, onGroupChange, onError }) {
  const t = useT();
  const [uploading, setUploading] = useState(false);

  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (files.some((file) => !isGlbFile(file))) return onError(t('objects.glbOnly'));

    setUploading(true);
    let current = group;
    try {
      for (const file of files) {
        const { group: withObject, objectId } = await objectApi.addObject(current.id, {
          name: nameFromFile(file),
          ...(current.tower ? { size: TOWER_DEFAULT_SIZE } : {})
        });
        current = withObject;
        try {
          current = await objectApi.uploadModel(current.id, objectId, file);
        } catch (error) {
          current = await objectApi.removeObject(current.id, objectId); // no half-created objects without a model
          throw error;
        }
      }
    } catch (error) {
      onError(error.message);
    } finally {
      invalidateObjectLibrary();
      onGroupChange(current);
      setUploading(false);
    }
  };

  return (
    <div className="ol-objects">
      <div className="ol-objects-head">
        <h3 className="ol-subtitle">{t('objects.subObjects')}</h3>
        <label className={`mini-btn ol-primary ol-file-btn ${uploading ? 'disabled' : ''}`}>
          {uploading ? t('objects.uploading') : `⬆ ${t('objects.upload')}`}
          <input type="file" accept=".glb" multiple hidden disabled={uploading} onChange={upload} />
        </label>
      </div>
      {group.objects.length === 0 && <p className="hint">{t('objects.noSubObjects')}</p>}
      {group.objects.map((object) => (
        <ObjectRow
          key={object.id}
          group={group}
          object={object}
          onGroupChange={onGroupChange}
          onError={onError}
        />
      ))}
    </div>
  );
}

export function ObjectLibraryView({ onBack, onNavigate }) {
  const t = useT();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await objectApi.list());
      setError('');
    } catch {
      setError(t('maps.loadError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selected = groups.find((g) => g.id === selectedId) || null;

  const applyGroup = (group) => {
    setGroups((list) =>
      list.some((g) => g.id === group.id) ? list.map((g) => (g.id === group.id ? group : g)) : [...list, group]
    );
    setError('');
  };

  const removeGroup = async (group) => {
    if (!window.confirm(t('objects.confirmDeleteGroup', { name: group.name }))) return;
    try {
      await objectApi.remove(group.id);
      invalidateObjectLibrary();
      setGroups((list) => list.filter((g) => g.id !== group.id));
      setSelectedId(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveGroup = (group) => {
    invalidateObjectLibrary();
    applyGroup(group);
    setSelectedId(group.id);
  };

  return (
    <div className="menu-panel wide">
      <h2 className="panel-title">{t('maps.title')}</h2>
      <MapTabs active="map-objects" onNavigate={onNavigate} />
      {error && <p className="hint error">{error}</p>}

      <div className="ol-layout">
        <div className="ol-groups">
          <button
            className={`fantasy-btn ol-new ${selectedId === NEW_GROUP ? 'primary' : ''}`}
            onClick={() => setSelectedId(NEW_GROUP)}
          >
            {t('objects.newGroup')}
          </button>
          {loading && <p className="hint">{t('common.loading')}</p>}
          {!loading && !error && groups.length === 0 && <p className="hint">{t('objects.empty')}</p>}
          {groups.map((group) => (
            <div
              key={group.id}
              className={`map-card row ol-group ${selectedId === group.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(group.id)}
            >
              <Logo url={group.logoUrl} />
              <div className="map-card-info">
                <span className="map-card-name">{group.name}</span>
                <span className="map-card-meta">
                  {t('objects.count', { count: group.objects.length })}
                  {group.tower ? ' • 🗼' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="ol-detail">
          {!selected && selectedId !== NEW_GROUP && <p className="hint">{t('objects.select')}</p>}

          {selectedId === NEW_GROUP && (
            <>
              <GroupForm key="new" onSaved={saveGroup} onError={setError} />
              <p className="hint">{t('objects.saveFirst')}</p>
            </>
          )}

          {selected && (
            <>
              <GroupForm key={selected.id} group={selected} onSaved={saveGroup} onError={setError} />
              <div className="ol-form-row ol-delete-row">
                <button className="mini-btn danger" onClick={() => removeGroup(selected)}>{t('common.delete')}</button>
              </div>
              <ObjectsSection group={selected} onGroupChange={applyGroup} onError={setError} />
            </>
          )}
        </div>
      </div>

      <div className="menu-buttons">
        <button className="fantasy-btn ghost" onClick={onBack}>{t('common.back')}</button>
      </div>
    </div>
  );
}
