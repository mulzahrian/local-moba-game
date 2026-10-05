import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapEditorScene, DEFAULT_MAP_SIZE } from '../../map/MapEditorScene.js';
import { SKY_OPTIONS, WEATHER_OPTIONS, DEFAULT_SKY, DEFAULT_WEATHER } from '../../map/environment.js';
import {
  getAnimationNames,
  getCategories,
  getObjectDefinition,
  getObjectDefinitions,
  localizedName
} from '../../map/mapAssets.js';
import { mapApi } from '../../map/mapApi.js';
import { GameScene } from '../../scenes/GameScene.js';
import { CategoryIcon, CameraIcon } from './FantasyIcons.jsx';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';
import '../../styles/MapEditor.css';

const SNAP_OPTIONS = [0, 2, 5, 10];
const SIZE_OPTIONS = [200, 300, 400, 500, 700, 1000];

const round2 = (v) => Math.round(v * 100) / 100;

function NumberField({ label, value, onChange, step = 1, min, max }) {
  return (
    <label className="ed-field">
      <span>{label}</span>
      <input
        type="number"
        value={round2(value)}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
      />
    </label>
  );
}

function SliderField({ label, value, onChange, min, max, step }) {
  return (
    <div className="ed-field">
      <span>{label}</span>
      <div className="ed-slider-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Math.min(Math.max(value, min), max)}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <input
          type="number"
          value={round2(value)}
          step={step}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (!Number.isNaN(parsed)) onChange(parsed);
          }}
        />
      </div>
    </div>
  );
}

export function MapEditor({ mapId, onExit }) {
  const t = useT();
  const language = useSettingsStore((s) => s.language);

  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const loadingRef = useRef(false);

  const [savedId, setSavedId] = useState(mapId);
  const [name, setName] = useState('');
  const [size, setSize] = useState(DEFAULT_MAP_SIZE);
  const [sky, setSky] = useState(DEFAULT_SKY);
  const [weather, setWeather] = useState(DEFAULT_WEATHER);
  const [objects, setObjects] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [placingType, setPlacingType] = useState(null);
  const [placeSettings, setPlaceSettings] = useState(null);
  const [snap, setSnap] = useState(5);
  const [category, setCategory] = useState(getCategories()[0]?.id);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'ok' | 'error', text }
  const [animationNames, setAnimationNames] = useState([]);
  const [previewMap, setPreviewMap] = useState(null);
  const previewRef = useRef(null);

  const categories = getCategories();
  const definitions = useMemo(() => getObjectDefinitions(), []);
  const visibleDefinitions = definitions.filter((d) => d.category === category);
  const selected = objects.find((o) => o.uid === selectedUid) || null;
  const activeType = selected?.type || placingType;

  useEffect(() => {
    const scene = new MapEditorScene(containerRef.current, {
      onChange: (list) => {
        setObjects(list);
        if (!loadingRef.current) setDirty(true);
      },
      onSelect: setSelectedUid,
      onPlacingChange: (settings) => {
        setPlaceSettings(settings);
        if (!settings) setPlacingType(null);
      }
    });
    scene.setSnap(5);
    sceneRef.current = scene;

    if (mapId) {
      loadingRef.current = true;
      mapApi
        .get(mapId)
        .then((map) => {
          setName(map.name);
          setSize(map.size);
          setSky(map.sky || DEFAULT_SKY);
          setWeather(map.weather || DEFAULT_WEATHER);
          scene.loadMap(map);
        })
        .catch((e) => setStatus({ type: 'error', text: e.message }))
        .finally(() => {
          loadingRef.current = false;
          setDirty(false);
        });
    }

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAnimationNames(getObjectDefinition(activeType)).then((names) => {
      if (!cancelled) setAnimationNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [activeType]);

  const scene = () => sceneRef.current;

  const pickObject = (def) => {
    if (placingType === def.id) {
      scene().setPlacingType(null);
      return;
    }
    setPlacingType(def.id);
    scene().setPlacingType(def.id, { animation: def.defaultAnimation || null });
  };

  const changeSnap = (value) => {
    setSnap(value);
    scene().setSnap(value);
  };

  const changeSize = (newSize) => {
    setSize(newSize);
    scene().setGroundSize(newSize);
    setDirty(true);
  };

  const changeEnvironment = (newSky, newWeather) => {
    setSky(newSky);
    setWeather(newWeather);
    scene().setEnvironment(newSky, newWeather);
    setDirty(true);
  };

  const save = async () => {
    const payload = {
      name: name.trim() || t('editor.untitled'),
      size,
      sky,
      weather,
      objects: scene().getObjects()
    };
    try {
      const map = savedId ? await mapApi.update(savedId, payload) : await mapApi.create(payload);
      setSavedId(map.id);
      setName(map.name);
      setDirty(false);
      setStatus({ type: 'ok', text: t('editor.saved') });
    } catch (e) {
      setStatus({ type: 'error', text: t('editor.saveError', { message: e.message }) });
    }
  };

  const exit = () => {
    if (dirty && !window.confirm(t('editor.confirmLeave'))) return;
    onExit();
  };

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(timer);
  }, [status]);

  const animationSelect = (value, onChange) => (
    <label className="ed-field">
      <span>{t('editor.animation')}</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{t('editor.noAnimation')}</option>
        {animationNames.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );

  const updateSelected = (patch) => scene().updateSelected(patch);

  const startPreview = () => {
    scene().select(null);
    scene().setPlacingType(null);
    scene().setPaused(true);
    setPreviewMap({ size, sky, weather, objects: scene().getObjects() });
  };

  const stopPreview = () => {
    setPreviewMap(null);
    scene()?.setPaused(false);
  };

  useEffect(() => {
    if (!previewMap || !previewRef.current) return undefined;
    const game = new GameScene(previewRef.current);
    game.loadMap(previewMap);
    const spawn = previewMap.size * 0.4;
    game.addPlayer(
      'preview',
      { id: 'preview', name: t('editor.previewPlayer'), team: 'team1', position: { x: -spawn, z: -spawn } },
      true
    );
    const onKey = (e) => {
      if (e.code === 'Escape') stopPreview();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      game.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMap]);

  return (
    <div className="editor-root">
      <header className="editor-topbar">
        <button className="ed-btn" onClick={exit}>← {t('common.back')}</button>
        <input
          className="ed-name"
          type="text"
          placeholder={t('editor.mapName')}
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
        {dirty && <span className="ed-dirty">● {t('editor.unsaved')}</span>}
        {status && <span className={`ed-status ${status.type}`}>{status.text}</span>}
        <div className="ed-spacer" />
        <button className="ed-btn" onClick={startPreview}>▶ {t('editor.preview')}</button>
        <button className="ed-btn primary" onClick={save}>💾 {t('editor.save')}</button>
      </header>

      <div className="editor-body">
        <aside className="editor-panel left">
          <h3>{t('editor.objects')}</h3>
          <div className="ed-tabs">
            <button
              className={`ed-tab ${!placingType ? 'active' : ''}`}
              title={t('editor.selectTool')}
              onClick={() => scene().setPlacingType(null)}
            >
              <CameraIcon name="cursor" />
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={`ed-tab ${category === c.id ? 'active' : ''}`}
                title={c.name[language] || c.name.en}
                onClick={() => setCategory(c.id)}
              >
                <CategoryIcon id={c.id} />
              </button>
            ))}
          </div>
          <div className="ed-tab-title">
            {categories.find((c) => c.id === category)?.name[language]}
          </div>

          <div className="ed-palette">
            {visibleDefinitions.length === 0 && <p className="ed-hint">{t('editor.noObjects')}</p>}
            {visibleDefinitions.map((def) => (
              <button
                key={def.id}
                className={`ed-item ${placingType === def.id ? 'active' : ''}`}
                onClick={() => pickObject(def)}
              >
                {localizedName(def, language)}
              </button>
            ))}
          </div>

          <h3>{t('editor.ground')}</h3>
          <label className="ed-field">
            <span>{t('editor.mapSize')}</span>
            <select value={size} onChange={(e) => changeSize(Number(e.target.value))}>
              {SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s} × {s}</option>
              ))}
            </select>
          </label>
          <label className="ed-field">
            <span>{t('editor.sky')}</span>
            <select value={sky} onChange={(e) => changeEnvironment(e.target.value, weather)}>
              {SKY_OPTIONS.map((s) => (
                <option key={s} value={s}>{t('editor.sky.' + s)}</option>
              ))}
            </select>
          </label>
          <label className="ed-field">
            <span>{t('editor.weather')}</span>
            <select value={weather} onChange={(e) => changeEnvironment(sky, e.target.value)}>
              {WEATHER_OPTIONS.map((w) => (
                <option key={w} value={w}>{t('editor.weather.' + w)}</option>
              ))}
            </select>
          </label>
          <label className="ed-field">
            <span>{t('editor.snap')}</span>
            <select value={snap} onChange={(e) => changeSnap(Number(e.target.value))}>
              {SNAP_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === 0 ? t('editor.snapOff') : s}</option>
              ))}
            </select>
          </label>
        </aside>

        <div className="editor-viewport-wrap">
          <div className="editor-viewport" ref={containerRef} />
          <div className="ed-camera-bar">
            <button className="ed-cam-btn" title={t('editor.camRotateLeft')} onClick={() => scene().rotateCamera(-45)}><CameraIcon name="rotateLeft" /></button>
            <button className="ed-cam-btn" title={t('editor.camRotateRight')} onClick={() => scene().rotateCamera(45)}><CameraIcon name="rotateRight" /></button>
            <button className="ed-cam-btn" title={t('editor.camTiltUp')} onClick={() => scene().tiltCamera(15)}><CameraIcon name="tiltUp" /></button>
            <button className="ed-cam-btn" title={t('editor.camTiltDown')} onClick={() => scene().tiltCamera(-15)}><CameraIcon name="tiltDown" /></button>
            <button className="ed-cam-btn" title={t('editor.camTop')} onClick={() => scene().setCameraView('top')}><CameraIcon name="top" /></button>
            <button className="ed-cam-btn" title={t('editor.camReset')} onClick={() => scene().setCameraView('reset')}><CameraIcon name="reset" /></button>
          </div>
        </div>

        <aside className="editor-panel right">
          {selected && (
            <>
              <h3>{t('editor.selected')}</h3>
              <div className="ed-object-name">
                {localizedName(getObjectDefinition(selected.type), language) || selected.type}
              </div>
              <NumberField label={t('editor.positionX')} value={selected.position.x}
                onChange={(v) => updateSelected({ position: { x: v } })} />
              <NumberField label={t('editor.positionZ')} value={selected.position.z}
                onChange={(v) => updateSelected({ position: { z: v } })} />
              <NumberField label={t('editor.positionY')} value={selected.position.y}
                onChange={(v) => updateSelected({ position: { y: v } })} />
              <SliderField label={`${t('editor.rotation')} (°)`} value={selected.rotationY}
                min={0} max={360} step={5} onChange={(v) => updateSelected({ rotationY: v })} />
              <SliderField label={t('editor.scale')} value={selected.scale}
                min={0.1} max={10} step={0.05}
                onChange={(v) => updateSelected({ scale: Math.max(v, 0.01) })} />
              {animationNames.length > 0 &&
                animationSelect(selected.animation, (v) => updateSelected({ animation: v }))}
              <div className="ed-actions">
                <button className="ed-btn" onClick={() => scene().duplicateSelected()}>{t('editor.duplicate')}</button>
                <button className="ed-btn danger" onClick={() => scene().deleteSelected()}>
                  🗑 {t('editor.deleteObject')}
                </button>
              </div>
            </>
          )}

          {!selected && placeSettings && (
            <>
              <h3>{t('editor.placeSettings')}</h3>
              <div className="ed-object-name">
                {t('editor.placing')}: {localizedName(getObjectDefinition(placingType), language)}
              </div>
              <SliderField label={`${t('editor.rotation')} (°)`} value={placeSettings.rotationY}
                min={0} max={360} step={5} onChange={(v) => scene().updatePlaceSettings({ rotationY: v })} />
              <SliderField label={t('editor.scale')} value={placeSettings.scale}
                min={0.1} max={10} step={0.05}
                onChange={(v) => scene().updatePlaceSettings({ scale: Math.max(v, 0.01) })} />
              {animationNames.length > 0 &&
                animationSelect(placeSettings.animation, (v) => scene().updatePlaceSettings({ animation: v }))}
              <div className="ed-actions">
                <button className="ed-btn" onClick={() => scene().setPlacingType(null)}>
                  {t('editor.stopPlacing')}
                </button>
              </div>
            </>
          )}

          {!selected && !placeSettings && <p className="ed-hint">{t('editor.nothingSelected')}</p>}

          <div className="ed-count">{t('editor.count', { count: objects.length })}</div>
        </aside>
      </div>

      <footer className="editor-help">{t('editor.help')}</footer>

      {previewMap && (
        <div className="editor-preview">
          <div className="editor-preview-bar">
            <button className="ed-btn" onClick={stopPreview}>← {t('editor.exitPreview')}</button>
            <span className="editor-preview-hint">{t('editor.previewHelp')}</span>
          </div>
          <div className="editor-preview-stage" ref={previewRef} />
        </div>
      )}
    </div>
  );
}
