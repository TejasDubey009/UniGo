import React, { Suspense, lazy } from 'react';

// three.js is most of the bundle; only download it when the WebGL map is actually shown
const CampusMap3D = lazy(() => import('./CampusMap3D'));

export default function LazyCampusMap3D(props) {
  return (
    <Suspense
      fallback={
        <div role="status" className="w-full h-full flex items-center justify-center gap-2.5 bg-paper text-[14px] text-muted">
          <span className="live-dot" aria-hidden="true" />
          Loading 3D campus…
        </div>
      }
    >
      <CampusMap3D {...props} />
    </Suspense>
  );
}
