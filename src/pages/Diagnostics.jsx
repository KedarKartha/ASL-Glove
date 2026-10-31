import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGlove } from '../context/SignGloveContext';

const Diagnostics = () => {
  const { translation, sensorValues, normalizedFlex, orientation, isCalibrating } = useGlove();
  
  const mountRef = useRef(null);
  const cubeRef = useRef(null);
  const targetRotation = useRef({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    targetRotation.current = { 
      x: orientation.pitch, 
      y: -orientation.yaw,
      z: orientation.roll 
    };
  }, [orientation]);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.BoxGeometry(3, 0.2, 1.5);
    const material = new THREE.MeshPhongMaterial({ 
      color: 0x2563eb,
      emissive: 0x1d4ed8,
      specular: 0xffffff,
      shininess: 100
    });
    const board = new THREE.Mesh(geometry, material);
    scene.add(board);
    cubeRef.current = board;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    camera.position.z = 5;

    const animate = () => {
      const frameId = requestAnimationFrame(animate);
      
      if (cubeRef.current) {
        const lerpFactor = 0.15;
        cubeRef.current.rotation.x += (targetRotation.current.x - cubeRef.current.rotation.x) * lerpFactor;
        cubeRef.current.rotation.y += (targetRotation.current.y - cubeRef.current.rotation.y) * lerpFactor;
        cubeRef.current.rotation.z += (targetRotation.current.z - cubeRef.current.rotation.z) * lerpFactor;
      }
      
      renderer.render(scene, camera);
      return frameId;
    };
    const frameId = animate();

    return () => {
      cancelAnimationFrame(frameId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="w-full max-w-md space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700 mt-4 px-4">
      <div className="text-center mb-8">
        <p className="text-xs font-bold tracking-[0.3em] text-slate-600 mb-1 uppercase">
          {isCalibrating ? 'System Setup' : 'Live Stream'}
        </p>
        <h2 className={`text-4xl font-black transition-colors duration-300 ${isCalibrating ? 'text-blue-600 animate-pulse' : 'text-slate-800'}`}>
          {translation}
        </h2>
      </div>

      {/* 3D ORIENTATION CARD */}
      <div className="bg-white/80 backdrop-blur-sm border border-slate-300 rounded-3xl p-6 shadow-md overflow-hidden relative">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Orientation HUD</span>
          {isCalibrating && (
            <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold animate-pulse">
              CALIBRATING
            </span>
          )}
        </div>
        
        <div ref={mountRef} className="w-full h-48 cursor-grab active:cursor-grabbing" />
        
        <div className="grid grid-cols-3 mt-2 text-[10px] font-mono font-bold text-slate-400 text-center border-t border-slate-100 pt-3">
          <div className="flex flex-col">
            <span>PITCH</span>
            <span className="text-slate-700">{(orientation.pitch * (180/Math.PI)).toFixed(0)}°</span>
          </div>
          <div className="flex flex-col border-x border-slate-100">
            <span>YAW</span>
            <span className="text-blue-600">{(orientation.yaw * (180/Math.PI)).toFixed(0)}°</span>
          </div>
          <div className="flex flex-col">
            <span>ROLL</span>
            <span className="text-slate-700">{(orientation.roll * (180/Math.PI)).toFixed(0)}°</span>
          </div>
        </div>
      </div>

      {/* Flex Sensor Card */}
{/* Flex Sensor Card */}
<div className="bg-white/80 backdrop-blur-sm border border-slate-300 rounded-3xl p-6 shadow-md">
  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-6">Flex Sensor Array</span>
  <div className="flex justify-between items-center gap-3">
    {sensorValues.slice(0, 5).map((v, i) => (
      <div key={i} className="flex flex-col items-center w-full gap-2">
        <span className="text-lg font-black font-mono text-slate-800">{v}</span>
        <span className="text-[10px] text-slate-500 font-bold font-mono">F{i+1}</span>
      </div>
    ))}
  </div>
</div>

      {/* IMU Numerical Grid */}
      <div className="grid grid-cols-2 gap-4 pb-10">
        <div className="bg-white/80 backdrop-blur-sm border border-slate-300 rounded-3xl p-5 shadow-md">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-4">Accel (m/s²)</span>
          <div className="space-y-3 font-mono text-sm">
            {['X', 'Y', 'Z'].map((axis, i) => (
              <div key={axis} className="flex justify-between items-center">
                <span className="text-slate-400 font-bold">{axis}</span>
                <span className="text-slate-800 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  {sensorValues[5 + i]?.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-slate-300 rounded-3xl p-5 shadow-md">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-4">Gyro (deg/s)</span>
          <div className="space-y-3 font-mono text-sm">
            {['X', 'Y', 'Z'].map((axis, i) => (
              <div key={axis} className="flex justify-between items-center">
                <span className="text-slate-400 font-bold">{axis}</span>
                <span className="text-blue-700 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  {sensorValues[8 + i]?.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Diagnostics;