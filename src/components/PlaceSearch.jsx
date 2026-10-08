import React, { useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchPlaces } from '../lib/geo';

const MAX_RESULTS = 40;

// Type to find a place. The best match is picked as you type (so the fare and the map follow along);
// arrow keys move through the list, Enter or a click confirms, Escape puts the last pick back.
// `groups` is [{ label, places }]; each place has a `name` and optionally `label` or `km`.
export default function PlaceSearch({ id, value, onChange, groups, placeholder = 'Search campus places', invalid = false }) {
  const listId = useId();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [valueAtOpen, setValueAtOpen] = useState(value);

  // Matches per group, flattened in display order for the keyboard
  const typing = open && query.trim() && query !== valueAtOpen;
  // Browsing (nothing typed) lists every place; a search shows the best matches
  const matched = groups
    .map((group) => ({ ...group, places: typing ? searchPlaces(query, group.places).slice(0, MAX_RESULTS) : group.places }))
    .filter((group) => group.places.length);
  // Each group's first option position in the flat list the keyboard moves through
  const shown = matched.map((group, g) => ({ ...group, start: matched.slice(0, g).reduce((n, prev) => n + prev.places.length, 0) }));
  const flat = shown.flatMap((group) => group.places);

  const optionId = (index) => `${listId}-option-${index}`;

  const openList = () => {
    setValueAtOpen(value);
    setQuery(value);
    // -1 when the current pick isn't in the list: Enter then just closes it instead of picking the top row
    setActive(flat.findIndex((place) => place.name === value));
    setOpen(true);
    // Select the current text so typing replaces it
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pick = (place, { keepOpen = false } = {}) => {
    if (place.name !== value) onChange(place);
    if (!keepOpen) {
      close();
      inputRef.current?.blur();
    }
  };

  const onType = (e) => {
    const next = e.target.value;
    setQuery(next);
    if (!open) setOpen(true);
    // Pick the best match straight away
    const top = next.trim() ? searchPlaces(next, groups.flatMap((g) => g.places))[0] : null;
    if (top) {
      if (top.name !== value) onChange(top);
      const order = groups.flatMap((group) => searchPlaces(next, group.places).slice(0, MAX_RESULTS));
      setActive(Math.max(0, order.indexOf(top)));
    } else if (value !== valueAtOpen) {
      // Nothing matches (or the field was cleared): go back to what was picked before
      const previous = groups.flatMap((g) => g.places).find((place) => place.name === valueAtOpen);
      if (previous) onChange(previous);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      if (!flat.length) return;
      const from = active < 0 ? (e.key === 'ArrowDown' ? -1 : 0) : active;
      const next = (from + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length;
      setActive(next);
      pick(flat[next], { keepOpen: true });
      document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      if (active >= 0 && flat[active]) pick(flat[active]);
      else {
        close();
        inputRef.current?.blur();
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      const previous = groups.flatMap((g) => g.places).find((place) => place.name === valueAtOpen);
      if (previous && previous.name !== value) onChange(previous);
      close();
    }
  };

  const noMatch = typing && !flat.length;

  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" aria-hidden="true" />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && flat[active] ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        value={open ? query : value}
        placeholder={placeholder}
        onFocus={openList}
        onClick={() => !open && openList()}
        onChange={onType}
        onKeyDown={onKeyDown}
        onBlur={close}
        className="field !pl-10 !pr-10 truncate"
      />
      {open && query && (
        <button
          type="button"
          aria-label="Clear search"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted hover:bg-ash"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Places"
          // Clicks on headings, padding or the scrollbar keep the field focused (and the list open)
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-30 left-0 right-0 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-[18px] bg-canvas p-1.5 shadow-[var(--shadow-float)] animate-pop-in"
        >
          {noMatch && <p className="px-3 py-3 text-[14px] text-muted">No place matches “{query.trim()}”.</p>}
          {shown.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              {shown.length > 1 && <p className="eyebrow !text-[11px] px-3 pt-2.5 pb-1">{group.label}</p>}
              {group.places.map((place, n) => {
                const i = group.start + n;
                const isActive = i === active;
                return (
                  <div
                    key={place.id || place.name}
                    id={optionId(i)}
                    role="option"
                    aria-selected={place.name === value}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(place)}
                    className={`px-3 py-2.5 rounded-xl cursor-pointer flex items-baseline justify-between gap-3 ${isActive ? 'bg-paper' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className={`block text-[15px] leading-snug ${place.name === value ? 'font-semibold text-forest' : 'text-ink'}`}>
                        {place.name}
                      </span>
                      {place.label && !place.name.toLowerCase().includes(place.label.toLowerCase()) && (
                        <span className="block text-[12px] text-muted">{place.label}</span>
                      )}
                    </span>
                    {place.km && <span className="shrink-0 text-[13px] text-muted num">{place.km} km</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
