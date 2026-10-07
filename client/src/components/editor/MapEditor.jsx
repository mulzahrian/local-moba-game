import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapEditorScene, DEFAULT_MAP_SIZE, GIZMO_MODES } from '../../map/MapEditorScene.js';
import { SKY_OPTIONS, WEATHER_OPTIONS, DEFAULT_SKY, DEFAULT_WEATHER } from '../../map/environment.js';
import {
  getAnimationNames,
  getCategories,
  getObjectDefinition,
  getObjectDefinitions,
  localizedName,
  refreshObjectLibrary
} from '../../map/mapAssets.js';
import { mapApi } from '../../map/mapApi.js';
import {
  REQUIRED_TOWERS,
  TOWERS_PER_TEAM,
  TOWER_HEALTH,
  TOWER_KINDS,
  TOWER_TEAMS,
  countTowers,
  validateTowers,
  MAP_MUSIC_OPTIONS,
  MUSIC_NONE,
  sanitizeMusic
} from '../../../../shared/mapConfig.js';
import { AGGRO_RANGE, clampAggroRange } from '../../../../shared/monsterConfig.js';
import { PATH_ANIM_SPEED, PATH_SPEED, PATH_SCALE, guessWalkAnimation } from '../../../../shared/pathConfig.js';
import { GameScene } from '../../scenes/GameScene.js';
import { CategoryIcon, CameraIcon } from './FantasyIcons.jsx';
import { CharacterPicker } from '../character/CharacterPicker.jsx';
import { SkillBar } from '../SkillBar.jsx';
import { useT } from '../../i18n/index.js';
import { useSettingsStore } from '../../store/settingsStore.js';
import { audioService } from '../../services/audioService.js';
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

const AXES = ['x', 'y', 'z'];

// Three number boxes (X / Y / Z) in one row, like a vector field in a 3D tool.
function Vec3Field({ label, value, onChange, step = 1 }) {
  return (
    <div className="ed-field">
      <span>{label}</span>
      <div className="ed-vec">
        {AXES.map((axis) => (
          <label key={axis} className={`ed-vec-axis axis-${axis}`}>
            <b>{axis.toUpperCase()}</b>
            <input
              type="number"
              value={round2(value[axis])}
              step={step}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                if (!Number.isNaN(parsed)) onChange(axis, parsed);
              }}
            />
          </label>
        ))}
      </div>
    </div>
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
  const [music, setMusic] = useState(MUSIC_NONE);
  const auditioningRef = useRef(false); // true once the user picked a track, so it plays while editing
  const [objects, setObjects] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [placingType, setPlacingType] = useState(null);
  const [placeSettings, setPlaceSettings] = useState(null);
  const [snap, setSnap] = useState(5);
  const [category, setCategory] = useState(null);
  const [libraryVersion, setLibraryVersion] = useState(0); // bumped once the uploaded objects are loaded
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'ok' | 'error', text }
  const [animationNames, setAnimationNames] = useState([]);
  const [paths, setPaths] = useState([]);
  const [selectedPathId, setSelectedPathId] = useState(null);
  const [drawingPath, setDrawingPath] = useState(false);
  const [pathAnimationNames, setPathAnimationNames] = useState([]);
  const [gizmoMode, setGizmoMode] = useState('translate');
  const [gizmoSpace, setGizmoSpace] = useState('world');
  const [previewMap, setPreviewMap] = useState(null);
  const previewRef = useRef(null);
  const previewGameRef = useRef(null);
  const [pickingCharacter, setPickingCharacter] = useState(false);
  const characterId = useSettingsStore((s) => s.characterId);
  const setCharacterId = useSettingsStore((s) => s.setCharacterId);

  const categories = getCategories();
  const definitions = useMemo(() => getObjectDefinitions(), [libraryVersion]);
  const activeCategory = categories.some((c) => c.id === category) ? category : categories[0]?.id;
  const visibleDefinitions = definitions.filter((d) => d.category === activeCategory);
  const selected = objects.find((o) => o.uid === selectedUid) || null;
  const selectedPath = paths.find((p) => p.id === selectedPathId) || null;
  const walkerDefinitions = definitions.filter((d) => !d.tower);
  const towerCount = countTowers(objects);
  const activeType = selected?.type || placingType;

  useEffect(() => {
    // Started before the scene exists so objects placed by loadMap() wait for the same request.
    let active = true;
    refreshObjectLibrary().then(() => {
      if (active) setLibraryVersion((v) => v + 1);
    });

    const scene = new MapEditorScene(containerRef.current, {
      onChange: (list) => {
        setObjects(list);
        if (!loadingRef.current) setDirty(true);
      },
      onSelect: setSelectedUid,
      onPathsChange: (list) => {
        setPaths(list);
        if (!loadingRef.current) setDirty(true);
      },
      onPathSelect: setSelectedPathId,
      onDrawingChange: setDrawingPath,
      onGizmoModeChange: setGizmoMode,
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
          setMusic(sanitizeMusic(map.music));
          scene.loadMap(map);
        })
        .catch((e) => setStatus({ type: 'error', text: e.message }))
        .finally(() => {
          loadingRef.current = false;
          setDirty(false);
        });
    }

    return () => {
      active = false;
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

  useEffect(() => {
    let cancelled = false;
    getAnimationNames(getObjectDefinition(selectedPath?.type)).then((names) => {
      if (!cancelled) setPathAnimationNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPath?.type]);

  // New paths start with the NPC model that was used last (or the first one) and its walk animation.
  const startPath = async () => {
    const type = paths[paths.length - 1]?.type || walkerDefinitions[0]?.id || '';
    const names = await getAnimationNames(getObjectDefinition(type));
    scene()?.startPath({
      type,
      animation: guessWalkAnimation(names),
      name: t('editor.pathDefaultName', { n: paths.length + 1 })
    });
  };

  const changePathWalker = async (type) => {
    const names = await getAnimationNames(getObjectDefinition(type));
    scene()?.updateSelectedPath({ type, animation: guessWalkAnimation(names) });
  };

  const updatePath = (patch) => scene().updateSelectedPath(patch);

  const changeGizmoMode = (mode) => scene().setGizmoMode(mode);

  const changeGizmoSpace = () => {
    const next = gizmoSpace === 'world' ? 'local' : 'world';
    setGizmoSpace(next);
    scene().setGizmoSpace(next);
  };
  const pickObject = (def) => {
    if (placingType === def.id) {
      scene().setPlacingType(null);
      return;
    }
    setPlacingType(def.id);
    scene().setPlacingType(def.id, {
      animation: def.defaultAnimation || null,
      ...(def.monster ? { aggroRange: AGGRO_RANGE.value } : {})
    });
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

  const changeMusic = (value) => {
    auditioningRef.current = true;
    setMusic(value);
    setDirty(true);
  };

  // Plays the chosen track while previewing or after the user picked one; otherwise the menu music keeps playing.
  useEffect(() => {
    if (previewMap) audioService.setMatchMusic(music);
    else if (auditioningRef.current && music !== MUSIC_NONE) audioService.setMatchMusic(music);
    else audioService.setTrack('menu');
  }, [music, previewMap]);

  useEffect(() => () => audioService.setTrack('menu'), []);

  const save = async () => {
    const objectsToSave = scene().getObjects();
    const towerProblem = validateTowers(objectsToSave);
    if (towerProblem) {
      setStatus({
        type: 'error',
        text: t(`editor.towerError.${towerProblem}`, { required: REQUIRED_TOWERS, perTeam: TOWERS_PER_TEAM, count: countTowers(objectsToSave) })
      });
      return;
    }
    const payload = {
      name: name.trim() || t('editor.untitled'),
      size,
      sky,
      weather,
      music,
      objects: objectsToSave,
      paths: scene().getPaths()
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

  // The preview asks for a character first, then runs the map with it.
  const startPreview = () => {
    scene().select(null);
    scene().setPlacingType(null);
    setPickingCharacter(true);
  };

  const beginPreview = () => {
    setPickingCharacter(false);
    scene().setPaused(true);
    setPreviewMap({ size, sky, weather, music, objects: scene().getObjects(), paths: scene().getPaths(), characterId });
  };

  const getPreviewScene = useCallback(() => previewGameRef.current, []);

  const stopPreview = () => {
    setPreviewMap(null);
    scene()?.setPaused(false);
  };

  useEffect(() => {
    if (!previewMap || !previewRef.current) return undefined;
    const game = new GameScene(previewRef.current);
    previewGameRef.current = game;
    game.loadMap(previewMap);
    const spawn = previewMap.size * 0.4;
    game.addPlayer(
      'preview',
      {
        id: 'preview',
        name: t('editor.previewPlayer'),
        team: 'team1',
        characterId: previewMap.characterId,
        position: { x: -spawn, z: -spawn }
      },
      true
    );
    const onKey = (e) => {
      if (e.code === 'Escape') stopPreview();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previewGameRef.current = null;
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
                className={`ed-tab ${activeCategory === c.id ? 'active' : ''}`}
                title={c.name[language] || c.name.en}
                onClick={() => setCategory(c.id)}
              >
                <CategoryIcon id={c.id} logoUrl={c.logoUrl} />
              </button>
            ))}
          </div>
          <div className="ed-tab-title">
            {categories.find((c) => c.id === activeCategory)?.name[language]}
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

          <h3>{t('editor.paths')}</h3>
          <button className={`ed-btn ${drawingPath ? 'primary' : ''}`} onClick={startPath}>
            {t('editor.pathNew')}
          </button>
          <div className="ed-palette">
            {paths.length === 0 && !drawingPath && <p className="ed-hint">{t('editor.pathNone')}</p>}
            {paths.map((path, index) => (
              <button
                key={path.id}
                className={`ed-item ${selectedPathId === path.id ? 'active' : ''}`}
                onClick={() => scene().selectPath(path.id)}
              >
                {path.name || t('editor.pathDefaultName', { n: index + 1 })}
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
            <span>{t('editor.music')}</span>
            <select value={music} onChange={(e) => changeMusic(e.target.value)}>
              {MAP_MUSIC_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m === MUSIC_NONE ? t('editor.music.none') : t('editor.music.track', { n: m.replace('list', '') })}
                </option>
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
          {selected && (
            <div className="ed-gizmo-bar">
              {GIZMO_MODES.map((mode) => (
                <button
                  key={mode}
                  className={`ed-btn ${gizmoMode === mode ? 'primary' : ''}`}
                  onClick={() => changeGizmoMode(mode)}
                >
                  {t(`editor.gizmo.${mode}`)}
                </button>
              ))}
              <button className="ed-btn" title={t('editor.gizmo.space')} onClick={changeGizmoSpace}>
                {t(`editor.gizmo.${gizmoSpace}`)}
              </button>
            </div>
          )}
          {drawingPath && <div className="ed-draw-hint">{t('editor.pathDrawingHint')}</div>}
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
              <Vec3Field label={t('editor.location')} value={selected.position}
                onChange={(axis, v) => updateSelected({ position: { [axis]: v } })} />
              <Vec3Field label={t('editor.rotation3')} step={5}
                value={{ x: selected.rotationX || 0, y: selected.rotationY || 0, z: selected.rotationZ || 0 }}
                onChange={(axis, v) => updateSelected({ [`rotation${axis.toUpperCase()}`]: v })} />
              <Vec3Field label={t('editor.scale3')} step={0.1}
                value={{
                  x: selected.scale * (selected.scaleX || 1),
                  y: selected.scale * (selected.scaleY || 1),
                  z: selected.scale * (selected.scaleZ || 1)
                }}
                onChange={(axis, v) =>
                  updateSelected({ [`scale${axis.toUpperCase()}`]: Math.max(v, 0.01) / (selected.scale || 1) })} />
              <SliderField label={t('editor.scaleUniform')} value={selected.scale}
                min={0.1} max={10} step={0.05}
                onChange={(v) => updateSelected({ scale: Math.max(v, 0.01) })} />
              {selected.tower && (() => {
                const kind = selected.main ? TOWER_KINDS.main : TOWER_KINDS.side;
                return (
                  <>
                    <label className="ed-field">
                      <span>{t('editor.towerTeam')}</span>
                      <select value={selected.team || 'team1'} onChange={(e) => updateSelected({ team: e.target.value })}>
                        {TOWER_TEAMS.map((team) => (
                          <option key={team} value={team}>{t(`team.${team}`)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="ed-field">
                      <span>{t('editor.towerKind')}</span>
                      <select value={selected.main ? 'main' : 'side'} onChange={(e) => updateSelected({ main: e.target.value === 'main' })}>
                        <option value="main">{t('editor.towerMain')}</option>
                        <option value="side">{t('editor.towerSide')}</option>
                      </select>
                    </label>
                    <SliderField label={t('editor.towerHealth')} value={selected.towerHealth ?? kind.health}
                      min={TOWER_HEALTH.min} max={2000} step={TOWER_HEALTH.step}
                      onChange={(v) => updateSelected({ towerHealth: Math.max(1, Math.round(v)) })} />
                    <p className="ed-hint">{t('editor.towerHint', { damage: kind.damage, range: kind.range })}</p>
                  </>
                );
              })()}
              {!selected.monster && (
                <label className="ed-check">
                  <input type="checkbox" checked={!selected.noCollision}
                    onChange={(e) => updateSelected({ noCollision: !e.target.checked })} />
                  <span>{t('editor.solid')}</span>
                </label>
              )}
              {selected.monster && (
                <>
                  <SliderField label={t('editor.aggroRange')} value={selected.aggroRange ?? AGGRO_RANGE.value}
                    min={AGGRO_RANGE.min} max={AGGRO_RANGE.max} step={AGGRO_RANGE.step}
                    onChange={(v) => updateSelected({ aggroRange: clampAggroRange(v) })} />
                  <p className="ed-hint">{t('editor.aggroHint')}</p>
                </>
              )}
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

          {selectedPath && (
            <>
              <h3>{t('editor.pathSelected')}</h3>
              <label className="ed-field">
                <span>{t('editor.pathName')}</span>
                <input type="text" value={selectedPath.name} maxLength={60}
                  onChange={(e) => updatePath({ name: e.target.value })} />
              </label>
              <label className="ed-field">
                <span>{t('editor.pathWalker')}</span>
                <select value={selectedPath.type} onChange={(e) => changePathWalker(e.target.value)}>
                  {!selectedPath.type && <option value="">—</option>}
                  {categories.map((c) => {
                    const items = walkerDefinitions.filter((d) => d.category === c.id);
                    return items.length === 0 ? null : (
                      <optgroup key={c.id} label={c.name[language] || c.name.en}>
                        {items.map((d) => (
                          <option key={d.id} value={d.id}>{localizedName(d, language)}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
              {pathAnimationNames.length > 0 && (
                <label className="ed-field">
                  <span>{t('editor.animation')}</span>
                  <select value={selectedPath.animation || ''}
                    onChange={(e) => updatePath({ animation: e.target.value || null })}>
                    <option value="">{t('editor.noAnimation')}</option>
                    {pathAnimationNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
              )}
              <SliderField label={t('editor.pathSpeed')} value={selectedPath.speed}
                min={PATH_SPEED.min} max={PATH_SPEED.max} step={PATH_SPEED.step}
                onChange={(v) => updatePath({ speed: Math.min(Math.max(v, PATH_SPEED.min), PATH_SPEED.max) })} />
              <SliderField label={t('editor.pathAnimSpeed')} value={selectedPath.animSpeed}
                min={PATH_ANIM_SPEED.min} max={PATH_ANIM_SPEED.max} step={PATH_ANIM_SPEED.step}
                onChange={(v) => updatePath({ animSpeed: Math.min(Math.max(v, PATH_ANIM_SPEED.min), PATH_ANIM_SPEED.max) })} />
              <SliderField label={t('editor.scale')} value={selectedPath.scale}
                min={PATH_SCALE.min} max={PATH_SCALE.max} step={PATH_SCALE.step}
                onChange={(v) => updatePath({ scale: Math.min(Math.max(v, PATH_SCALE.min), PATH_SCALE.max) })} />
              <label className="ed-check">
                <input type="checkbox" checked={selectedPath.loop} onChange={(e) => updatePath({ loop: e.target.checked })} />
                <span>{t('editor.pathLoop')}</span>
              </label>
              <p className="ed-hint">{t('editor.pathPoints', { count: selectedPath.points.length })}</p>
              {selectedPath.points.length < 2 && <p className="ed-hint">{t('editor.pathTooShort')}</p>}
              <p className="ed-hint">{t('editor.pathHint')}</p>
              <div className="ed-actions">
                {drawingPath ? (
                  <button className="ed-btn primary" onClick={() => scene().finishDrawing()}>
                    {t('editor.pathFinish')}
                  </button>
                ) : (
                  <button className="ed-btn" onClick={() => scene().resumeDrawing()}>{t('editor.pathAddPoints')}</button>
                )}
                <button className="ed-btn danger" onClick={() => scene().deleteSelectedPath()}>
                  🗑 {t('editor.pathDelete')}
                </button>
              </div>
            </>
          )}

          {!selected && !selectedPath && placeSettings && (
            <>
              <h3>{t('editor.placeSettings')}</h3>
              <div className="ed-object-name">
                {t('editor.placing')}: {localizedName(getObjectDefinition(placingType), language)}
              </div>
              <SliderField label={`${t('editor.rotation')} X (°)`} value={placeSettings.rotationX || 0}
                min={-180} max={180} step={5} onChange={(v) => scene().updatePlaceSettings({ rotationX: v })} />
              <SliderField label={`${t('editor.rotation')} Y (°)`} value={placeSettings.rotationY}
                min={0} max={360} step={5} onChange={(v) => scene().updatePlaceSettings({ rotationY: v })} />
              <SliderField label={`${t('editor.rotation')} Z (°)`} value={placeSettings.rotationZ || 0}
                min={-180} max={180} step={5} onChange={(v) => scene().updatePlaceSettings({ rotationZ: v })} />
              <SliderField label={t('editor.scale')} value={placeSettings.scale}
                min={0.1} max={10} step={0.05}
                onChange={(v) => scene().updatePlaceSettings({ scale: Math.max(v, 0.01) })} />
              {placeSettings.aggroRange !== undefined && (
                <>
                  <SliderField label={t('editor.aggroRange')} value={placeSettings.aggroRange}
                    min={AGGRO_RANGE.min} max={AGGRO_RANGE.max} step={AGGRO_RANGE.step}
                    onChange={(v) => scene().updatePlaceSettings({ aggroRange: clampAggroRange(v) })} />
                  <p className="ed-hint">{t('editor.aggroHint')}</p>
                </>
              )}
              {animationNames.length > 0 &&
                animationSelect(placeSettings.animation, (v) => scene().updatePlaceSettings({ animation: v }))}
              <div className="ed-actions">
                <button className="ed-btn" onClick={() => scene().setPlacingType(null)}>
                  {t('editor.stopPlacing')}
                </button>
              </div>
            </>
          )}

          {!selected && !selectedPath && !placeSettings && <p className="ed-hint">{t('editor.nothingSelected')}</p>}

          <div className="ed-count">{t('editor.count', { count: objects.length })}</div>
          <div className={`ed-count ${validateTowers(objects) === null ? '' : 'ed-count-warn'}`}>
            {t('editor.towerCount', { count: towerCount, required: REQUIRED_TOWERS })}
          </div>
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
          <SkillBar getScene={getPreviewScene} />
        </div>
      )}

      {pickingCharacter && (
        <div className="editor-preview ce-pick-overlay">
          <div className="ce-pick-panel">
            <h2 className="ce-heading">{t('pick.title')}</h2>
            <p className="ed-hint">{t('pick.hint')}</p>
            <CharacterPicker value={characterId} onChange={setCharacterId} />
            <div className="ce-pick-actions">
              <button className="ed-btn" onClick={() => setPickingCharacter(false)}>{t('common.cancel')}</button>
              <button className="ed-btn primary" disabled={!characterId} onClick={beginPreview}>? {t('pick.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
