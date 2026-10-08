import React, { useState, useEffect, useRef, useId } from 'react';
import {
  PU_LANDMARKS,
  GIRLS_HOSTELS,
  BOYS_HOSTELS,
  ALL_PU_LOCATIONS
} from '../data/campusData';
import { useApp } from '../context/useApp';
import { Segmented } from './ui';
import {
  Satellite,
  Map as MapIcon,
  Building2,
  Plus,
  Minus,
  RotateCw,
  ExternalLink,
  Navigation,
  Shirt,
  Key,
  List,
  X,
  TriangleAlert
} from 'lucide-react';

const GMP_KEY_STORAGE = 'gmp_api_key';
// Below this width the hotspot panel and the location card would overlap, so use a compact layout
const COMPACT_WIDTH_PX = 800;
// Camera distance (metres) for the 3D tiles at zoom 17; each zoom level halves it
const BASE_RANGE_M = 1600;

const readStoredKey = () => {
  try {
    return localStorage.getItem(GMP_KEY_STORAGE) || '';
  } catch {
    return '';
  }
};

// The Maps JS API can only be loaded once per page, so share one loader between map instances
let maps3dLoader = null;

const loadMaps3d = (apiKey) => {
  if (!maps3dLoader) {
    maps3dLoader = new Promise((resolve, reject) => {
      window.__gmp3d_init = resolve;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=maps3d&callback=__gmp3d_init`;
      script.async = true;
      script.onerror = () => {
        maps3dLoader = null;
        script.remove();
        reject(new Error('Could not reach Google Maps. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    }).then(() => window.google.maps.importLibrary('maps3d'));
  }
  return maps3dLoader;
};

const categoryLabel = (category) => category?.replace('-', ' ');

const formatCoords = (loc) => `${loc.lat.toFixed(4)}° N, ${loc.lng.toFixed(4)}° E`;

const FILTERS = {
  all: ALL_PU_LOCATIONS,
  hostels: [...GIRLS_HOSTELS, ...BOYS_HOSTELS],
  academic: PU_LANDMARKS.filter((l) => l.category === 'academic' || l.category === 'amenity'),
  gates: PU_LANDMARKS.filter((l) => l.category === 'gate'),
};

const FILTER_LABELS = { all: 'All', hostels: 'Hostels', academic: 'Academic', gates: 'Gates' };

const TILT_OPTIONS = [
  { label: 'Plan', value: 0 },
  { label: '45°', value: 45 },
  { label: '65°', value: 65 },
];

// Segmented control worn as a floating white pill over the map: ash thumb, forest text on the active item
const ASH_THUMB = '[&>.segmented-thumb]:bg-ash [&>.segmented-thumb]:shadow-none [&_[aria-pressed=true]]:text-forest';
const FLOAT_SEGMENTED = `bg-canvas/95 shadow-[var(--shadow-float)] ${ASH_THUMB}`;
const FLOAT_PANEL = 'bg-canvas rounded-[18px] shadow-[var(--shadow-float)]';

const CONTROL_BUTTON =
  'w-9 h-9 rounded-full flex items-center justify-center text-body hover:bg-paper hover:text-ink transition-[background-color,color,transform] duration-150 active:scale-95';

// Filterable list of campus places: a side panel on wide maps, a bottom sheet on narrow ones
function PlacesPanel({ filter, onFilterChange, selectedId, onPick, onClose, id, className = '' }) {
  const locations = FILTERS[filter];

  return (
    <section id={id} aria-label="Campus places" className={`flex flex-col min-h-0 overflow-hidden ${FLOAT_PANEL} ${className}`}>
      <header className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow !text-[11px]">Pondicherry University</p>
          <h3 className="mt-0.5 text-[15px] font-semibold text-ink">Campus places</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="badge badge-neutral num">{locations.length} places</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close campus places"
              className="btn-icon !w-8 !h-8 !shadow-none bg-ash hover:bg-hairline"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div role="group" aria-label="Filter places" className="px-4 pb-3 flex gap-1.5 overflow-x-auto">
        {Object.keys(FILTERS).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => onFilterChange(key)}
            className={`btn ${filter === key ? 'btn-forest' : 'btn-quiet'} !px-3 !py-1 !text-[12px]`}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      <ul key={filter} className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-hairline p-2 space-y-0.5 animate-fade-in">
        {locations.map((loc) => {
          const isSelected = loc.id === selectedId;
          return (
            <li key={loc.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onPick(loc)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-[background-color,box-shadow] duration-150 ${
                  isSelected ? 'bg-paper shadow-[inset_0_0_0_2px_var(--color-forest)]' : 'hover:bg-paper'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: loc.color }} />
                  <span className="flex-1 min-w-0 truncate text-[14px] font-semibold text-ink">{loc.name}</span>
                  {loc.hub && <span className="badge badge-lime !h-5 !px-2 !text-[11px] shrink-0">Hub</span>}
                </span>
                <span className="block mt-0.5 pl-4 text-[13px] text-muted line-clamp-1">{loc.desc}</span>
                <span className="block mt-1 pl-4 font-mono text-[11px] text-subtle">{formatCoords(loc)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function GoogleCampus3DMap({ onLocationSelect, highlightedId = null }) {
  const { setActiveTab, setSelected3DTarget, setRideDropTarget } = useApp();

  // Map state
  const [activeMode, setActiveMode] = useState('satellite'); // 'satellite' | 'roadmap' | 'gmp3d'
  const [currentZoom, setCurrentZoom] = useState(17);
  const [tiltAngle, setTiltAngle] = useState(45);
  const [headingAngle, setHeadingAngle] = useState(38); // 0 (N), 90 (E), 180 (S), 270 (W)
  const [selectedLocation, setSelectedLocation] = useState(
    () => ALL_PU_LOCATIONS.find((loc) => loc.id === highlightedId) || PU_LANDMARKS[3] // default: Central Library
  );
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('all');
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < COMPACT_WIDTH_PX);
  // On compact maps the places list lives in a bottom sheet that the user opens on demand
  const [isPlacesOpen, setIsPlacesOpen] = useState(false);

  // Photorealistic 3D tiles (Google Maps Platform key required)
  const [apiKey, setApiKey] = useState(readStoredKey);
  const [keyDraft, setKeyDraft] = useState('');
  const [isGmp3dLoaded, setIsGmp3dLoaded] = useState(false);
  const [gmpError, setGmpError] = useState('');

  const rootRef = useRef(null);
  const gmp3dContainerRef = useRef(null);
  const map3dRef = useRef(null);
  const keyInputId = useId();
  const placesSheetId = useId();

  // Follow the highlightedId prop (e.g. hostel picked in the Laundry form) while still allowing local picks
  const [syncedHighlightId, setSyncedHighlightId] = useState(highlightedId);
  if (highlightedId !== syncedHighlightId) {
    setSyncedHighlightId(highlightedId);
    const found = ALL_PU_LOCATIONS.find((loc) => loc.id === highlightedId);
    if (found) setSelectedLocation(found);
  }

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setIsCompact(entry.contentRect.width < COMPACT_WIDTH_PX);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load the Maps 3D library only once the user actually opens the 3D tiles mode with a key
  useEffect(() => {
    if (activeMode !== 'gmp3d' || !apiKey) return;
    let cancelled = false;
    // Google calls this global when the key is invalid or not enabled for the Maps JS API
    window.gm_authFailure = () => {
      if (!cancelled) setGmpError('Google rejected this API key. Make sure the Maps JavaScript API is enabled for it.');
    };
    loadMaps3d(apiKey).then(
      () => {
        if (!cancelled) setIsGmp3dLoaded(true);
      },
      (err) => {
        if (!cancelled) setGmpError(err.message);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [activeMode, apiKey]);

  const showGmp3d = activeMode === 'gmp3d' && Boolean(apiKey) && isGmp3dLoaded;
  // The key prompt / error card takes the centre of the map; hide the other overlays so they don't cover it
  const isGmpPromptVisible = activeMode === 'gmp3d' && (!apiKey || Boolean(gmpError));

  // <gmp-map-3d> is created imperatively: React would pass its camera props as strings before the element upgrades
  useEffect(() => {
    const container = gmp3dContainerRef.current;
    if (!showGmp3d || !container) return;
    const map3d = document.createElement('gmp-map-3d');
    map3d.setAttribute('mode', 'hybrid');
    map3d.setAttribute('map-id', 'DEMO_MAP_ID');
    map3d.setAttribute('internal-usage-attribution-ids', 'gmp_mcp_codeassist_v0.1_github');
    map3d.style.cssText = 'display:block;width:100%;height:100%;';
    container.appendChild(map3d);
    map3dRef.current = map3d;
    return () => {
      map3d.remove();
      map3dRef.current = null;
    };
  }, [showGmp3d]);

  const centerLat = selectedLocation.lat;
  const centerLng = selectedLocation.lng;

  useEffect(() => {
    const map3d = map3dRef.current;
    if (!showGmp3d || !map3d) return;
    map3d.center = { lat: centerLat, lng: centerLng, altitude: 0 };
    map3d.range = BASE_RANGE_M * 2 ** (17 - currentZoom);
    map3d.tilt = tiltAngle;
    map3d.heading = headingAngle;
  }, [showGmp3d, centerLat, centerLng, currentZoom, tiltAngle, headingAngle]);

  const handleLocationClick = (loc) => {
    setSelectedLocation(loc);
    if (onLocationSelect) {
      onLocationSelect(loc);
    }
  };

  const activateApiKey = (e) => {
    e.preventDefault();
    const key = keyDraft.trim();
    if (!key) return;
    try {
      localStorage.setItem(GMP_KEY_STORAGE, key);
    } catch {
      // Not persisted (storage blocked); still usable for this session
    }
    setGmpError('');
    setApiKey(key);
  };

  const clearApiKey = () => {
    try {
      localStorage.removeItem(GMP_KEY_STORAGE);
    } catch {
      // Nothing stored
    }
    // Google Maps is already bound to the old key for this page; a reload is the only way to switch keys
    if (maps3dLoader) {
      window.location.reload();
      return;
    }
    setApiKey('');
    setKeyDraft('');
    setGmpError('');
  };

  // Real Google Maps interactive satellite view URL centered on Pondicherry University
  const googleMapIframeSrc = `https://maps.google.com/maps?q=${centerLat},${centerLng}&hl=en&z=${currentZoom}&t=${activeMode === 'satellite' ? 'k' : 'm'}&output=embed`;

  const modeOptions = [
    { value: 'satellite', label: 'Satellite', icon: isCompact ? undefined : Satellite },
    { value: 'roadmap', label: 'Roadmap', icon: isCompact ? undefined : MapIcon },
    { value: 'gmp3d', label: isCompact ? '3D tiles' : 'Photorealistic 3D', icon: isCompact ? undefined : Building2 },
  ];

  const isSheetOpen = isCompact && isPlacesOpen && !isGmpPromptVisible;

  const cameraControls = (
    <div
      role="group"
      aria-label="Map camera"
      className={`pointer-events-auto shrink-0 flex ${isCompact ? 'flex-row' : 'flex-col'} items-center gap-0.5 p-1 rounded-full bg-canvas/95 shadow-[var(--shadow-float)]`}
    >
      <button
        type="button"
        onClick={() => setCurrentZoom((z) => Math.min(21, z + 1))}
        className={CONTROL_BUTTON}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <Plus className="w-[18px] h-[18px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setCurrentZoom((z) => Math.max(14, z - 1))}
        className={CONTROL_BUTTON}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <Minus className="w-[18px] h-[18px]" aria-hidden="true" />
      </button>
      <span aria-hidden="true" className={isCompact ? 'w-px h-5 mx-0.5 bg-hairline' : 'h-px w-5 my-0.5 bg-hairline'} />
      <button
        type="button"
        onClick={() => setHeadingAngle((h) => (h + 45) % 360)}
        className={CONTROL_BUTTON}
        title="Rotate 45°"
        aria-label="Rotate heading 45 degrees"
      >
        <RotateCw className="w-4 h-4" aria-hidden="true" />
      </button>
      {activeMode === 'gmp3d' && apiKey && (
        <button
          type="button"
          onClick={clearApiKey}
          className={CONTROL_BUTTON}
          title="Change Google Maps key"
          aria-label="Change Google Maps API key"
        >
          <Key className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );

  // Selected place: re-keyed so it pops in again whenever the selection changes
  const locationCard = (
    <article
      key={selectedLocation.id}
      className={`pointer-events-auto animate-pop-in ${FLOAT_PANEL} ${isCompact ? 'w-full p-4' : 'w-[360px] p-5'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="eyebrow !text-[11px] flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: selectedLocation.color }}
              />
              {categoryLabel(selectedLocation.category)}
            </p>
            {selectedLocation.hub && <span className="badge badge-lime !h-5 !px-2 !text-[11px]">UniGo hub</span>}
          </div>
          <h3 className={`heading mt-1.5 ${isCompact ? 'text-[19px]' : 'text-[22px]'}`}>{selectedLocation.name}</h3>
        </div>

        <a
          href={selectedLocation.gmapsUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-icon !w-9 !h-9 shrink-0"
          title="Open in Google Maps"
          aria-label="Open in Google Maps"
        >
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>

      <p className={`mt-2 text-[14px] text-body leading-relaxed ${isCompact ? 'line-clamp-1' : ''}`}>
        {selectedLocation.desc}
      </p>

      {!isCompact && (
        <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-subtle">{formatCoords(selectedLocation)}</span>
          <span className="text-[12px] text-muted num">Elev. {selectedLocation.altitude || 20} m</span>
        </div>
      )}

      {/* Quick actions connected to UniGo services */}
      <div className={`flex gap-2 ${isCompact ? 'mt-3' : 'mt-4'}`}>
        <button
          type="button"
          onClick={() => {
            setRideDropTarget(selectedLocation.name);
            setActiveTab('rides');
          }}
          className={`btn btn-sm btn-primary ${isCompact ? 'flex-1 !px-3' : ''}`}
        >
          <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
          Ride here
        </button>
        <button
          type="button"
          onClick={() => {
            setSelected3DTarget(selectedLocation);
            setActiveTab('laundry');
          }}
          className={`btn btn-sm btn-quiet ${isCompact ? 'flex-1 !px-3' : ''}`}
        >
          <Shirt className="w-3.5 h-3.5" aria-hidden="true" />
          Book laundry
        </button>
      </div>
    </article>
  );

  return (
    <div ref={rootRef} className="relative w-full h-full select-none overflow-hidden rounded-[inherit] bg-paper flex flex-col">
      {/* Top bar: map type, plus tilt (wide) or the places toggle (compact) */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-start justify-between gap-2 pointer-events-none">
        <Segmented
          size="sm"
          ariaLabel="Map type"
          value={activeMode}
          onChange={setActiveMode}
          options={modeOptions}
          className={`pointer-events-auto ${FLOAT_SEGMENTED}`}
        />

        {isCompact ? (
          !isGmpPromptVisible && (
            <button
              type="button"
              onClick={() => setIsPlacesOpen((open) => !open)}
              aria-expanded={isPlacesOpen}
              aria-controls={placesSheetId}
              aria-label={isPlacesOpen ? 'Hide campus places' : 'Show campus places'}
              className={`btn-icon pointer-events-auto shrink-0 shadow-[var(--shadow-float)] ${
                isPlacesOpen ? '!bg-forest !text-white' : ''
              }`}
            >
              {isPlacesOpen ? <X className="w-[18px] h-[18px]" aria-hidden="true" /> : <List className="w-[18px] h-[18px]" aria-hidden="true" />}
            </button>
          )
        ) : (
          <div className="pointer-events-auto flex items-center rounded-full pl-3.5 bg-canvas/95 shadow-[var(--shadow-float)]">
            <span className="eyebrow !text-[11px]">Tilt</span>
            <Segmented
              size="sm"
              ariaLabel="Camera tilt"
              value={tiltAngle}
              onChange={setTiltAngle}
              options={TILT_OPTIONS}
              className={`bg-transparent ${ASH_THUMB}`}
            />
          </div>
        )}
      </div>

      {/* Main Map Viewer */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-paper">
        {activeMode === 'gmp3d' ? (
          /* Google Maps 3D Web Component Mode (<gmp-map-3d>) */
          <div className="w-full h-full relative">
            {apiKey && <div ref={gmp3dContainerRef} className="absolute inset-0" />}

            {apiKey && !isGmp3dLoaded && !gmpError && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p role="status" className="flex items-center gap-2.5 h-10 px-4 rounded-full bg-canvas shadow-[var(--shadow-float)] text-[14px] text-muted animate-pop-in">
                  <span className="live-dot" aria-hidden="true" />
                  Loading photorealistic 3D tiles…
                </p>
              </div>
            )}

            {isGmpPromptVisible && (
              <div className="absolute inset-0 z-10 overflow-y-auto flex flex-col px-3 pt-16 pb-20">
                {apiKey ? (
                  <div role="alert" className="my-auto mx-auto w-full max-w-sm p-6 text-center bg-canvas rounded-[28px] shadow-[var(--shadow-float)] animate-pop-in">
                    <span className="mx-auto mb-3 w-11 h-11 rounded-full bg-alert-wash text-alert flex items-center justify-center">
                      <TriangleAlert className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <h3 className="heading text-[20px]">3D tiles did not load</h3>
                    <p className="mt-2 text-[14px] text-body leading-relaxed">{gmpError}</p>
                    <button type="button" onClick={clearApiKey} className="btn btn-forest w-full mt-5">
                      Use a different key
                    </button>
                    <div className="mt-4">
                      <button type="button" onClick={() => setActiveMode('satellite')} className="btn btn-link text-[14px]">
                        Use satellite view instead
                      </button>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={activateApiKey}
                    className="my-auto mx-auto w-full max-w-md p-5 sm:p-8 bg-canvas rounded-[28px] shadow-[var(--shadow-float)] animate-pop-in"
                  >
                    <span className="hidden sm:flex mb-4 w-11 h-11 rounded-full bg-ash text-ink items-center justify-center">
                      <Key className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <p className="eyebrow">Photorealistic 3D</p>
                    <h3 className="heading mt-1.5 text-[22px] sm:text-[26px]">Add a Google Maps key</h3>
                    <p className="mt-2 text-[14px] sm:text-[15px] text-body leading-relaxed">
                      Google's 3D tiles need a Maps Platform API key with the Maps JavaScript API turned on. The key is
                      saved in this browser only. Satellite view works without one.
                    </p>
                    <label htmlFor={keyInputId} className="label mt-5">
                      API key
                    </label>
                    <input
                      id={keyInputId}
                      type="password"
                      autoComplete="off"
                      placeholder="Paste your key"
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      className="field"
                    />
                    <button type="submit" disabled={!keyDraft.trim()} className="btn btn-forest w-full mt-3">
                      Turn on 3D tiles
                    </button>
                    <div className="mt-4 text-center">
                      <button type="button" onClick={() => setActiveMode('satellite')} className="btn btn-link text-[14px]">
                        Use satellite view instead
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Google Maps Live Satellite / Hybrid 3D View */
          <div
            className="w-full h-full relative transition-transform duration-700 ease-out origin-center"
            style={{
              transform: `perspective(1000px) rotateX(${tiltAngle * 0.45}deg) rotateZ(${
                (headingAngle - 38) * 0.25
              }deg) scale(${1 + (tiltAngle / 65) * 0.15})`,
              transformStyle: 'preserve-3d',
            }}
          >
            <iframe
              title="Real Pondicherry University Google Map"
              src={googleMapIframeSrc}
              className="w-full h-full border-0 pointer-events-auto filter saturate-110 brightness-95 contrast-105"
              loading="lazy"
              allowFullScreen
            />
          </div>
        )}

        {isCompact ? (
          <>
            {/* Compact: camera controls stacked above a full-width place card */}
            {!isSheetOpen && (
              <div className="absolute left-3 right-3 bottom-3 z-20 flex flex-col items-end gap-2 pointer-events-none">
                {cameraControls}
                {!isGmpPromptVisible && locationCard}
              </div>
            )}

            {isSheetOpen && (
              <div className="absolute left-3 right-3 bottom-3 z-30 flex flex-col max-h-[min(72%,440px)] animate-sheet-up">
                <PlacesPanel
                  id={placesSheetId}
                  filter={activeCategoryFilter}
                  onFilterChange={setActiveCategoryFilter}
                  selectedId={selectedLocation.id}
                  onPick={(loc) => {
                    handleLocationClick(loc);
                    setIsPlacesOpen(false);
                  }}
                  onClose={() => setIsPlacesOpen(false)}
                />
              </div>
            )}
          </>
        ) : (
          <>
            {/* Wide: places panel on the right with camera controls under it */}
            <div className="absolute top-16 right-3 bottom-3 z-20 flex flex-col items-end gap-3 pointer-events-none">
              {!isGmpPromptVisible && (
                <PlacesPanel
                  filter={activeCategoryFilter}
                  onFilterChange={setActiveCategoryFilter}
                  selectedId={selectedLocation.id}
                  onPick={handleLocationClick}
                  className="pointer-events-auto w-80 max-h-[480px] animate-pop-in"
                />
              )}
              <div className="mt-auto">{cameraControls}</div>
            </div>

            {!isGmpPromptVisible && (
              <div className="absolute left-3 bottom-3 z-20 pointer-events-none">{locationCard}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
