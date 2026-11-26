#include "secrets.hpp"
#include "ArduinoJson.h"
#include "Honeycomb.hpp"

#include <ArduinoHttpClient.h>

#include <ESP8266WiFi.h>

const uint16_t honeycombNetworkBufferBytes = 1024;
const uint16_t msBeforeServerStale = 5000;
HoneycombClient<
  HttpClient, WebSocketClient, WiFiClient, String, decltype(Serial), honeycombNetworkBufferBytes
> honeycombClient(
  secrets::serverAddress, 
  secrets::serverPort, 
  msBeforeServerStale, 
  secrets::deviceID, 
  secrets::deviceSecret,
  millis()
);
JsonDocument variableUpdateFromServer;
String errorMessageFromServer;
JsonDocument newDatapointToServer;

void setup() {
  Serial.begin(9600);
  while(!Serial) delay(100);
  
  WiFi.begin(secrets::wifiSsid, secrets::wifiPassword);
  honeycombClient.begin();
}

void loop() {
  delay(3500);

  const auto wifiStatus = WiFi.status();
  if(wifiStatus != WL_CONNECTED){
    static unsigned long wifiErrorWaitedMs = 0;
    constexpr unsigned long wifiErrorWaitMs = 5000;
    constexpr unsigned long waitPeriodMs = 500;
    const bool completedFullWait = Honeycomb::periodicWait(wifiErrorWaitedMs, wifiErrorWaitMs, waitPeriodMs, delay);
    if(!completedFullWait) return;
    
    switch(wifiStatus){
      case WL_NO_SHIELD:
        Serial.println("Fatal error: No WiFi interfacing equipment.");
        return;
      case WL_NO_SSID_AVAIL:
        Serial.println("Error: No WiFi access points.");
        return;
      case WL_CONNECT_FAILED:
        Serial.println("Error: Failed to connect to specified WiFi access point.");
        return;
      case WL_CONNECTION_LOST:
        Serial.println("Error: Lost connection to WiFi access point, will retry.");
        return;
      case WL_DISCONNECTED:
        Serial.println("Error: Lost connection to WiFi access point, will retry.");
        return;
      default:
        Serial.println("WiFi");
    }
  }

  if(not honeycombClient.isConnected()){
    const HoneycombError honeycombInitError = honeycombClient.begin();
    if(honeycombInitError != HoneycombError::ok){
      Serial.print("Error: error initialising honeycomb websocket instance (HoneycombError ");
      Serial.print((int)honeycombInitError);
      Serial.println(')');
      return;
    }
    Serial.println("Connected to server.");
  }
  if(not honeycombClient.isAuthenticated()){
    const HoneycombError authError = honeycombClient.authenticate();
    if(authError != HoneycombError::ok){
      Serial.print("Error: error authenticating honeycomb websocket instance (HoneycombError ");
      Serial.print((uint16_t)authError);
      Serial.println(')');
      return;
    }
    constexpr unsigned long ms_for_auth_processing = 500;
    delay(ms_for_auth_processing);
    Serial.println("Authentication sent successfully.");
  }

  //Hey maybe add periodic wait but only for this so we don't flood server with pings every 2 seconds
  const HoneycombError pingError = honeycombClient.pingServer();
  if(pingError != HoneycombError::ok){
    Serial.print("Error: error pinging honeycomb websocket instance (HoneycombError ");
    Serial.print((uint16_t)pingError);
    Serial.println(')');
    return;
  }
  Serial.println("Ping message sent successfully.");

  const Honeycomb::Pair<HoneycombError, Honeycomb::IncomingMessage> honeycombReadResult = honeycombClient.readIncomingMessages(&variableUpdateFromServer, &errorMessageFromServer, millis());
  if(honeycombReadResult.first == HoneycombError::connectionStale){
    Serial.println("Error: Stale server connection. Reconnecting...");
    return;
  }
  if(honeycombReadResult.first != HoneycombError::ok){
    Serial.print("Error: Honeycomb read error (HoneycombError ");
    Serial.print((uint16_t)honeycombReadResult.first);
    Serial.println(')');
    
    if(honeycombReadResult.second == Honeycomb::IncomingMessage::errorFromServer){
      Serial.print("Error message: ");
      Serial.println(errorMessageFromServer);
    }
    return;
  }
  Serial.println("Read OK.");
  if(honeycombReadResult.second == Honeycomb::IncomingMessage::objectFromServer){
    if(variableUpdateFromServer["temperature_celsius"].is<float>()){
      Serial.print("temperature_celsius: ");
      Serial.println(variableUpdateFromServer["temperature_celsius"].as<float>());
    }
    if(variableUpdateFromServer["relative_humidity_percent"].is<float>()){
      Serial.print("relative_humidity_percent: ");
      Serial.println(variableUpdateFromServer["relative_humidity_percent"].as<float>());
    }
  }

  constexpr bool patchToServer = false;
  if(patchToServer){
    newDatapointToServer["temperature_celsius"] = 27.0;
    newDatapointToServer["relative_humidity_percent"] = 80.0;
    newDatapointToServer["notes"] = "Ice cream";
    const HoneycombError honeycombPatchError = honeycombClient.patchDatapoint(newDatapointToServer.as<JsonObject>());
    if(honeycombPatchError != HoneycombError::ok){
      Serial.print("Error: Honeycomb patch error (HoneycombError ");
      Serial.print((uint16_t)honeycombPatchError);
      Serial.println(')');
    }
  }
}
