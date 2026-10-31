import React, { useState } from 'react';
import { useGlove } from '../context/SignGloveContext';
import { STRICTNESS_LEVELS } from '../context/gesture';
import { Trash2, Circle, StopCircle, BookOpen, Volume2 } from 'lucide-react';

const Train = () => {
  const {
    device,
    examples,
    signModel,
    recording,
    startRecording,
    stopRecording,
    deleteGesture,
    deleteAll,
    teachLastMovement,
    setSignStrictness,
    isMoving,
    lastMatch,
    lastCapture,
    speakText,
  } = useGlove();

  const [newLabel, setNewLabel] = useState('');
  const [newSpeech, setNewSpeech] = useState('');
  const [teachLabel, setTeachLabel] = useState('');

  const recordingCount = recording ? examples.filter((e) => e.label === recording.label).length : 0;

  const handleStartRecording = () => {
    const label = newLabel.trim().toUpperCase();
    if (!label) return;
    startRecording(label, newSpeech.trim() || label.toLowerCase());
  };

  const handleStop = () => {
    stopRecording();
    setNewLabel('');
    setNewSpeech('');
  };

  const handleDeleteAll = () => {
    if (window.confirm('Delete ALL recorded signs? This cannot be undone.')) deleteAll();
  };

  const signs = [...signModel.signs.entries()];

  return (
    <div className="w-full max-w-md mx-auto space-y-6 mt-4 px-4 pb-12">
      <div className="text-center mb-8">
        <p className="text-xs font-bold tracking-[0.3em] text-slate-600 mb-1 uppercase">Gesture Vocabulary</p>
        <h2 className="text-4xl font-black text-slate-800">{signs.length} Signs</h2>
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-slate-300 rounded-3xl p-6 shadow-md space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Record New Sign</span>
          {device && (
            <span className={`flex items-center gap-1.5 text-[10px] font-black px-2 py-0.5 rounded-full ${
              isMoving ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isMoving ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
              {isMoving ? 'MOVING' : 'STILL'}
            </span>
          )}
        </div>

        {!device && (
          <p className="text-xs text-amber-600 font-bold bg-amber-50 px-3 py-2 rounded-xl text-center">
            Connect glove first
          </p>
        )}

        <p className="text-[11px] text-slate-500">
          Start with your hand open (any position), do the sign, then hold the final shape for a moment.
          Return to rest, pause for a second or so, and repeat 5–10 times.
        </p>

        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value.toUpperCase())}
          placeholder="SIGN LABEL e.g. HELLO"
          disabled={!!recording || !device}
          className="w-full bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-black text-slate-800 outline-none focus:border-blue-400 disabled:opacity-50"
        />
        <input
          value={newSpeech}
          onChange={(e) => setNewSpeech(e.target.value)}
          placeholder={`Spoken as (default: ${newLabel.trim().toLowerCase() || 'the label'})`}
          disabled={!!recording || !device}
          className="w-full bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 disabled:opacity-50"
        />

        {!recording ? (
          <button
            onClick={handleStartRecording}
            disabled={!newLabel.trim() || !device}
            className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-95 shadow-lg shadow-blue-200"
          >
            <Circle size={18} fill="currentColor" /> START RECORDING
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="w-full py-4 rounded-2xl bg-red-500 text-white font-black flex items-center justify-center gap-2 animate-pulse transition-all active:scale-95 shadow-lg shadow-red-200"
          >
            <StopCircle size={18} /> STOP — {recordingCount} examples
          </button>
        )}

        {recording && lastCapture && (
          <p className={`text-[11px] font-bold text-center ${lastCapture.saved ? 'text-green-600' : 'text-amber-600'}`}>
            {lastCapture.saved
              ? 'Saved that movement'
              : lastCapture.reason === 'return'
                ? 'Skipped — that was the return to rest'
                : "Skipped — it didn't start from an open hand"}
          </p>
        )}

        {lastMatch && !recording && (
          <p className="text-[11px] font-mono text-center text-slate-500">
            Last movement → <span className="font-black text-slate-800">{lastMatch.label}</span>
            {' '}· score {lastMatch.score.toFixed(3)} / {lastMatch.threshold.toFixed(3)}
            {' '}<span className={lastMatch.matched ? 'text-green-600' : 'text-red-500'}>
              ({lastMatch.matched ? 'match' : lastMatch.ambiguous ? 'too close to another sign' : 'over threshold'})
            </span>
            <br />
            motion {lastMatch.breakdown.motion.toFixed(3)} (mostly {lastMatch.breakdown.worstMotionFeature})
            {' '}+ end shape {lastMatch.breakdown.endShape.toFixed(3)} (mostly {lastMatch.breakdown.worstEndFeature})
          </p>
        )}

        {/* A real attempt that was rejected can be saved as another example of the right sign */}
        {lastMatch && !recording && !lastMatch.matched && lastMatch.movement && (
          <div className="flex gap-2 items-center">
            <select
              value={signs.some(([l]) => l === teachLabel) ? teachLabel : lastMatch.label}
              onChange={(e) => setTeachLabel(e.target.value)}
              className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-800"
            >
              {signs.map(([label]) => <option key={label} value={label}>{label}</option>)}
            </select>
            <button
              onClick={() => teachLastMovement(signs.some(([l]) => l === teachLabel) ? teachLabel : lastMatch.label)}
              className="px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-black active:scale-95 transition-all"
            >
              THAT WAS IT — ADD
            </button>
          </div>
        )}
        {lastMatch?.taught && !recording && (
          <p className="text-[11px] font-bold text-center text-green-600">
            Added as an example of {lastMatch.taught}
          </p>
        )}
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-slate-300 rounded-3xl p-6 shadow-md">
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Saved Signs</span>
          {examples.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={!!recording}
              className="text-[10px] font-black text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg disabled:opacity-40"
            >
              DELETE ALL
            </button>
          )}
        </div>
        {signs.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400 gap-3">
            <BookOpen size={32} strokeWidth={1.5} />
            <p className="text-xs font-bold uppercase tracking-wider">No signs recorded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {signs.map(([label, sign]) => (
              <div key={label} className="flex items-center justify-between bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl hover:border-blue-200 transition-colors">
                <div>
                  <p className="font-black text-slate-800">{label}</p>
                  <p className="text-[10px] text-slate-500 font-bold">
                    “{sign.speech}” · {sign.examples.length} examples · threshold {sign.threshold.toFixed(2)}
                    {sign.strictness !== 'normal' && ` (learned ${sign.learnedThreshold.toFixed(2)})`}
                  </p>
                  <select
                    value={sign.strictness}
                    onChange={(e) => setSignStrictness(label, e.target.value)}
                    className="mt-1 bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-black text-slate-600"
                  >
                    {STRICTNESS_LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                <div className="flex">
                  <button
                    onClick={() => speakText(sign.speech)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                  >
                    <Volume2 size={16} />
                  </button>
                  <button
                    onClick={() => deleteGesture(label)}
                    disabled={!!recording}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Train;
