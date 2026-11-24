#include "arduino_mock.hpp"
#include "../Honeycomb/Honeycomb.hpp"

#include <cassert>
#include <cstring>
#include <iostream>
#include <string>

constexpr long int AUTH_SCRATCHPAD_BYTES = 1024;
using AuthTestWebSocket = WebSocketClientMock<NetworkInterfaceMock, std::string>;
using AuthTestClient = HoneycombClient<
  HttpClientMock<NetworkInterfaceMock, std::string>,
  AuthTestWebSocket,
  NetworkInterfaceMock,
  std::string,
  SerialMock,
  AUTH_SCRATCHPAD_BYTES
>;

static void prepareSuccessfulSend(){
  AuthTestWebSocket::beginMessageReturnValue = HTTP_SUCCESS;
  AuthTestWebSocket::endMessageReturnValue = HTTP_SUCCESS;
}

static void testAuthenticateTypical(){
  SerialMock serial;
  constexpr uint64_t expectedDeviceID = 15;
  const char* const expectedDeviceSecret = "cookies";
  AuthTestClient client("host", 80, 0, expectedDeviceID, expectedDeviceSecret, 0, serial);
  client.setConnected(true);
  prepareSuccessfulSend();

  assert(client.authenticate() == HoneycombError::ok);
  assert(AuthTestWebSocket::messageTypeFromBeginMessage == TYPE_TEXT);

  JsonDocument message;
  assert(AuthTestWebSocket::writeSizeValue < AuthTestWebSocket::writeBufferBytes);
  assert(deserializeJson(
    message,
    AuthTestWebSocket::writeBuffer,
    AuthTestWebSocket::writeSizeValue
  ) == DeserializationError::Ok);
  assert(message["__messageType"].is<const char*>());
  assert(message["deviceSecret"].is<const char*>());
  assert(message["deviceID"].is<uint64_t>());
  assert(std::strcmp(message["__messageType"].as<const char*>(), "auth") == 0);
  assert(std::strcmp(message["deviceSecret"].as<const char*>(), expectedDeviceSecret) == 0);
  assert(message["deviceID"].as<uint64_t>() == expectedDeviceID);
  assert(client.isConnected());
  assert(!client.isAuthenticated());
}

static void testAuthenticateWhenDisconnected(){
  SerialMock serial;
  AuthTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  prepareSuccessfulSend();

  assert(client.authenticate() == HoneycombError::disconnectedWebSocket);
  assert(!client.isConnected());
  assert(!client.isAuthenticated());
}

static void testAuthenticateBeginMessageFails(){
  SerialMock serial;
  AuthTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  prepareSuccessfulSend();
  AuthTestWebSocket::beginMessageReturnValue = -1;

  assert(client.authenticate() == HoneycombError::outboundMessageSend);
  assert(!client.isConnected());
  assert(!client.isAuthenticated());
}

static void testAuthenticateEndMessageFails(){
  SerialMock serial;
  AuthTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  prepareSuccessfulSend();
  AuthTestWebSocket::endMessageReturnValue = -1;

  assert(client.authenticate() == HoneycombError::outboundMessageSend);
  assert(!client.isConnected());
  assert(!client.isAuthenticated());
}

void test_client_authenticate(){
  std::cout << "test_client_authenticate(): typical\n";
  testAuthenticateTypical();
  std::cout << "test_client_authenticate(): disconnected state\n";
  testAuthenticateWhenDisconnected();
  std::cout << "test_client_authenticate(): beginMessage failure\n";
  testAuthenticateBeginMessageFails();
  std::cout << "test_client_authenticate(): endMessage failure\n";
  testAuthenticateEndMessageFails();
}
