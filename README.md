# SignGlove

A glove that recognizes trained signs from hand movement and speaks them aloud through a phone.

## How it works

1. **Sensing:** five flex sensors measure finger bend, and the Arduino's built-in motion sensor measures acceleration and rotation.
2. **Streaming:** the Arduino sends those 11 readings to an Android app over Bluetooth Low Energy, about 20 times a second.
3. **Finding a movement:** a movement starts when the fingers or hand start moving, and ends when the hand holds still for about 0.3 seconds. It only counts as a sign if it started from an open hand.
4. **Matching:** the app compares the whole movement with every recorded example using Dynamic Time Warping (DTW), which lines up two movements even when one was faster. The score also includes how different the final handshape is.
5. **Deciding:** each sign learns its own cutoff from how similar its recorded examples are to each other. If the best score is under that cutoff and clearly better than any other sign, the phone speaks the word.

The app's Space tab plots recorded signs and the live hand position in 3D. Eleven values need four 3D plots, with Flex 3 shown twice.

## Hardware

- Arduino Nano 33 BLE Sense Rev2
- 5 flex sensors
- 10 ohm resistor for each flex sensor
- Android phone

## What I did and how AI was used

I wrote much of the initial app code. That code is the code that I competed with at the competition and involved the static hand position tracking and KNN logic. Gemini was used to help debug the code, but all design decisions, hardware work, and testing were performed by me. Claude helped heavily in overhauling the project to use dynamic hand movements but all the previously mentioned items were also entirely done by me.

## Build journey

- **Static poses to movements.** The first version matched single snapshots of the hand using nearest neighbor. I rebuilt it so every sign is a movement, which also let the phone speak each word when the movement ends.
- **Rejecting non-signs.** I first scattered random "default" points through the data so that non-signs would match them. That felt like a hack, so I replaced it with a cutoff that each sign learns for itself.
- **Sensor drift.** Signs worked right after training, then failed later. Finger bend is now measured relative to where each movement starts, so a shifted baseline cancels out.
- **Signs triggering early.** The pointing sign would fire partway through a pinch sign. Recognition now waits for the whole movement to finish.
- **Loose board.** The motion sensor is on the Arduino, so a loosely mounted board corrupted the data. I secured it and re-recorded my signs.

## Current status

**Working:** recording custom signs, recognizing them on the glove, and speaking them aloud.

**Known limitations:**

- A pause in the middle of a sign can split it into two movements, which can make signs like MY and NAME trigger together.
- It reads one hand only, while many ASL signs use two hands, and it doesn't capture facial expressions or where the hand is relative to the body.
- It is trained to one person and only recognizes signs that person has recorded.
- Some cutoffs and settings are hand-tuned and may need adjusting for different signs.

## Running it

**Arduino**

1. In the Arduino IDE, install the `ArduinoBLE` and `Arduino_BMI270_BMM150` libraries.
2. Upload `firmware/sketch_dec27b.ino`. The IDE may ask to move it into a folder with the same name as the file.

**Android app**

```bash
npm install
npm run build
npx cap sync android
```

Then open the `android` folder in Android Studio and press Run with your phone connected.

**Using it**

The app doesn't ship with any signs, so you need to record your own.

1. Tap **Pair Glove**, then hold your hand open and still while it calibrates.
2. On the **Train** tab, enter a label and press **Start Recording**.
3. Start with an open hand, do the sign, and hold the final shape for a moment. Return to rest, pause for a second or so, and repeat 5 to 10 times.
4. Press **Stop**, then do the sign to test it.

## Code map

- `firmware/`: Arduino code that reads the sensors and sends the data over Bluetooth
- `src/context/gesture.js`: movement detection, DTW matching and per-sign cutoffs
- `src/context/SignGloveContext.jsx`: Bluetooth connection, calibration, recording, recognition and speech
- `src/pages/`: the Home, Diagnostics, Space and Train screens
- `src/components/SpacePlot.jsx`: the 3D plots
