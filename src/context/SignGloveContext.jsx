import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { BleClient, dataViewToText } from '@capacitor-community/bluetooth-le';
import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech';
import {
  normalize, frameFeatures, isMovingNow, isRestPose, trackRest, startsWhereEnded, createSegmenter,
  buildSignModel, classifyMovement,
} from './gesture';

const SignGloveContext = createContext();

const SERVICE_UUID = '0000180c-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '00002a56-0000-1000-8000-00805f9b34fb';

const STORAGE_KEY = 'glove_signs_v3';
const STRICTNESS_KEY = 'glove_sign_strictness_v1'; // { label: level id }
const OLD_STORAGE_KEYS = ['glove_examples', 'glove_examples_v2']; // earlier formats, wiped on load
const DISPLAY_HOLD_MS = 1500; // how long a recognised sign stays on screen
const RETURN_WINDOW_MS = 1200; // while recording, a movement starting this soon after a saved sign may be its return to rest

const speakText = (text) => {
  TextToSpeech.speak({ text, lang: 'en-US', rate: 1.0, queueStrategy: QueueStrategy.Add })
    .catch((err) => console.error('TTS Error:', err));
};

/**
 * Every sign is a movement. Each recorded example is
 *   { label, speech, frames: [[11 features]], startPose: [11], endPose: [11] }
 * and is only accepted (when recording or recognising) if it starts from the rest pose
 * captured during calibration (an open hand, in any orientation).
 */
export const SignGloveProvider = ({ children }) => {
  const [device, setDevice] = useState(null);
  const [sensorValues, setSensorValues] = useState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [liveFrame, setLiveFrame] = useState(new Array(11).fill(0));
  const [normalizedFlex, setNormalizedFlex] = useState([0, 0, 0, 0, 0]);
  const [translation, setTranslation] = useState('OFFLINE');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [orientation, setOrientation] = useState({ pitch: 0, roll: 0, yaw: 0 });
  const [examples, setExamples] = useState([]);
  const [signModel, setSignModel] = useState(() => buildSignModel([]));
  const [recording, setRecording] = useState(null); // { label, speech }
  const [isMoving, setIsMoving] = useState(false);
  const [lastMatch, setLastMatch] = useState(null);     // result of the last recognition attempt
  const [lastCapture, setLastCapture] = useState(null); // { saved, reason, at } for the last movement while recording

  const lastTimestamp = useRef(Date.now());
  const currentRotation = useRef({ pitch: 0, roll: 0, yaw: 0 });
  const gyroOffsets = useRef({ x: 0, y: 0, z: 0 });
  const restPose = useRef(null);
  const flexMax = useRef([1, 1, 1, 1, 1]);
  const calibrationActive = useRef(false);
  const examplesRef = useRef([]);
  const modelRef = useRef(signModel);
  const recordingRef = useRef(null);
  const segmenter = useRef(createSegmenter());
  const recentFrames = useRef([]); // last 2 frames, for finger speed
  const movingRef = useRef(false);
  const holdUntil = useRef(0);
  const lastMatchRef = useRef(null);
  const movementStartedAt = useRef(0);
  const lastSaved = useRef(null); // { movement, at } of the last example saved while recording
  const strictnessRef = useRef({});

  const rebuildModel = useCallback(() => {
    modelRef.current = buildSignModel(examplesRef.current, strictnessRef.current);
    setSignModel(modelRef.current);
  }, []);

  const commitExamples = useCallback((updated) => {
    examplesRef.current = updated;
    setExamples(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    rebuildModel();
  }, [rebuildModel]);

  const commitStrictness = useCallback((updated) => {
    strictnessRef.current = updated;
    localStorage.setItem(STRICTNESS_KEY, JSON.stringify(updated));
    rebuildModel();
  }, [rebuildModel]);

  // Load from storage on mount (and drop data saved in older formats)
  useEffect(() => {
    OLD_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    strictnessRef.current = JSON.parse(localStorage.getItem(STRICTNESS_KEY) || '{}');
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) commitExamples(JSON.parse(saved));
  }, [commitExamples]);

  const setSignStrictness = useCallback((label, level) => {
    commitStrictness({ ...strictnessRef.current, [label]: level });
  }, [commitStrictness]);

  const startRecording = useCallback((label, speech) => {
    recordingRef.current = { label, speech };
    segmenter.current.reset();
    lastSaved.current = null;
    setLastCapture(null);
    setRecording({ label, speech });
  }, []);

  const stopRecording = useCallback(() => {
    recordingRef.current = null;
    setRecording(null);
  }, []);

  const deleteGesture = useCallback((label) => {
    const { [label]: _removed, ...rest } = strictnessRef.current;
    strictnessRef.current = rest;
    localStorage.setItem(STRICTNESS_KEY, JSON.stringify(rest));
    commitExamples(examplesRef.current.filter((e) => e.label !== label));
  }, [commitExamples]);

  // Saves the last finished movement (e.g. a real attempt that was rejected) as an example of
  // `label`, so the sign learns how it varies from one session to the next.
  const teachLastMovement = useCallback((label) => {
    const mv = lastMatchRef.current?.movement;
    if (!mv) return;
    const speech = modelRef.current.signs.get(label)?.speech || label.toLowerCase();
    commitExamples([...examplesRef.current, { label, speech, ...mv }]);
    lastMatchRef.current = { ...lastMatchRef.current, movement: null, taught: label };
    setLastMatch(lastMatchRef.current);
  }, [commitExamples]);

  const deleteAll = useCallback(() => {
    strictnessRef.current = {};
    localStorage.setItem(STRICTNESS_KEY, '{}');
    commitExamples([]);
  }, [commitExamples]);

  const handlePacket = (values, now) => {
    setSensorValues(values);
    setNormalizedFlex(values.slice(0, 5).map((v, i) => Math.min(v / flexMax.current[i], 1)));

    // Orientation (complementary filter)
    const dt = (now - lastTimestamp.current) / 1000.0;
    lastTimestamp.current = now;
    const [ax, ay, az] = [values[5], values[6], values[7]];
    const gx = (values[8] - gyroOffsets.current.x) * (Math.PI / 180);
    const gy = (values[9] - gyroOffsets.current.y) * (Math.PI / 180);
    const gz = (values[10] - gyroOffsets.current.z) * (Math.PI / 180);
    const accelPitch = Math.atan2(ay, Math.sqrt(ax * ax + az * az));
    const accelRoll = Math.atan2(-ax, az);
    const alpha = 0.98;
    currentRotation.current.pitch = alpha * (currentRotation.current.pitch + gx * dt) + (1 - alpha) * accelPitch;
    currentRotation.current.roll = alpha * (currentRotation.current.roll + gy * dt) + (1 - alpha) * accelRoll;
    currentRotation.current.yaw -= gz * dt;
    setOrientation({ ...currentRotation.current });

    // Motion segmentation
    const frame = frameFeatures(values, gyroOffsets.current);
    setLiveFrame(frame);
    const moving = isMovingNow(values, gyroOffsets.current, frame, recentFrames.current.length === 2 ? recentFrames.current[0] : null);
    recentFrames.current = [...recentFrames.current.slice(-1), frame];
    const movement = segmenter.current.push(frame, moving);
    if (!segmenter.current.isMoving && restPose.current) restPose.current = trackRest(restPose.current, frame);
    if (segmenter.current.isMoving !== movingRef.current) {
      movingRef.current = segmenter.current.isMoving;
      if (movingRef.current) movementStartedAt.current = now;
      setIsMoving(movingRef.current);
    }

    // Recording: every finished movement that starts from the rest pose becomes an example,
    // except the return to rest after a sign: it starts right where that sign ended, right after it
    const rec = recordingRef.current;
    if (rec) {
      if (movement) {
        let reason = null;
        if (!isRestPose(movement.startPose, restPose.current)) {
          reason = 'not-open';
        } else if (
          lastSaved.current
          && movementStartedAt.current - lastSaved.current.at <= RETURN_WINDOW_MS
          && startsWhereEnded(movement, lastSaved.current.movement)
        ) {
          reason = 'return';
        }
        const saved = !reason;
        if (saved) commitExamples([...examplesRef.current, { label: rec.label, speech: rec.speech, ...movement }]);
        lastSaved.current = saved ? { movement, at: now } : null;
        setLastCapture({ saved, reason, at: now });
      }
      setTranslation(movingRef.current ? `CAPTURING: ${rec.label}` : `RECORDING: ${rec.label}`);
      return;
    }

    // Recognition: once a movement that started from the rest pose has finished, the whole
    // movement is compared with every recorded sign, and a match is shown and spoken.
    if (movement && modelRef.current.signs.size && isRestPose(movement.startPose, restPose.current)) {
      const result = classifyMovement(movement, modelRef.current);
      if (result) {
        // Keep the movement so a rejected attempt can be taught as an example
        lastMatchRef.current = { ...result, movement };
        setLastMatch(lastMatchRef.current);
        if (result.matched) {
          setTranslation(result.label);
          holdUntil.current = now + DISPLAY_HOLD_MS;
          speakText(result.speech);
        }
      }
    }
    if (!movingRef.current && now >= holdUntil.current) setTranslation('READY');
  };

  const connect = async () => {
    try {
      setIsConnecting(true);
      await BleClient.initialize({ androidNeverForLocation: true });
      const selectedDevice = await BleClient.requestDevice({ services: [SERVICE_UUID] });

      await BleClient.connect(selectedDevice.deviceId, () => {
        setDevice(null);
        setTranslation('OFFLINE');
        calibrationActive.current = false;
        setIsCalibrating(false);
      });

      setDevice(selectedDevice);
      setIsCalibrating(true);
      calibrationActive.current = true;
      setTranslation('CONNECTING...');

      const samples = [];
      const calibrationDuration = 2000;
      let calibrationStartTime = null;

      await BleClient.startNotifications(
        selectedDevice.deviceId,
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        (value) => {
          const values = dataViewToText(value).split(',').map(Number);
          if (values.length < 11) return;
          const now = Date.now();

          if (!calibrationStartTime) {
            calibrationStartTime = now;
            setTranslation('CALIBRATING...');
          }

          // Phase 1: Calibration — hand open and still: gyro drift + the rest (open hand) pose
          if (calibrationActive.current && now - calibrationStartTime < calibrationDuration) {
            samples.push({ gx: values[8], gy: values[9], gz: values[10], pose: normalize(values) });
            for (let i = 0; i < 5; i++) {
              if (values[i] > flexMax.current[i]) flexMax.current[i] = values[i];
            }
            return;
          }

          // Phase 2: End calibration
          if (calibrationActive.current) {
            const count = samples.length || 1;
            gyroOffsets.current = {
              x: samples.reduce((a, b) => a + b.gx, 0) / count,
              y: samples.reduce((a, b) => a + b.gy, 0) / count,
              z: samples.reduce((a, b) => a + b.gz, 0) / count,
            };
            restPose.current = samples.length
              ? samples[0].pose.map((_, i) => samples.reduce((a, b) => a + b.pose[i], 0) / samples.length)
              : null;
            calibrationActive.current = false;
            setIsCalibrating(false);
            lastTimestamp.current = now;
            segmenter.current.reset();
            recentFrames.current = [];
            setTranslation('READY');
          }

          // Phase 3: Active stream
          handlePacket(values, now);
        }
      );
    } catch (error) {
      console.error('BLE Error:', error);
      setTranslation('ERROR');
      calibrationActive.current = false;
      setIsCalibrating(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    if (device) {
      await BleClient.disconnect(device.deviceId);
      setDevice(null);
      setTranslation('OFFLINE');
      setNormalizedFlex([0, 0, 0, 0, 0]);
      setOrientation({ pitch: 0, roll: 0, yaw: 0 });
      calibrationActive.current = false;
      setIsCalibrating(false);
      flexMax.current = [1, 1, 1, 1, 1];
      restPose.current = null;
      segmenter.current.reset();
      recentFrames.current = [];
      movingRef.current = false;
      setIsMoving(false);
    }
  };

  const value = {
    device, sensorValues, liveFrame, normalizedFlex, translation, orientation,
    isConnecting, isCalibrating, connect, disconnect,
    examples, signModel, recording, isRecording: !!recording, startRecording, stopRecording,
    deleteGesture, deleteAll, teachLastMovement, setSignStrictness, isMoving, lastMatch, lastCapture, speakText,
  };

  return <SignGloveContext.Provider value={value}>{children}</SignGloveContext.Provider>;
};

export const useGlove = () => useContext(SignGloveContext);
