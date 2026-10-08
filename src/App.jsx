import React, { useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/useApp';
import Navbar from './components/Navbar';
import HomeHeroView from './components/HomeHeroView';
import RidesView from './components/RidesView';
import RentalView from './components/RentalView';
import LaundryView from './components/LaundryView';
import FoodView from './components/FoodView';
import PartyPlanningView from './components/PartyPlanningView';
import UserDashboard from './components/UserDashboard';
import AdminDashboard from './components/AdminDashboard';
import DevDashboard from './components/DevDashboard';
import GoogleAuthModal from './components/GoogleAuthModal';
import Footer from './components/Footer';

function MainAppContent() {
  const { activeTab, user } = useApp();

  // Each tab is a new "page": start it at the top instead of wherever the previous one was scrolled
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col font-sans">
      {/* Global Navbar */}
      <Navbar />

      {/* Dynamic Content Views (keyed by user so forms re-fill after switching profile) */}
      <main className="flex-1" key={user.id}>
        {/* Keyed by tab so every page switch replays the enter animation */}
        <div key={activeTab} className="animate-page-in">
          {activeTab === 'home' && <HomeHeroView />}
          {activeTab === 'rides' && <RidesView />}
          {activeTab === 'rental' && <RentalView />}
          {activeTab === 'laundry' && <LaundryView />}
          {activeTab === 'food' && <FoodView />}
          {activeTab === 'party' && <PartyPlanningView />}
          {activeTab === 'user-dashboard' && <UserDashboard />}
          {activeTab === 'admin-dashboard' && <AdminDashboard />}
          {activeTab === 'dev-dashboard' && <DevDashboard />}
        </div>
      </main>

      {/* Global Google Authentication Modal */}
      <GoogleAuthModal />

      {/* Global Footer */}
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
