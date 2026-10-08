import React, { useState, useEffect, useRef } from 'react';
import { ALL_PU_LOCATIONS } from '../data/campusData';
import { useApp } from '../context/useApp';
import { Segmented } from './ui';
import { Satellite, Map as MapIcon, Plus, Minus, ExternalLink, Navigation, Shirt } from 'lucide-react';

// Below this width the location card spans the map, with the zoom controls above it
const COMPACT_WIDTH_PX = 800;
const MIN_ZOOM = 14;
const MAX_ZOOM = 21;

const categoryLabel = (category) => category?.replace('-', ' ');

const formatCoords = (loc) => `${loc.lat.toFixed(4)}° N, ${loc.lng.toFixed(4)}° E`;

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

// Google's own satellite and road map of the campus, centred on the highlighted place (the library by default)
export default function GoogleCampusMap({ highlightedId = null }) {
  const { setActiveTab, setSelected3DTarget, pickForRide } = useApp();

  const [mode, setMode] = useState('satellite');
  const [zoom, setZoom] = useState(17);
  const [selectedLocation, setSelectedLocation] = useState(
    () => ALL_PU_LOCATIONS.find((loc) => loc.id === highlightedId) || ALL_PU_LOCATIONS.find((loc) => loc.id === 'library')
  );
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < COMPACT_WIDTH_PX);

  const rootRef = useRef(null);

  // Follow the highlightedId prop (e.g. the hostel picked in the Laundry form)
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

  const iframeSrc = `https://maps.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}&hl=en&z=${zoom}&t=${
    mode === 'satellite' ? 'k' : 'm'
  }&output=embed`;

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
            pickForRide('drop', selectedLocation.name);
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

      <Segmented
        size="sm"
        ariaLabel="Map type"
        value={mode}
        onChange={setMode}
        options={MODE_OPTIONS}
        className={`absolute top-3 left-3 z-20 ${FLOAT_SEGMENTED}`}
      />

      {/* Wide: place card bottom-left, zoom bottom-right. Compact: zoom stacked above a full-width card */}
      <div
        className={`absolute left-3 right-3 bottom-3 z-20 flex gap-2 pointer-events-none ${
          isCompact ? 'flex-col-reverse items-end' : 'items-end justify-between'
        }`}
      >
        {locationCard}
        {zoomControls}
      </div>
    </div>
  );
}
