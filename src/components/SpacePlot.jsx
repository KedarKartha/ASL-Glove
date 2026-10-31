import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const TRAIL_LENGTH = 60;
const SCENE_DIRS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; // axes[0] -> x, axes[1] -> y (up), axes[2] -> z

const makeLabel = (text, color, width = 256) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 46px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, 34);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true })
  );
  sprite.scale.set(0.28 * (width / 64), 0.28, 1);
  return sprite;
};

/**
 * Interactive 3D view of three dimensions of the sign feature space.
 * - axes:         [{ name, color }] for scene x, y (up), z
 * - point:        live [a, b, c] in those three dimensions
 * - clusters:     [{ label, color, paths: [[[a, b, c], ...], ...] }] — each sign's recorded movements
 * - highlight:    label whose color the live marker takes (the current recognition)
 * - positiveOnly: axes run 0..max from the cube corner instead of -max..max through the center
 * All three axes share one scale so distances in the plot match the distances the matcher uses.
 */
const SpacePlot = ({ axes, point, clusters = [], highlight, positiveOnly = false, minExtent = 1, color = '#0f172a' }) => {
  const mountRef = useRef(null);
  const sceneApi = useRef(null);
  const pointRef = useRef(point);
  const trailRef = useRef([]);
  const highlightRef = useRef(highlight);

  useEffect(() => {
    pointRef.current = point;
    trailRef.current.push(point);
    if (trailRef.current.length > TRAIL_LENGTH) trailRef.current.shift();
  }, [point]);

  useEffect(() => { highlightRef.current = highlight; }, [highlight]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(3.4, 2.4, 4.0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 2.5;
    controls.maxDistance = 9;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    controls.addEventListener('start', () => { controls.autoRotate = false; });

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(3, 5, 4);
    scene.add(light);

    const disposables = [];
    const track = (obj) => { disposables.push(obj); return obj; };
    const addLabel = (text, color, pos, width) => {
      const label = makeLabel(text, color, width);
      label.position.set(...pos);
      track(label.material.map);
      track(label.material);
      scene.add(label);
    };

    // Bounding cube and floor grid (normalized -1..1 space)
    scene.add(new THREE.LineSegments(
      track(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2))),
      track(new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.35 }))
    ));
    const grid = new THREE.GridHelper(2, 8, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = -1;
    scene.add(grid);

    // Axes start at the value 0: the cube corner for positive-only data, the center otherwise
    const origin = positiveOnly ? -1 : 0;
    SCENE_DIRS.forEach((dir, i) => {
      const start = dir.map((d) => (d ? -1 : origin));
      const end = dir.map((d) => (d ? 1 : origin));
      const geo = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...start), new THREE.Vector3(...end)]));
      scene.add(new THREE.Line(geo, track(new THREE.LineBasicMaterial({ color: axes[i].color }))));
      addLabel(axes[i].name, axes[i].color, end.map((v, k) => (dir[k] ? v + 0.3 : v)));
    });
    if (positiveOnly) addLabel('0', '#64748b', [-1.12, -1.12, -1.12], 64);

    // Data group maps raw feature values into the cube: scene = value * s + o
    const dataGroup = new THREE.Group();
    scene.add(dataGroup);
    const clusterGroup = new THREE.Group();
    dataGroup.add(clusterGroup);

    const trailPositions = new Float32Array(TRAIL_LENGTH * 3);
    const trailColors = new Float32Array(TRAIL_LENGTH * 3);
    const trailGeo = track(new THREE.BufferGeometry());
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    dataGroup.add(new THREE.Line(trailGeo, track(new THREE.LineBasicMaterial({ vertexColors: true }))));

    // Live marker lives in normalized space so its size stays constant
    const markerMat = track(new THREE.MeshPhongMaterial({ color, shininess: 80 }));
    const marker = new THREE.Mesh(track(new THREE.SphereGeometry(0.07, 24, 16)), markerMat);
    scene.add(marker);

    const dropGeo = track(new THREE.BufferGeometry());
    dropGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const dropLine = new THREE.Line(dropGeo, track(new THREE.LineDashedMaterial({ color: 0x64748b, dashSize: 0.05, gapSize: 0.04 })));
    scene.add(dropLine);
    const shadow = new THREE.Mesh(
      track(new THREE.RingGeometry(0.04, 0.07, 24)),
      track(new THREE.MeshBasicMaterial({ color: 0x64748b, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }))
    );
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);

    let clusterMax = 0;
    const clusterColors = new Map();

    const setClusters = (list) => {
      clusterGroup.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
      clusterGroup.clear();
      clusterColors.clear();
      clusterMax = 0;
      const toBuffer = (pts) => {
        const pos = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => {
          pos.set(p, i * 3);
          clusterMax = Math.max(clusterMax, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return geo;
      };
      list.forEach(({ label, color: c, paths = [] }) => {
        clusterColors.set(label, c);
        // Recorded movements are drawn as curves, with a dot marking where each one ends
        paths.forEach((path) => {
          clusterGroup.add(new THREE.Line(toBuffer(path), new THREE.LineBasicMaterial({
            color: c, transparent: true, opacity: 0.7,
          })));
          clusterGroup.add(new THREE.Points(toBuffer([path[path.length - 1]]), new THREE.PointsMaterial({
            color: c, size: 0.12,
          })));
        });
      });
    };
    sceneApi.current = { setClusters };

    const baseColor = new THREE.Color(color);
    const fadeColor = new THREE.Color(0xe2e8f0);
    const tmp = new THREE.Color();
    let extent = minExtent;
    let frameId;

    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const trail = trailRef.current;

      // Smoothly auto-scale so everything stays inside the cube
      let maxAbs = Math.max(minExtent, clusterMax);
      for (const p of trail) maxAbs = Math.max(maxAbs, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
      extent += (maxAbs * 1.1 - extent) * 0.05;
      const s = positiveOnly ? 2 / extent : 1 / extent;
      const o = positiveOnly ? -1 : 0;
      dataGroup.scale.setScalar(s);
      dataGroup.position.setScalar(o);
      const toCube = (p) => p.map((v) => v * s + o);

      const markerColor = clusterColors.get(highlightRef.current) || color;
      markerMat.color.set(markerColor);
      markerMat.emissive.set(markerColor).multiplyScalar(0.25);
      baseColor.set(markerColor);

      trail.forEach((p, i) => {
        trailPositions.set(p, i * 3);
        tmp.copy(fadeColor).lerp(baseColor, (i + 1) / trail.length);
        trailColors.set([tmp.r, tmp.g, tmp.b], i * 3);
      });
      trailGeo.setDrawRange(0, trail.length);
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;

      const [x, y, z] = toCube(pointRef.current);
      marker.position.set(x, y, z);
      shadow.position.set(x, -0.999, z);
      dropGeo.attributes.position.array.set([x, y, z, x, -1, z]);
      dropGeo.attributes.position.needsUpdate = true;
      dropLine.computeLineDistances();

      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const resize = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resize.observe(mount);

    return () => {
      cancelAnimationFrame(frameId);
      resize.disconnect();
      controls.dispose();
      setClusters([]);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneApi.current = null;
    };
    // axes is a static config per plot; rebuilding on identity changes would reset the camera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positiveOnly, minExtent, color]);

  useEffect(() => {
    sceneApi.current?.setClusters(clusters);
  }, [clusters]);

  return <div ref={mountRef} className="w-full h-72 cursor-grab active:cursor-grabbing touch-none" />;
};

export default SpacePlot;
