#include "arduino_mock.hpp"
#include "../Honeycomb/Honeycomb.hpp"

#include <cassert>
#include <iostream>
#include <string>

using PatchTestWebSocket = WebSocketClientMock<NetworkInterfaceMock, std::string>;
using PatchTestClient = HoneycombClient<HttpClientMock<NetworkInterfaceMock, std::string>, PatchTestWebSocket, NetworkInterfaceMock, std::string, SerialMock, 1024>;

static void prepareSuccessfulSend(){
  PatchTestWebSocket::beginMessageReturnValue = HTTP_SUCCESS;
  PatchTestWebSocket::endMessageReturnValue = HTTP_SUCCESS;
}

static JsonDocument makeDatapoint(){
  JsonDocument datapoint;
  datapoint["temperature_celsius"] = 23.5;
  datapoint["relative_humidity_percent"] = 41.25;
  datapoint["epoch_seconds"] = 1234.0;
  return datapoint;
}

static void testTypical(){
  SerialMock serial;
  PatchTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  prepareSuccessfulSend();
  JsonDocument datapoint = makeDatapoint();
  assert(client.patchDatapoint(datapoint.as<JsonObject>()) == HoneycombError::ok);
  assert(PatchTestWebSocket::messageTypeFromBeginMessage == TYPE_TEXT);
  assert(PatchTestWebSocket::writeSizeValue < PatchTestWebSocket::writeBufferBytes);
  JsonDocument sentMessage;
  assert(deserializeJson(sentMessage, PatchTestWebSocket::writeBuffer, PatchTestWebSocket::writeSizeValue) == DeserializationError::Ok);
  assert(sentMessage["__messageType"].is<const char*>());
  assert(std::string(sentMessage["__messageType"].as<const char*>()) == "patch");
  assert(sentMessage["temperature_celsius"].as<float>() == 23.5f);
  assert(sentMessage["relative_humidity_percent"].as<float>() == 41.25f);
  assert(sentMessage["epoch_seconds"].as<float>() == 1234.0f);
  assert(client.isConnected() && client.isAuthenticated());
}

static void testDisconnected(){
  SerialMock serial;
  PatchTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setAuthenticated(true);
  JsonDocument datapoint = makeDatapoint();
  assert(client.patchDatapoint(datapoint.as<JsonObject>()) == HoneycombError::disconnectedWebSocket);
  assert(!client.isConnected() && client.isAuthenticated());
}

static void testUnauthenticated(){
  SerialMock serial;
  PatchTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setConnected(true);
  JsonDocument datapoint = makeDatapoint();
  assert(client.patchDatapoint(datapoint.as<JsonObject>()) == HoneycombError::notAuthenticated);
  assert(client.isConnected() && !client.isAuthenticated());
}

static void testBeginMessageFailure(){
  SerialMock serial;
  PatchTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  prepareSuccessfulSend();
  PatchTestWebSocket::beginMessageReturnValue = -1;
  JsonDocument datapoint = makeDatapoint();
  assert(client.patchDatapoint(datapoint.as<JsonObject>()) == HoneycombError::outboundMessageSend);
  assert(!client.isConnected() && !client.isAuthenticated());
}

static void testEndMessageFailure(){
  SerialMock serial;
  PatchTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  prepareSuccessfulSend();
  PatchTestWebSocket::endMessageReturnValue = -1;
  JsonDocument datapoint = makeDatapoint();
  assert(client.patchDatapoint(datapoint.as<JsonObject>()) == HoneycombError::outboundMessageSend);
  assert(!client.isConnected() && !client.isAuthenticated());
}

void test_client_patch_datapoint(){
  std::cout << "test_client_patch_datapoint(): typical\n"; testTypical();
  std::cout << "test_client_patch_datapoint(): disconnected state\n"; testDisconnected();
  std::cout << "test_client_patch_datapoint(): unauthenticated state\n"; testUnauthenticated();
  std::cout << "test_client_patch_datapoint(): beginMessage failure\n"; testBeginMessageFailure();
  std::cout << "test_client_patch_datapoint(): endMessage failure\n"; testEndMessageFailure();
}
