#include "secrets.hpp"
#include "Honeycomb.hpp"
#include <ESP8266WiFi.h>

HoneycombClient honeycombClient("192.168.1.34", 5001, 1024, 5000);
Optional<bool, JsonDocument> variableUpdateFromServer;

void setup() {
  Serial.begin(9600);
  while(!Serial) delay(100);
  
  WiFi.begin(secrets::wifiSsid, secrets::wifiPassword);
  honeycombClient.variablesFromServer = &variableUpdateFromServer;
}

void loop() {
  delay(500);

  const auto wifiStatus = WiFi.status();
  if(wifiStatus != WL_CONNECTED){
    static unsigned long wifiErrorWaitedMs = 0;
    constexpr unsigned long wifiErrorWaitMs = 5000;
    constexpr unsigned long waitPeriodMs = 500;
    const bool completedFullWait = periodicWait(wifiErrorWaitedMs, wifiErrorWaitMs, waitPeriodMs, delay);
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
    const int honeycombInitError = honeycombClient.begin();
    if(honeycombInitError){
      Serial.print("Error: error initialising honeycomb websocket instance (HoneycombError ");
      Serial.print(honeycombInitError);
      Serial.println(')');
      return;
    }
    Serial.println("Connected to server.");
  }
  if(not honeycombClient.isAuthenticated()){
    const HoneycombError authError = honeycombClient.authenticate(secrets::deviceID, secrets::deviceSecret);
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

  const HoneycombError pingError = honeycombClient.pingServer();
  if(pingError != HoneycombError::ok){
    Serial.print("Error: error pinging honeycomb websocket instance (HoneycombError ");
    Serial.print((uint16_t)pingError);
    Serial.println(')');
    return;
  }
  Serial.println("Ping message sent successfully.");

  const HoneycombError honeycombReadError = honeycombClient.readIncomingMessages();
  if(honeycombReadError == HoneycombError::invalidAuthenticateRequest){
    Serial.println("Error: Authentication rejected from server.");
    return;
  }
  if(honeycombReadError == HoneycombError::connectionStale){
    Serial.println("Error: Stale server connection. Reconnecting...");
    return;
  }
  if(honeycombReadError != HoneycombError::ok){
    Serial.print("Error: Honeycomb read error (HoneycombError ");
    Serial.print((uint16_t)honeycombReadError);
    Serial.println(')');
    return;
  }

  Serial.println("Read OK.");
  
  if(!variableUpdateFromServer.errorCode) return;
  variableUpdateFromServer.errorCode = false;
  
  if(not variableUpdateFromServer.output["temperature_celsius"].isNull()){
    Serial.print("temperature_celsius: ");
    Serial.println(variableUpdateFromServer.output["temperature_celsius"].as<float>());
  }
  if(not variableUpdateFromServer.output["relative_humidity_percent"].isNull()){
    Serial.print("relative_humidity_percent: ");
    Serial.println(variableUpdateFromServer.output["relative_humidity_percent"].as<float>());
  }
}