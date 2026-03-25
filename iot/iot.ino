#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- CONFIGURATION ---
const char* ssid = "kavs";
const char* password = "everyonewantsit";
const char* serverUrl = "http://172.21.59.78:7777/update"; 

const int MPU_addr = 0x68;

void setup() {
  Serial.begin(115200);
  Wire.begin(19, 5); 

  // Wake up MPU6050
  Wire.beginTransmission(MPU_addr);
  Wire.write(0x6B); 
  Wire.write(0);    
  Wire.endTransmission(true);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
}

void loop() {
  Wire.beginTransmission(MPU_addr);
  Wire.write(0x3B); // Starting register for Accel X
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_addr, 14, true); // Request 14 bytes (Accel, Temp, Gyro)

  // Read Accelerometer
  int16_t ax = Wire.read() << 8 | Wire.read();
  int16_t ay = Wire.read() << 8 | Wire.read();
  int16_t az = Wire.read() << 8 | Wire.read();
  
  // Skip Temperature (2 bytes)
  Wire.read(); Wire.read();

  // Read Gyroscope
  int16_t gx = Wire.read() << 8 | Wire.read();
  int16_t gy = Wire.read() << 8 | Wire.read();
  int16_t gz = Wire.read() << 8 | Wire.read();

  // Calculate Pitch & Roll in Radians (Used for 3D rotation)
  float roll = atan2(ay, az);
  float pitch = atan2(-ax, sqrt((float)ay * ay + (float)az * az));

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<300> doc;
    doc["pitch"] = pitch; 
    doc["roll"] = roll;
    doc["ax"] = ax; doc["ay"] = ay; doc["az"] = az;
    doc["gx"] = gx; doc["gy"] = gy; doc["gz"] = gz;

    String requestBody;
    serializeJson(doc, requestBody);
    int httpResponseCode = http.POST(requestBody);
    
    if (httpResponseCode > 0) {
      Serial.printf("Sent: %d | P: %.2f R: %.2f\n", httpResponseCode, pitch, roll);
    }
    http.end();
  }
  delay(50); // Increased frequency for smoother 3D animation
}
