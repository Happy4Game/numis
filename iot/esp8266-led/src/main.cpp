/*
 * PROJECT RESILIENCE-ALPHA — Objet connecté de signalisation (ESP8266)
 * Consigne additionnelle 1 : LED bicolore (rouge/vert) pilotée par le back-office.
 *
 * L'ESP8266 se connecte au point d'accès RESILIENCE-G<n> et expose un petit serveur HTTP.
 * Le service `auth` lui POST l'état d'authentification ; la LED le reflète.
 *
 *   POST /led   {"state":"green_blink"}      (ou GET /led?state=green_blink)
 *   GET  /                                   -> état courant + infos (debug)
 *
 * États (les TIMINGS sont gérés ici, pas par le serveur) :
 *   off          : éteinte
 *   green_blink  : vert clignotant (visage reconnu, en attente du mot de passe) — jusqu'au prochain ordre
 *   green_solid  : vert fixe 30 s puis extinction (mot de passe validé, back-office ouvert)
 *   red_blink    : rouge clignote 10 fois puis extinction (mot de passe faux -> reprise identification)
 *   red_solid    : rouge fixe 30 s puis extinction (visage non reconnu)
 *
 * Câblage (LED bicolore 3 broches, cathode commune) :
 *   D5 (GPIO14) --[330Ω]-- anode VERTE
 *   D6 (GPIO12) --[330Ω]-- anode ROUGE
 *   GND         --------- cathode commune
 */
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ArduinoJson.h>

// ----------------- À ADAPTER -----------------
const char* WIFI_SSID = "RESILIENCE-G<n>";     // point d'accès du groupe
const char* WIFI_PASS = "CHANGEZ_MOI";         // mot de passe du PA
// ---------------------------------------------

const uint8_t PIN_GREEN = D5;   // GPIO14
const uint8_t PIN_RED   = D6;   // GPIO12

const unsigned long BLINK_MS = 300;     // période de clignotement
const unsigned long SOLID_MS = 30000;   // durée des états "fixe" (30 s)
const int           RED_BLINKS = 10;    // nombre de clignotements rouges

enum LedState { OFF, GREEN_BLINK, GREEN_SOLID, RED_BLINK, RED_SOLID };
LedState      state      = OFF;
unsigned long stateStart = 0;
unsigned long lastToggle = 0;
bool          phase      = false;   // true = allumé (phase de clignotement)
int           blinkCount = 0;

ESP8266WebServer server(80);

void writeLeds(bool green, bool red) {
  digitalWrite(PIN_GREEN, green ? HIGH : LOW);
  digitalWrite(PIN_RED,   red   ? HIGH : LOW);
}

void setState(LedState s) {
  state = s;
  stateStart = millis();
  lastToggle = millis();
  phase = true;
  blinkCount = 0;
  // application immédiate pour les états fixes
  switch (s) {
    case OFF:         writeLeds(false, false); break;
    case GREEN_SOLID: writeLeds(true,  false); break;
    case RED_SOLID:   writeLeds(false, true);  break;
    case GREEN_BLINK: writeLeds(true,  false); break;
    case RED_BLINK:   writeLeds(false, true);  break;
  }
}

LedState parseState(const String& v) {
  if (v == "green_blink") return GREEN_BLINK;
  if (v == "green_solid") return GREEN_SOLID;
  if (v == "red_blink")   return RED_BLINK;
  if (v == "red_solid")   return RED_SOLID;
  return OFF;
}

const char* stateName() {
  switch (state) {
    case GREEN_BLINK: return "green_blink";
    case GREEN_SOLID: return "green_solid";
    case RED_BLINK:   return "red_blink";
    case RED_SOLID:   return "red_solid";
    default:          return "off";
  }
}

void handleLed() {
  String v;
  if (server.hasArg("state")) {
    v = server.arg("state");                 // GET /led?state=...
  } else if (server.hasArg("plain")) {
    StaticJsonDocument<128> doc;              // POST /led {"state":"..."}
    if (deserializeJson(doc, server.arg("plain")) == DeserializationError::Ok) {
      v = String((const char*)(doc["state"] | "off"));
    }
  }
  setState(parseState(v));
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", String("{\"state\":\"") + stateName() + "\"}");
}

void handleRoot() {
  String ip = WiFi.localIP().toString();
  server.send(200, "application/json",
    String("{\"device\":\"rsa-led\",\"state\":\"") + stateName() +
    "\",\"ip\":\"" + ip + "\",\"rssi\":" + WiFi.RSSI() + "}");
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connexion WiFi");
  // double clignotement d'attente
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    writeLeds(true, true); delay(120); writeLeds(false, false); delay(380);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nConnecté : %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\nWiFi indisponible (on continue, reconnexion auto).");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(PIN_RED, OUTPUT);
  setState(OFF);
  connectWifi();
  server.on("/", handleRoot);
  server.on("/led", handleLed);
  server.begin();
  Serial.println("Serveur HTTP démarré (port 80).");
}

void loop() {
  server.handleClient();

  // reconnexion WiFi best-effort
  static unsigned long lastWifiCheck = 0;
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiCheck > 5000) {
    lastWifiCheck = millis();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }

  unsigned long now = millis();
  switch (state) {
    case OFF:
      break;
    case GREEN_SOLID:
      if (now - stateStart >= SOLID_MS) setState(OFF);
      break;
    case RED_SOLID:
      if (now - stateStart >= SOLID_MS) setState(OFF);
      break;
    case GREEN_BLINK:
      if (now - lastToggle >= BLINK_MS) {
        lastToggle = now; phase = !phase;
        writeLeds(phase, false);
      }
      break;
    case RED_BLINK:
      if (now - lastToggle >= BLINK_MS) {
        lastToggle = now; phase = !phase;
        writeLeds(false, phase);
        if (phase) {                       // nouveau flash
          blinkCount++;
          if (blinkCount > RED_BLINKS) setState(OFF);
        }
      }
      break;
  }
}
