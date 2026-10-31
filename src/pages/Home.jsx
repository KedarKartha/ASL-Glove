import React from 'react';
import { Bluetooth, ShieldCheck, Zap, Info } from 'lucide-react';
import { useGlove } from '../context/SignGloveContext';

const Home = () => {
  const { connect, isConnecting, device, translation, isCalibrating } = useGlove();

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center animate-in fade-in duration-700">
      {/* Hero Section */}
      <div className="mb-12 relative">
        <div className="absolute -inset-4 bg-blue-500/10 blur-3xl rounded-full" />
        <h1 className="text-6xl font-black text-slate-800 tracking-tighter mb-4 relative">
          SIGN<span className="text-blue-600">GLOVE</span>
        </h1>
        <p className="text-slate-500 font-medium max-w-xs mx-auto leading-relaxed">
          The world's most advanced gesture translation interface.
        </p>
      </div>

      {/* Main Connection Action */}
      <div className="w-full max-w-sm space-y-4">
        {!device ? (
          <button
            onClick={connect}
            disabled={isConnecting}
            className={`w-full py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-xl shadow-blue-200/50 ${
              isConnecting 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:-translate-y-1'
            }`}
          >
            <Bluetooth className={isConnecting ? 'animate-spin' : ''} size={24} />
            {isConnecting ? 'INITIALIZING...' : 'PAIR GLOVE'}
          </button>
        ) : (
          <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 relative overflow-hidden group">
            {/* Calibration Overlay */}
            {isCalibrating && (
              <div className="absolute inset-0 bg-blue-600/95 backdrop-blur-md z-10 flex flex-col items-center justify-center text-white animate-in fade-in duration-300">
                <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
                <p className="font-black text-xl tracking-tight uppercase">Calibrating</p>
                <p className="text-blue-100 text-sm font-medium">Hold your hand open and still</p>
              </div>
            )}
            
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Zap size={80} className="text-blue-600" />
            </div>
            
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Live Translation</p>
            <h2 className={`text-5xl font-black tracking-tight mb-1 transition-colors ${translation === 'OFFLINE' ? 'text-slate-300' : 'text-slate-800'}`}>
              {translation === 'OFFLINE' && device ? 'INITIALIZING...' : translation}
            </h2>
            <div className="flex items-center justify-center gap-2 mt-4 text-green-500 font-bold text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              CONNECTED
            </div>
          </div>
        )}
      </div>

      {/* Feature Grid */}
      {!device && (
        <div className="grid grid-cols-2 gap-4 mt-12 w-full max-w-sm">
          <div className="bg-white/50 p-6 rounded-3xl border border-slate-200 text-left">
            <ShieldCheck className="text-blue-600 mb-3" size={28} />
            <h3 className="font-black text-slate-800 text-sm">SECURE</h3>
            <p className="text-[10px] text-slate-500 font-bold leading-tight mt-1">
              Encrypted BLE Stack v5.0
            </p>
          </div>
          <div className="bg-white/50 p-6 rounded-3xl border border-slate-200 text-left">
            <Zap className="text-blue-600 mb-3" size={28} />
            <h3 className="font-black text-slate-800 text-sm">ULTRA-FAST</h3>
            <p className="text-[10px] text-slate-500 font-bold leading-tight mt-1">
              10ms Inference Latency
            </p>
          </div>
        </div>
      )}

      {/* Bottom Info */}
      <div className="mt-auto pt-10 pb-6 flex items-center gap-2 text-slate-400">
        <Info size={14} />
        <span className="text-[10px] font-black uppercase tracking-widest">System Ready • v1.0.5</span>
      </div>
    </div>
  );
};

export default Home;