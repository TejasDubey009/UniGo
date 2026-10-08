// Short, readable reference for a booking id (UUIDs are too long to read out at a hub)
export const shortRef = (id = '') => id.replace(/-/g, '').slice(0, 8).toUpperCase();

export const formatWhen = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';

export const formatTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');
