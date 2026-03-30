#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// -------- WIFI CONFIG --------
const char* ssid = "kavs";
const char* password = "everyonewantsit";
const char* serverUrl = "http://172.21.59.78:7777/update";

// -------- MPU CONFIG --------
const int MPU_addr = 0x68;

// -------- SMOOTHING --------
float smoothPitch = 0;
float smoothRoll = 0;

void setup() {
  Serial.begin(115200);
  Wire.begin(19, 5);

  // Wake up MPU6050
  Wire.beginTransmission(MPU_addr);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission(true);

  // Connect WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected!");
  Serial.println(WiFi.localIP());
}

void loop() {
  // -------- READ MPU DATA --------
  Wire.beginTransmission(MPU_addr);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_addr, 14, true);

  int16_t ax = Wire.read() << 8 | Wire.read();
  int16_t ay = Wire.read() << 8 | Wire.read();
  int16_t az = Wire.read() << 8 | Wire.read();

  // Skip temp
  Wire.read(); Wire.read();

  int16_t gx = Wire.read() << 8 | Wire.read();
  int16_t gy = Wire.read() << 8 | Wire.read();
  int16_t gz = Wire.read() << 8 | Wire.read();

  // -------- CALCULATE ANGLES --------
  float roll = atan2(ay, az);
  float pitch = atan2(-ax, sqrt((float)ay * ay + (float)az * az));

  // Convert to degrees
  float rollDeg = roll * 180.0 / PI;
  float pitchDeg = pitch * 180.0 / PI;

  // -------- SMOOTHING FILTER --------
  smoothPitch = 0.9 * smoothPitch + 0.1 * pitchDeg;
  smoothRoll  = 0.9 * smoothRoll  + 0.1 * rollDeg;

  // -------- NORMALIZE ACCEL (OPTIONAL) --------
  float ax_g = ax / 16384.0;
  float ay_g = ay / 16384.0;
  float az_g = az / 16384.0;

  // -------- SEND DATA --------
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<300> doc;

    doc["pitch"] = smoothPitch;
    doc["roll"] = smoothRoll;

    doc["ax"] = ax_g;
    doc["ay"] = ay_g;
    doc["az"] = az_g;

    doc["gx"] = gx;
    doc["gy"] = gy;
    doc["gz"] = gz;

    doc["time"] = millis();

    // 👇 change this dynamically later from frontend if needed
    doc["test"] = "shoulder_abduction";

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);

    if (httpResponseCode > 0) {
      Serial.printf("Sent | Pitch: %.2f | Roll: %.2f\n", smoothPitch, smoothRoll);
    } else {
      Serial.println("Error sending data");
    }

    http.end();
  }

  delay(50); // ~20Hz
}
