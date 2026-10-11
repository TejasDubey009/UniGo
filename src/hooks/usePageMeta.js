import { useEffect } from 'react';

export const TAB_META = {
  home: {
    title: 'UniGo · Campus services at Pondicherry University',
    description: 'Book campus bike rides, rent scooters at Gate 1, and get hostel laundry collected and delivered at Pondicherry University.',
  },
  rides: {
    title: 'Campus Rides · UniGo',
    description: 'Flat ₹20 bike rides between gates, hostels, and academic departments across Pondicherry University with student captains.',
  },
  rental: {
    title: 'Scooter & Bike Rental · UniGo',
    description: 'Self-drive scooter and bike rentals from Gate 1 and Library hubs. Honda Activa, Ather 450X, and Hunter 350.',
  },
  laundry: {
    title: 'Hostel Laundry Pickup & Delivery · UniGo',
    description: 'Hostel laundry service for Pondicherry University students. Picked up Wednesday and Sunday, returned clean in 48 hours.',
  },
  food: {
    title: 'Late-Night Food Delivery · UniGo',
    description: 'Campus and Kalapet canteen food delivered to hostel gates at Pondicherry University.',
  },
  party: {
    title: 'Hostel Party Planning · UniGo',
    description: 'Birthday cakes, decorations, and celebrations in hostels and beach events planned for Pondicherry University students.',
  },
  captain: {
    title: 'Drive with UniGo · Student Captain Portal',
    description: 'Apply to give campus bike rides on your two-wheeler or manage your active captain shifts and ride requests.',
  },
  admin: {
    title: 'Operations Dashboard · UniGo Admin',
    description: 'Internal operations management for UniGo campus rides, laundry logistics, and vehicle leases.',
  },
};

export function usePageMeta(activeTab) {
  useEffect(() => {
    const meta = TAB_META[activeTab] || TAB_META.home;
    document.title = meta.title;

    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) {
      descEl.setAttribute('content', meta.description);
    }

    const ogTitleEl = document.querySelector('meta[property="og:title"]');
    if (ogTitleEl) {
      ogTitleEl.setAttribute('content', meta.title);
    }

    const ogDescEl = document.querySelector('meta[property="og:description"]');
    if (ogDescEl) {
      ogDescEl.setAttribute('content', meta.description);
    }
  }, [activeTab]);
}
