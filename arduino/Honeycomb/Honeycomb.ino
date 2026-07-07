#include "secrets.hpp"
#include "Honeycomb.hpp"
#include <ESP8266WiFi.h>

HoneycombClient honeycombClient("192.168.1.34", 5001, 1024);
Optional<bool, JsonDocument> variableUpdateFromServer;

void setup() {
  Serial.begin(9600);
  while(!Serial) delay(100);
  
  WiFi.begin(secrets::wifiSsid, secrets::wifiPassword);
  honeycombClient.variablesFromServer = &variableUpdateFromServer;

  while(true){
    constexpr unsigned long retryMs = 500;

    const int honeycombInitError = honeycombClient.begin();
    if(!honeycombInitError) break;
    Serial.println("Fatal error: error initialising honeycomb websocket instance. Retrying...");
    Serial.println(honeycombInitError);
    delay(retryMs);
  }   
  honeycombClient.authenticate(6, "cookies");
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
  
  const HoneycombError honeycombReadError = honeycombClient.readIncomingMessages();
  if(honeycombReadError == HoneycombError::authenticate){
    Serial.println("Auth error.");
    honeycombClient.authenticate(6, "cookies");
    return;
  }
  if(honeycombReadError != HoneycombError::ok){
    Serial.print("Error: Honeycomb read error (HoneycombError ");
    Serial.print((uint16_t)honeycombReadError);
    Serial.println(')');
    return;
  }
  
  Serial.println(variableUpdateFromServer.errorCode);
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