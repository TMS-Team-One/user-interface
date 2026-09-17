// ProbePilot voltage meter: streams the four ADS1115 channels over serial.
//
// Runs on the Arduino UNO R4 Minima with an ADS1115 on I2C. The line format is
// what src/voltage_measurement/ads1115.py on the host parses; keep it unchanged:
//   Kanal <channel>: <raw> | <volts> V
// Error lines the host recognises:
//   ADS1115 not connected
//   ADS1115 initialization failed
//   Fehler beim Lesen von Kanal <channel>
//
// This code is only ever compiled for and executed on the Arduino itself.

#include <Adafruit_ADS1X15.h>
#include <Wire.h>

static const unsigned long BAUD_RATE = 115200;
static const uint8_t CHANNELS = 4;
static const unsigned long CYCLE_DELAY_MS = 50;

Adafruit_ADS1115 ads;
bool adsReady = false;

void setup() {
  Serial.begin(BAUD_RATE);
  while (!Serial) {
    ;  // wait for the USB serial port
  }
  Wire.begin();
  // +/- 6.144 V full scale: a 5 V probe signal stays in range.
  ads.setGain(GAIN_TWOTHIRDS);
  adsReady = ads.begin();
  if (!adsReady) {
    Serial.println("ADS1115 initialization failed");
  }
}

void loop() {
  if (!adsReady) {
    Serial.println("ADS1115 not connected");
    delay(1000);
    adsReady = ads.begin();
    return;
  }
  // The host pairs CH0 with the following CH1 reading, so scan in order.
  for (uint8_t channel = 0; channel < CHANNELS; channel++) {
    int16_t raw = ads.readADC_SingleEnded(channel);
    if (raw == 0 && !ads.conversionComplete()) {
      Serial.print("Fehler beim Lesen von Kanal ");
      Serial.println(channel);
      continue;
    }
    Serial.print("Kanal ");
    Serial.print(channel);
    Serial.print(": ");
    Serial.print(raw);
    Serial.print(" | ");
    Serial.print(ads.computeVolts(raw), 4);
    Serial.println(" V");
  }
  delay(CYCLE_DELAY_MS);
}
