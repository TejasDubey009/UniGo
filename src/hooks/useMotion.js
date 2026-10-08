import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// True once the element has scrolled into view (never flips back, so reveals run once)
export function useInView(ref, { rootMargin = '0px 0px -8% 0px' } = {}) {
  // Without IntersectionObserver there is nothing to wait for, so start revealed
  const [inView, setInView] = useState(() => typeof window === 'undefined' || !('IntersectionObserver' in window));

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin, inView]);

  return inView;
}

// Tweens a displayed number toward `value` (fares, counters) so changes read as movement, not a swap
export function useCountUp(value, duration = 420) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value || prefersReducedMotion()) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      fromRef.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return display;
}

// Measures the active child (matched by data-key) so a thumb/indicator can slide to it
export function useSlidingThumb(containerRef, activeKey) {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const el = container.querySelector(`[data-key="${CSS.escape(String(activeKey))}"]`);
      setRect(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, activeKey]);

  return rect;
}
