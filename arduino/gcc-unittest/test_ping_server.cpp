#include "arduino_mock.hpp"
#include "../Honeycomb/Honeycomb.hpp"

#include <cassert>
#include <iostream>
#include <string>

using PingTestWebSocket = WebSocketClientMock<NetworkInterfaceMock, std::string>;
using PingTestClient = HoneycombClient<HttpClientMock<NetworkInterfaceMock, std::string>, PingTestWebSocket, NetworkInterfaceMock, std::string, SerialMock, 1024>;

static void prepareSuccessfulSend(){
  PingTestWebSocket::beginMessageReturnValue = HTTP_SUCCESS;
  PingTestWebSocket::endMessageReturnValue = HTTP_SUCCESS;
}

static void testTypical(){
  SerialMock serial;
  PingTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setConnected(true);
  prepareSuccessfulSend();
  assert(client.pingServer() == HoneycombError::ok);
  assert(PingTestWebSocket::messageTypeFromBeginMessage == TYPE_TEXT);
  JsonDocument message;
  assert(deserializeJson(message, PingTestWebSocket::writeBuffer, PingTestWebSocket::writeSizeValue) == DeserializationError::Ok);
  assert(message["__messageType"].is<const char*>());
  assert(std::string(message["__messageType"].as<const char*>()) == "ping");
  assert(client.isConnected());
  assert(!client.isAuthenticated());
}

static void testDisconnected(){
  SerialMock serial;
  PingTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setConnected(false);
  client.setAuthenticated(false);
  prepareSuccessfulSend();
  assert(client.pingServer() == HoneycombError::disconnectedWebSocket);
  assert(!client.isConnected() && !client.isAuthenticated());
}

static void testBeginMessageFailure(){
  SerialMock serial;
  PingTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  prepareSuccessfulSend();
  PingTestWebSocket::beginMessageReturnValue = -1;
  assert(client.pingServer() == HoneycombError::outboundMessageSend);
  assert(!client.isConnected() && !client.isAuthenticated());
}

static void testEndMessageFailure(){
  SerialMock serial;
  PingTestClient client("host", 80, 0, 15, "cookies", 0, serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  prepareSuccessfulSend();
  PingTestWebSocket::endMessageReturnValue = -1;
  assert(client.pingServer() == HoneycombError::outboundMessageSend);
  assert(!client.isConnected() && !client.isAuthenticated());
}

void test_client_ping_server(){
  std::cout << "test_client_ping_server():\n";
  std::cout << "\ttypical\n";
  testTypical();
  std::cout << "\tdisconnected state\n";
  testDisconnected();
  std::cout << "\tbeginMessage failure\n";
  testBeginMessageFailure();
  std::cout << "\tendMessage failure\n";
  testEndMessageFailure();
}
