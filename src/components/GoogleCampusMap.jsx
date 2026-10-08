import React, { useState, useEffect, useRef, useId } from 'react';
import { PU_LANDMARKS, GIRLS_HOSTELS, BOYS_HOSTELS, ALL_PU_LOCATIONS } from '../data/campusData';
import { useApp } from '../context/useApp';
import { Segmented } from './ui';
import { Satellite, Map as MapIcon, Plus, Minus, ExternalLink, Navigation, Shirt, List, X } from 'lucide-react';

// Below this width the places panel and the location card would overlap, so use a compact layout
const COMPACT_WIDTH_PX = 800;
const MIN_ZOOM = 14;
const MAX_ZOOM = 21;

const categoryLabel = (category) => category?.replace('-', ' ');

const formatCoords = (loc) => `${loc.lat.toFixed(4)}° N, ${loc.lng.toFixed(4)}° E`;

const FILTERS = {
  all: ALL_PU_LOCATIONS,
  hostels: [...GIRLS_HOSTELS, ...BOYS_HOSTELS],
  academic: PU_LANDMARKS.filter((l) => l.category === 'academic' || l.category === 'amenity'),
  gates: PU_LANDMARKS.filter((l) => l.category === 'gate'),
};

const FILTER_LABELS = { all: 'All', hostels: 'Hostels', academic: 'Academic', gates: 'Gates' };

const MODE_OPTIONS = [
  { value: 'satellite', label: 'Satellite', icon: Satellite },
  { value: 'roadmap', label: 'Roadmap', icon: MapIcon },
];

// Segmented control worn as a floating white pill over the map: ash thumb, forest text on the active item
const FLOAT_SEGMENTED =
  'bg-canvas/95 shadow-[var(--shadow-float)] [&>.segmented-thumb]:bg-ash [&>.segmented-thumb]:shadow-none [&_[aria-pressed=true]]:text-forest';
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

// Google's own satellite and road map of the campus, centred on the place picked from the list
export default function GoogleCampusMap({ onLocationSelect, highlightedId = null }) {
  const { setActiveTab, setSelected3DTarget, setRideDropTarget } = useApp();

  const [mode, setMode] = useState('satellite');
  const [zoom, setZoom] = useState(17);
  const [selectedLocation, setSelectedLocation] = useState(
    () => ALL_PU_LOCATIONS.find((loc) => loc.id === highlightedId) || ALL_PU_LOCATIONS.find((loc) => loc.id === 'library')
  );
  const [filter, setFilter] = useState('all');
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < COMPACT_WIDTH_PX);
  // On compact maps the places list lives in a bottom sheet that the user opens on demand
  const [isPlacesOpen, setIsPlacesOpen] = useState(false);

  const rootRef = useRef(null);
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

  const handleLocationClick = (loc) => {
    setSelectedLocation(loc);
    onLocationSelect?.(loc);
  };

  const iframeSrc = `https://maps.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}&hl=en&z=${zoom}&t=${
    mode === 'satellite' ? 'k' : 'm'
  }&output=embed`;

  const isSheetOpen = isCompact && isPlacesOpen;

  const zoomControls = (
    <div
      role="group"
      aria-label="Map zoom"
      className={`pointer-events-auto shrink-0 flex ${isCompact ? 'flex-row' : 'flex-col'} items-center gap-0.5 p-1 rounded-full bg-canvas/95 shadow-[var(--shadow-float)]`}
    >
      <button
        type="button"
        onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
        disabled={zoom >= MAX_ZOOM}
        className={CONTROL_BUTTON}
        aria-label="Zoom in"
      >
        <Plus className="w-[18px] h-[18px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
        disabled={zoom <= MIN_ZOOM}
        className={CONTROL_BUTTON}
        aria-label="Zoom out"
      >
        <Minus className="w-[18px] h-[18px]" aria-hidden="true" />
      </button>
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
          <p className="eyebrow !text-[11px] flex items-center gap-1.5">
            <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedLocation.color }} />
            {categoryLabel(selectedLocation.category)}
          </p>
          <h3 className={`heading mt-1.5 ${isCompact ? 'text-[19px]' : 'text-[22px]'}`}>{selectedLocation.name}</h3>
        </div>

        <a
          href={selectedLocation.gmapsUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-icon !w-9 !h-9 shrink-0"
          aria-label="Open in Google Maps"
        >
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>

      <p className={`mt-2 text-[14px] text-body leading-relaxed ${isCompact ? 'line-clamp-1' : ''}`}>{selectedLocation.desc}</p>

      {!isCompact && (
        <p className="mt-3 pt-3 border-t border-hairline font-mono text-[11px] text-subtle">{formatCoords(selectedLocation)}</p>
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
    <div ref={rootRef} className="relative w-full h-full select-none overflow-hidden rounded-[inherit] bg-paper">
      <iframe
        title={`Google ${mode === 'satellite' ? 'satellite view' : 'map'} of ${selectedLocation.name}, Pondicherry University`}
        src={iframeSrc}
        className="absolute inset-0 w-full h-full border-0"
        loading="lazy"
        allowFullScreen
      />

      {/* Top bar: map type, plus the places toggle on compact maps */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-start justify-between gap-2 pointer-events-none">
        <Segmented
          size="sm"
          ariaLabel="Map type"
          value={mode}
          onChange={setMode}
          options={MODE_OPTIONS}
          className={`pointer-events-auto ${FLOAT_SEGMENTED}`}
        />

        {isCompact && (
          <button
            type="button"
            onClick={() => setIsPlacesOpen((open) => !open)}
            aria-expanded={isPlacesOpen}
            aria-controls={placesSheetId}
            aria-label={isPlacesOpen ? 'Hide campus places' : 'Show campus places'}
            className={`btn-icon pointer-events-auto shrink-0 shadow-[var(--shadow-float)] ${isPlacesOpen ? '!bg-forest !text-white' : ''}`}
          >
            {isPlacesOpen ? <X className="w-[18px] h-[18px]" aria-hidden="true" /> : <List className="w-[18px] h-[18px]" aria-hidden="true" />}
          </button>
        )}
      </div>

      {isCompact ? (
        <>
          {/* Compact: zoom above a full-width place card, or the places sheet */}
          {!isSheetOpen && (
            <div className="absolute left-3 right-3 bottom-3 z-20 flex flex-col items-end gap-2 pointer-events-none">
              {zoomControls}
              {locationCard}
            </div>
          )}

          {isSheetOpen && (
            <div className="absolute left-3 right-3 bottom-3 z-30 flex flex-col max-h-[min(72%,440px)] animate-sheet-up">
              <PlacesPanel
                id={placesSheetId}
                filter={filter}
                onFilterChange={setFilter}
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
          {/* Wide: places panel on the right with zoom under it */}
          <div className="absolute top-16 right-3 bottom-3 z-20 flex flex-col items-end gap-3 pointer-events-none">
            <PlacesPanel
              filter={filter}
              onFilterChange={setFilter}
              selectedId={selectedLocation.id}
              onPick={handleLocationClick}
              className="pointer-events-auto w-80 max-h-[480px] animate-pop-in"
            />
            <div className="mt-auto">{zoomControls}</div>
          </div>

          <div className="absolute left-3 bottom-3 z-20 pointer-events-none">{locationCard}</div>
        </>
      )}
    </div>
  );
}
