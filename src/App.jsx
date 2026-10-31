import React, { useState } from 'react';
import { Menu } from 'lucide-react';

// Import Provider and Hook from our new context file
import { SignGloveProvider, useGlove } from './context/SignGloveContext';

import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Diagnostics from './pages/Diagnostics';
import Train from './pages/Train';
import Space from './pages/Space';

/**
 * AppContent contains the actual UI of the application.
 * It is separated from the App component so it can use the useGlove hook,
 * which must be called within a SignGloveProvider.
 */
const AppContent = () => {
  const [activeTab, setActiveTab] = useState('home'); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Pulling global state and functions directly from the Glove Context
  const { 
    device, 
    isConnecting, 
    connect, 
    disconnect, 
    translation, 
    sensorValues 
  } = useGlove();

  return (
    <div className="relative min-h-screen w-screen bg-[#cbd5e1] text-slate-900 overflow-x-hidden font-sans transition-colors duration-500">
      
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        device={device}
        onDisconnect={disconnect}
      />

      <div className="flex flex-col items-center p-6 pt-16">
        {/* Sidebar Trigger */}
        <button 
          onClick={() => setIsSidebarOpen(true)} 
          className="absolute top-12 left-6 p-2 rounded-full hover:bg-slate-300/50 transition-colors z-30"
        >
          <Menu size={28} className="text-slate-700" />
        </button>

        {/* Dynamic Page Rendering based on activeTab */}
        {activeTab === 'home' && (
          <Home 
            device={device} 
            isConnecting={isConnecting} 
            onConnect={connect} 
          />
        )}

      {activeTab === 'diagnostics' && (
        <Diagnostics />
      )}

      {activeTab === 'space' && <Space />}

      {activeTab === 'train' && <Train />}
      </div>
    </div>
  );
};

/**
 * The root App component.
 * It wraps the AppContent in the SignGloveProvider to enable
 * global access to the glove's data across the entire app.
 */
const App = () => {
  return (
    <SignGloveProvider>
      <AppContent />
    </SignGloveProvider>
  );
};

export default App;