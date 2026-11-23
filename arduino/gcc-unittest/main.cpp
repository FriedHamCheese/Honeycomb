#include "arduino_mock.hpp"
#include "../Honeycomb/Honeycomb.hpp"
#include "../Honeycomb/ArduinoJson.h"

#include <cassert>
#include <iostream>

using globalWebSocketClient = WebSocketClientMock<NetworkInterfaceMock, std::string>;

void test_read_incoming_messages();

void test_client_begin_typical(){
  std::cout << "test_client_begin_typical()...\n"; 
  SerialMock serial;
  
  const char* httpServerURL = "serverhttp.com";
  constexpr uint16_t httpServerPort = 65;
  constexpr uint16_t scratchpadBufferBytes = 1024;
  
  HoneycombClient<
    HttpClientMock<NetworkInterfaceMock, std::string>,
    WebSocketClientMock<NetworkInterfaceMock, std::string>,
    NetworkInterfaceMock, 
    std::string,
    SerialMock,
    scratchpadBufferBytes
  > client(
    httpServerURL, httpServerPort, 0, 0, " ", 0, serial
  );
  
  JsonDocument httpResponse;
  httpResponse["domain"] = "server.com";
  httpResponse["port"] = 5000;
  httpResponse["path"] = "/websocketapiv1";
  std::string stringifiedHttpResponse;
  const size_t responseLength = serializeJson(httpResponse, stringifiedHttpResponse);
  
  client.getHttpClient().getReturnValue = HTTP_SUCCESS;
  client.getHttpClient().responseStatusCodeValue = 200;
  client.getHttpClient().contentLengthValue = responseLength;
  client.getHttpClient().responseBodyValue = stringifiedHttpResponse;
  WebSocketClientMock<NetworkInterfaceMock, std::string>::beginReturnValue = HTTP_SUCCESS;
  
  assert(client.begin() == HoneycombError::ok);
  assert(client.getHttpClient().serverNameFromCtor == httpServerURL);
  assert(client.getHttpClient().serverPortFromCtor == httpServerPort);  
  assert(client.getHttpClient().pathFromGet == "/apiv1/device/webSocketURL");
  
  assert(globalWebSocketClient::serverNameFromCtor == httpResponse["domain"]);
  assert(globalWebSocketClient::serverPortFromCtor == httpResponse["port"]);
  assert(globalWebSocketClient::pathFromBegin == httpResponse["path"]);
  assert(client.isConnected());
  assert(!client.isAuthenticated());
}

void test_client_authenticate_typical(){
  std::cout << "test_client_authenticate_typical()...\n"; 

  SerialMock serial;
  NetworkInterfaceMock networkInterface;
  constexpr uint16_t scratchpadBufferBytes = 1024;
  
  const char* expectedMessageType = "auth";
  constexpr uint64_t expectedDeviceID = 15;
  const char* expectedDeviceSecret = "cookies";

  HoneycombClient<
    HttpClientMock<NetworkInterfaceMock, std::string>,
    WebSocketClientMock<NetworkInterfaceMock, std::string>,
    NetworkInterfaceMock, 
    std::string,
    SerialMock,
    scratchpadBufferBytes
  > client(
    " ", 0, 0, expectedDeviceID, expectedDeviceSecret, 0, serial
  );
  
  client.setConnected(true);
  globalWebSocketClient::beginMessageReturnValue = HTTP_SUCCESS;
  globalWebSocketClient::endMessageReturnValue = HTTP_SUCCESS;
  
  JsonDocument objectFromClient;
  constexpr int strcmp_equal = 0;
  assert(client.authenticate() == HoneycombError::ok);
  assert(globalWebSocketClient::messageTypeFromBeginMessage == TYPE_TEXT);
  assert(globalWebSocketClient::writeSizeValue < globalWebSocketClient::writeBufferBytes);
  assert(
    deserializeJson(
      objectFromClient, 
      globalWebSocketClient::writeBuffer,
      globalWebSocketClient::writeSizeValue
    ) == DeserializationError::Ok
  );  
  
  assert(objectFromClient["__messageType"].is<const char*>());
  assert(objectFromClient["deviceSecret"].is<const char*>());
  assert(objectFromClient["deviceID"].is<uint64_t>());
  
  assert(strcmp(objectFromClient["__messageType"].as<const char*>(), expectedMessageType) == strcmp_equal);   
  assert(strcmp(objectFromClient["deviceSecret"].as<const char*>(), expectedDeviceSecret) == strcmp_equal);    
  assert(objectFromClient["deviceID"].as<uint64_t>() == expectedDeviceID);      
} 

void test_client_ping_server_typical(){
  std::cout << "test_client_ping_server_typical()...\n";

  SerialMock serial;
  HoneycombClient<
    HttpClientMock<NetworkInterfaceMock, std::string>,
    WebSocketClientMock<NetworkInterfaceMock, std::string>,
    NetworkInterfaceMock,
    std::string,
    SerialMock,
    1024
  > client("serverhttp.com", 65, 0, 15, "cookies", 0, serial);

  client.setConnected(true);
  globalWebSocketClient::beginMessageReturnValue = HTTP_SUCCESS;
  globalWebSocketClient::endMessageReturnValue = HTTP_SUCCESS;

  assert(client.pingServer() == HoneycombError::ok);
  assert(globalWebSocketClient::messageTypeFromBeginMessage == TYPE_TEXT);
  assert(globalWebSocketClient::writeSizeValue == sizeof("{\"__messageType\":\"ping\"}") - 1);
  JsonDocument objectFromClient;
  assert(deserializeJson(
    objectFromClient,
    globalWebSocketClient::writeBuffer,
    globalWebSocketClient::writeSizeValue
  ) == DeserializationError::Ok);
  assert(objectFromClient["__messageType"].is<const char*>());
  assert(std::string(objectFromClient["__messageType"].as<const char*>()) == "ping");
}

void test_client_patch_datapoint_typical(){
  std::cout << "test_client_patch_datapoint_typical()...\n";

  SerialMock serial;
  HoneycombClient<
    HttpClientMock<NetworkInterfaceMock, std::string>,
    WebSocketClientMock<NetworkInterfaceMock, std::string>,
    NetworkInterfaceMock,
    std::string,
    SerialMock,
    1024
  > client("serverhttp.com", 65, 0, 15, "cookies", 0, serial);

  client.setConnected(true);
  client.setAuthenticated(true);
  globalWebSocketClient::beginMessageReturnValue = HTTP_SUCCESS;
  globalWebSocketClient::endMessageReturnValue = HTTP_SUCCESS;

  JsonDocument datapoint;
  datapoint["temperature_celsius"] = 23.5;
  datapoint["relative_humidity_percent"] = 41.25;
  datapoint["epoch_seconds"] = 1234.0;

  assert(client.patchDatapoint(datapoint.as<JsonObject>()) == HoneycombError::ok);
  assert(globalWebSocketClient::messageTypeFromBeginMessage == TYPE_TEXT);
  assert(globalWebSocketClient::writeSizeValue < globalWebSocketClient::writeBufferBytes);

  JsonDocument objectFromClient;
  assert(deserializeJson(
    objectFromClient,
    globalWebSocketClient::writeBuffer,
    globalWebSocketClient::writeSizeValue
  ) == DeserializationError::Ok);
  assert(objectFromClient["__messageType"].is<const char*>());
  assert(std::string(objectFromClient["__messageType"].as<const char*>()) == "patch");
  assert(objectFromClient["temperature_celsius"].as<float>() == 23.5f);
  assert(objectFromClient["relative_humidity_percent"].as<float>() == 41.25f);
  assert(objectFromClient["epoch_seconds"].as<float>() == 1234.0f);
}

int main(){
  std::cout << "Testing HoneycombClient... All tests succeeds if no assertion errors occur below." << std::endl;
  test_client_begin_typical();
  test_client_authenticate_typical();
  test_client_ping_server_typical();
  test_client_patch_datapoint_typical();
  test_read_incoming_messages();
  return 0;
}
