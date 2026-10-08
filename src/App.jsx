import React, { Suspense, lazy, useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/useApp';
import Navbar from './components/Navbar';
import HomeHeroView from './components/HomeHeroView';
import RidesView from './components/RidesView';
import RentalView from './components/RentalView';
import LaundryView from './components/LaundryView';
import FoodView from './components/FoodView';
import PartyPlanningView from './components/PartyPlanningView';
import CaptainView from './components/CaptainView';
import AuthModal from './components/AuthModal';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';

// Only admins open this page, so students never download it
const AdminView = lazy(() => import('./components/AdminView'));

const PAGES = {
  home: HomeHeroView,
  rides: RidesView,
  rental: RentalView,
  laundry: LaundryView,
  food: FoodView,
  party: PartyPlanningView,
  captain: CaptainView,
  admin: AdminView,
};

function MainAppContent() {
  const { activeTab, accountEpoch } = useApp();
  const Page = PAGES[activeTab];

  // Each tab is a new "page": start it at the top instead of wherever the previous one was scrolled
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col font-sans">
      <Navbar />

      <main className="flex-1">
        {/* Keyed by tab so every page switch replays the enter animation, and by account so a page
            never carries one student's details into the next account */}
        <div key={`${activeTab}:${accountEpoch}`} className="animate-page-in">
          <ErrorBoundary>
            <Suspense fallback={<div className="min-h-[60vh]" />}>
              <Page />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <AuthModal />
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}
