#include <ArduinoBLE.h>
#include <Arduino_BMI270_BMM150.h>

// 1. GLOBAL SCOPE DEFINITIONS
// Use the full 128-bit UUID format to ensure the app picks it up immediately
BLEService imuService("0000180c-0000-1000-8000-00805f9b34fb");  
BLEStringCharacteristic imuChar("00002a56-0000-1000-8000-00805f9b34fb", BLERead | BLENotify, 100);

void setup() {
  Serial.begin(9600);

  // Initialize IMU
  if (!IMU.begin()) {
    Serial.println("IMU init failed");
    while (1);
  }

  // Initialize BLE
  if (!BLE.begin()) {
    Serial.println("BLE init failed");
    while (1);
  }

  // --- NAME & ADVERTISING CONFIGURATION ---
  // This sets the name the phone displays
  BLE.setLocalName("SignGlove");
  BLE.setDeviceName("SignGlove"); // Set internal device name as well
  
  // Set the service to be advertised so the app filter finds it
  BLE.setAdvertisedService(imuService);
  
  // Add characteristics and services
  imuService.addCharacteristic(imuChar);
  BLE.addService(imuService);

  // Initial value
  imuChar.writeValue("0,0,0,0,0,0.0,0.0,0.0,0.0,0.0,0.0");
  
  // Start advertising
  BLE.advertise();
  
  Serial.println("SignGlove is now advertising...");
}

void loop() {
  // Listen for BLE events
  BLE.poll();

  // Only read and send data if a central device (your phone) is connected
  if (BLE.connected()) {
    float ax, ay, az;
    float gx, gy, gz;
    
    // Reading 5 flex sensors on Analog pins A0 through A4
    int f1 = analogRead(A0);
    int f2 = analogRead(A1);
    int f3 = analogRead(A2);
    int f4 = analogRead(A3);
    int f5 = analogRead(A4);

    // Check if IMU data is available
    if (IMU.accelerationAvailable() && IMU.gyroscopeAvailable()) {
      IMU.readAcceleration(ax, ay, az);
      IMU.readGyroscope(gx, gy, gz);

      // Create the CSV string: Flex1-5, AccelXYZ, GyroXYZ
      char buffer[100];
      // Note: %.1f limits decimal places to keep the string length manageable
      snprintf(buffer, sizeof(buffer),
               "%d,%d,%d,%d,%d,%.1f,%.1f,%.1f,%.1f,%.1f,%.1f",
               f1, f2, f3, f4, f5, ax, ay, az, gx, gy, gz);

      // Send to Phone
      imuChar.writeValue(buffer);

      // Debug to Serial Monitor
      Serial.println(buffer);
      
      delay(50); // 20Hz sampling rate is good for real-time translation
    }
  }
}