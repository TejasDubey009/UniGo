import confetti from 'canvas-confetti';

// Brand-coloured burst for a confirmed booking; skipped for people who prefer reduced motion
export const celebrate = (particleCount = 80) =>
  confetti({
    particleCount,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#9fe870', '#163300', '#86dc4f'],
    disableForReducedMotion: true,
  });
