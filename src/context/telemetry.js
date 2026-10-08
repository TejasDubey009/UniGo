// Last WebGL frame rate reported by CampusMap3D. Kept outside React state so the
// once-per-second FPS sample does not re-render every context consumer.
let lastFps = null;

export const reportFps = (fps) => {
  lastFps = fps;
};

export const getLastFps = () => lastFps;
