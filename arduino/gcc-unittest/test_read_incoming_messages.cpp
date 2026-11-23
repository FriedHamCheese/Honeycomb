#include "arduino_mock.hpp"
#include "../Honeycomb/Honeycomb.hpp"

#include <cassert>
#include <iostream>
#include <string>

using ReadMessagesTestClient = HoneycombClient<
  HttpClientMock<NetworkInterfaceMock, std::string>,
  WebSocketClientMock<NetworkInterfaceMock, std::string>,
  NetworkInterfaceMock,
  std::string,
  SerialMock,
  1024
>;
using ReadMessagesTestSocket = WebSocketClientMock<NetworkInterfaceMock, std::string>;

static void prepareMessage(const JsonDocument& message){
  ReadMessagesTestSocket::messageTypeReturnValue = TYPE_TEXT;
  std::string serializedMessage;
  serializeJson(message, serializedMessage);
  ReadMessagesTestSocket::readStringValue = serializedMessage;
  ReadMessagesTestSocket::parseMessageReturnValue = static_cast<int>(ReadMessagesTestSocket::readStringValue.size());
}

static void testPatchMessage(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, serial);
  client.setConnected(true);
  JsonDocument output;
  JsonDocument patchMessage;
  patchMessage["__messageType"] = "patch";
  patchMessage["temperature_celsius"] = 22.5;
  constexpr unsigned long messageTime = 1234;
  prepareMessage(patchMessage);

  const auto result = client.readIncomingMessages(&output, messageTime);
  assert(result.first == HoneycombError::ok);
  assert(result.second);
  assert(output["__messageType"] == "patch");
  assert(output["temperature_celsius"].as<float>() == 22.5f);
  assert(client.getMillisLastServerMessage() == messageTime);
}

static void testSuccessfulAuthMessage(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, serial);
  client.setConnected(true);
  JsonDocument authMessage;
  authMessage["__messageType"] = "auth";
  authMessage["success"] = true;
  prepareMessage(authMessage);

  const auto result = client.readIncomingMessages(nullptr, 2345);
  assert(result.first == HoneycombError::ok);
  assert(!result.second);
  assert(client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 2345);
}

static void testPongMessage(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, serial);
  client.setConnected(true);
  JsonDocument pongMessage;
  pongMessage["__messageType"] = "pong";
  prepareMessage(pongMessage);

  const auto result = client.readIncomingMessages(nullptr, 3456);
  assert(result.first == HoneycombError::ok);
  assert(!result.second);
  assert(client.getMillisLastServerMessage() == 3456);
}

static void testErrorMessageType(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, serial);
  client.setConnected(true);
  JsonDocument errorMessage;
  errorMessage["__messageType"] = "error";
  errorMessage["error"] = "bad message";
  prepareMessage(errorMessage);

  const auto result = client.readIncomingMessages(nullptr, 4567);
  assert(result.first == HoneycombError::messageFormError);
  assert(!result.second);
  assert(client.getMillisLastServerMessage() == 4567);
}

void test_read_incoming_messages(){
  std::cout << "\treadIncomingMessages: patch output\n";
  testPatchMessage();
  std::cout << "\treadIncomingMessages: successful auth\n";
  testSuccessfulAuthMessage();
  std::cout << "\treadIncomingMessages: pong\n";
  testPongMessage();
  std::cout << "\treadIncomingMessages: error type\n";
  testErrorMessageType();
}
