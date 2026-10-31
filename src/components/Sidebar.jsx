import React from 'react';
import { X, Home, Activity, Smartphone, Bluetooth, BookOpen, Box } from 'lucide-react';

const Sidebar = ({ isOpen, onClose, activeTab, setActiveTab, device, onDisconnect }) => {
  const menuItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
    { id: 'space', label: 'Space', icon: Box },
    { id: 'train', label: 'Train', icon: BookOpen },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/30 z-40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      <div className={`fixed top-0 left-0 h-full w-72 bg-[#f1f5f9] border-r border-slate-300 z-50 transform transition-transform duration-300 ease-out shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 pt-16 flex flex-col h-full">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-xl font-black text-slate-800 tracking-tighter italic px-2">GLOVE APP</h2>
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-full transition-colors">
              <X size={24} />
            </button>
          </div>

          <nav className="space-y-2 flex-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); onClose(); }}
                className={`w-full text-left px-4 py-3 rounded-2xl flex items-center gap-3 transition-all ${
                  activeTab === item.id
                    ? 'bg-slate-800 text-white shadow-lg'
                    : 'text-slate-600 hover:bg-slate-200/50'
                }`}
              >
                <item.icon size={20} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                <span className="font-bold">{item.label}</span>
              </button>
            ))}

            <div className="mt-8 pt-8 border-t border-slate-300">
              <p className="px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Device</p>

              <button className="w-full text-left px-4 py-3 rounded-2xl flex items-center gap-3 transition-colors text-slate-600 hover:bg-slate-200/50">
                <Smartphone size={20} />
                <span className="font-bold">Info</span>
              </button>

              {device && (
                <button
                  onClick={onDisconnect}
                  className="w-full text-left px-4 py-3 rounded-2xl flex items-center gap-3 transition-colors text-red-600 hover:bg-red-100"
                >
                  <Bluetooth size={20} />
                  <span className="font-bold">Disconnect</span>
                </button>
              )}
            </div>
          </nav>

          <div className="text-[10px] text-slate-500 font-bold text-center uppercase tracking-widest pb-6">
            v1.0.5-Alpha
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;