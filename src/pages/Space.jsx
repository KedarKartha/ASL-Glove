import React, { useMemo } from 'react';
import { useGlove } from '../context/SignGloveContext';
import SpacePlot from '../components/SpacePlot';

const PALETTE = ['#2563eb', '#db2777', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#ca8a04', '#dc2626'];

// The 11 dimensions of a frame (see frameFeatures in gesture.js)
const DIMENSIONS = [
  { name: 'Flex 1', color: '#ef4444' },
  { name: 'Flex 2', color: '#f59e0b' },
  { name: 'Flex 3', color: '#22c55e' },
  { name: 'Flex 4', color: '#06b6d4' },
  { name: 'Flex 5', color: '#8b5cf6' },
  { name: 'Accel X', color: '#ef4444' },
  { name: 'Accel Y', color: '#22c55e' },
  { name: 'Accel Z', color: '#3b82f6' },
  { name: 'Gyro X', color: '#ef4444' },
  { name: 'Gyro Y', color: '#22c55e' },
  { name: 'Gyro Z', color: '#3b82f6' },
];

// 11 dimensions need ceil(11 / 3) = 4 plots. Flex 3 is shared so the finger plots are both fully 3D.
// Dims are listed as scene x, y (up), z — the Z axes are drawn as "up".
const PLOTS = [
  {
    title: 'Fingers · Flex 1, 2, 3',
    dims: [0, 1, 2],
    positiveOnly: true,
    minExtent: 0.5,
    note: 'Bend of each finger: raw reading ÷ 1023 × 2, so never negative.',
  },
  {
    title: 'Fingers · Flex 3, 4, 5',
    dims: [2, 3, 4],
    positiveOnly: true,
    minExtent: 0.5,
    note: 'Flex 3 appears again here so this view is also fully 3D.',
  },
  {
    title: 'Hand Tilt · Accel X, Y, Z',
    dims: [5, 7, 6],
    positiveOnly: false,
    minExtent: 1,
    note: 'Accelerometer ÷ 2: which way gravity points relative to the hand.',
  },
  {
    title: 'Rotation · Gyro X, Y, Z',
    dims: [8, 10, 9],
    positiveOnly: false,
    minExtent: 0.3,
    note: 'Rotation speed ÷ 200 deg/s. A still hand sits at the center.',
  },
];

const project = (vec, dims) => dims.map((d) => vec[d]);

const Space = () => {
  const { device, liveFrame: live, signModel, translation, lastMatch } = useGlove();

  const signs = useMemo(() => [...signModel.signs.entries()].map(([label, sign], i) => ({
    label,
    color: PALETTE[i % PALETTE.length],
    count: sign.examples.length,
    paths: sign.examples.map((e) => e.frames),
  })), [signModel]);

  const plots = useMemo(() => PLOTS.map((plot) => ({
    ...plot,
    axes: plot.dims.map((d) => DIMENSIONS[d]),
    clusters: signs.map(({ label, color, paths }) => ({
      label,
      color,
      paths: paths.map((frames) => frames.map((f) => project(f, plot.dims))),
    })),
  })), [signs]);

  const points = useMemo(() => PLOTS.map((p) => project(live, p.dims)), [live]);

  return (
    <div className="w-full max-w-md space-y-4 mt-4 px-4 pb-10">
      <div className="text-center mb-6">
        <p className="text-xs font-bold tracking-[0.3em] text-slate-600 mb-1 uppercase">Feature Space</p>
        <h2 className="text-4xl font-black text-slate-800">{translation}</h2>
        {!device && (
          <p className="text-xs text-amber-600 font-bold bg-amber-50 px-3 py-2 rounded-xl mt-3">
            Connect glove to see the live point
          </p>
        )}
      </div>

      {/* Recogniser summary */}
      <div className="bg-white/80 backdrop-blur-sm border border-slate-300 rounded-3xl p-5 shadow-md">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Movement Matching</span>
        <p className="text-[11px] text-slate-500 mt-1">
          Every sign is a curve through this 11-number space, starting from an open hand. A new movement is
          compared to each recorded curve with Dynamic Time Warping, plus how close its final handshape is.
          It's accepted if the score is under that sign's own threshold, learned from how consistently the
          sign was recorded.
        </p>
        <div className="grid grid-cols-3 mt-3 text-[10px] font-mono font-bold text-slate-400 text-center border-t border-slate-100 pt-3">
          <div className="flex flex-col">
            <span>LAST MATCH</span>
            <span className="text-slate-700">{lastMatch ? lastMatch.label : '—'}</span>
          </div>
          <div className="flex flex-col border-x border-slate-100">
            <span>SCORE / LIMIT</span>
            <span className={lastMatch?.matched ? 'text-green-600' : 'text-slate-700'}>
              {lastMatch ? `${lastMatch.score.toFixed(2)} / ${lastMatch.threshold.toFixed(2)}` : '—'}
            </span>
          </div>
          <div className="flex flex-col">
            <span>EXAMPLES</span>
            <span className="text-slate-700">{signs.reduce((n, s) => n + s.count, 0)}</span>
          </div>
        </div>
        {signs.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {signs.map(({ label, color, count }) => (
              <span
                key={label}
                className={`flex items-center gap-1.5 text-[10px] font-black px-2 py-1 rounded-full border ${
                  label === translation ? 'border-slate-800 bg-white' : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {label} · {count}
              </span>
            ))}
          </div>
        )}
      </div>

      {plots.map((plot, i) => (
        <div key={plot.title} className="bg-white/80 backdrop-blur-sm border border-slate-300 rounded-3xl p-5 shadow-md">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{plot.title}</span>
          <p className="text-[11px] text-slate-500 mt-1">{plot.note}</p>
          <SpacePlot
            axes={plot.axes}
            point={points[i]}
            clusters={plot.clusters}
            highlight={translation}
            positiveOnly={plot.positiveOnly}
            minExtent={plot.minExtent}
          />
          <div className="grid grid-cols-3 mt-2 text-[10px] font-mono font-bold text-slate-400 text-center border-t border-slate-100 pt-3">
            {plot.axes.map((axis, k) => (
              <div key={axis.name} className="flex flex-col">
                <span style={{ color: axis.color }}>{axis.name.toUpperCase()}</span>
                <span className="text-slate-700">{points[i][k].toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Drag to rotate · Pinch to zoom · Curves = recorded signs · Dot = end handshape
      </p>
    </div>
  );
};

export default Space;
