import React, { useRef } from 'react';
import { useInView, useSlidingThumb } from '../hooks/useMotion';
import logoUrl from '../assets/unigo-logo.png';

// Fades and lifts its children in the first time they scroll into view
export function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children, ...rest }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? 'is-in' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Pill toggle with a white thumb that slides between options
export function Segmented({ options, value, onChange, ariaLabel, className = '', size = 'md' }) {
  const ref = useRef(null);
  const thumb = useSlidingThumb(ref, value);
  const itemClass = size === 'sm' ? 'segmented-item !px-3 !py-1 !text-[13px]' : 'segmented-item';

  return (
    <div ref={ref} role="group" aria-label={ariaLabel} className={`segmented ${className}`}>
      {thumb && (
        <span
          aria-hidden="true"
          className="segmented-thumb"
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
        />
      )}
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            data-key={opt.value}
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={itemClass}
          >
            {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Brand mark: the UniGo unicorn on an ink tile
function LogoMark({ className = 'w-9 h-9' }) {
  return <img src={logoUrl} alt="" className={`${className} rounded-[10px] object-cover shrink-0`} />;
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="wordmark text-[22px] text-ink">
        UniGo
      </span>
    </span>
  );
}

// Consistent page opening: small label, big display title, optional supporting copy and a right-side slot
export function PageHeader({ eyebrow, title, description, aside, className = '' }) {
  return (
    <header className={`flex flex-col lg:flex-row lg:items-end justify-between gap-6 ${className}`}>
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
        {/* Scales down on the narrowest phones so long words fit */}
        <h1 className="display text-[min(44px,11.5vw)] sm:text-[64px] lg:text-[76px]">{title}</h1>
        {description && (
          <p className="mt-5 text-[17px] sm:text-lg text-body max-w-2xl leading-relaxed [text-wrap:pretty]">
            {description}
          </p>
        )}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}
