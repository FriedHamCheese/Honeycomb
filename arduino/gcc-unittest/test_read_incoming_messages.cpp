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

static constexpr unsigned long readMessagesTimeoutMs = 10000;

static void prepareMessage(const JsonDocument& message){
  ReadMessagesTestSocket::messageTypeReturnValue = TYPE_TEXT;
  std::string serializedMessage;
  serializeJson(message, serializedMessage);
  ReadMessagesTestSocket::readStringValue = serializedMessage;
  ReadMessagesTestSocket::parseMessageReturnValue = static_cast<int>(ReadMessagesTestSocket::readStringValue.size());
}

static void prepareRawMessage(const std::string& message){
  ReadMessagesTestSocket::messageTypeReturnValue = TYPE_TEXT;
  ReadMessagesTestSocket::readStringValue = message;
  ReadMessagesTestSocket::parseMessageReturnValue = static_cast<int>(message.size());
}

static void testDisconnected(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(false);
  client.setAuthenticated(true);
  ReadMessagesTestSocket::parseMessageReturnValue = 99;

  const auto result = client.readIncomingMessages(nullptr, nullptr, 1000);
  assert(result.first == HoneycombError::disconnectedWebSocket);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(not client.isConnected());
  assert(client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 0);
}

static void testNoMessageBeforeTimeout(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, readMessagesTimeoutMs, 1, "secret", 0, &serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  constexpr unsigned long messageTime = 1000;
  ReadMessagesTestSocket::parseMessageReturnValue = 0;

  const auto result = client.readIncomingMessages(nullptr, nullptr, messageTime);
  assert(result.first == HoneycombError::ok);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(client.isConnected());
  assert(client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 0);
}

static void testStaleConnection(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, readMessagesTimeoutMs, 1, "secret", 0, &serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  ReadMessagesTestSocket::parseMessageReturnValue = 0;

  const auto result = client.readIncomingMessages(nullptr, nullptr, readMessagesTimeoutMs);
  assert(result.first == HoneycombError::connectionStale);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(not client.isConnected());
  assert(not client.isAuthenticated());
}

static void testMessageTooLarge(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  ReadMessagesTestSocket::parseMessageReturnValue = 1025;

  const auto result = client.readIncomingMessages(nullptr, nullptr, 1234);
  assert(result.first == HoneycombError::maxSize);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(client.getMillisLastServerMessage() == 1234);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
}

static void testNonTextMessage(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  ReadMessagesTestSocket::messageTypeReturnValue = TYPE_BINARY;
  ReadMessagesTestSocket::parseMessageReturnValue = 1;

  const auto result = client.readIncomingMessages(nullptr, nullptr, 1234);
  assert(result.first == HoneycombError::receivedMessageNotText);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(client.getMillisLastServerMessage() == 1234);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
}

static void testInvalidJson(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  prepareRawMessage("{invalid json");

  const auto result = client.readIncomingMessages(nullptr, nullptr, 1234);
  assert(result.first == HoneycombError::jsonInvalidInput);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(client.getMillisLastServerMessage() == 1234);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
}

static void testMissingMessageType(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  JsonDocument messageWithoutType;
  messageWithoutType["payload"] = "value";
  prepareMessage(messageWithoutType);

  const auto result = client.readIncomingMessages(nullptr, nullptr, 1234);
  assert(result.first == HoneycombError::unknownReceivedMessageType);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 1234);
}

static void testUnknownMessageType(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  JsonDocument unknownMessage;
  unknownMessage["__messageType"] = "unknown";
  prepareMessage(unknownMessage);

  const auto result = client.readIncomingMessages(nullptr, nullptr, 1234);
  assert(result.first == HoneycombError::unknownReceivedMessageType);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 1234);
}

static void testSuccessfulAuthMessage(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  JsonDocument authMessage;
  authMessage["__messageType"] = "auth";
  authMessage["success"] = true;
  prepareMessage(authMessage);

  const auto result = client.readIncomingMessages(nullptr, nullptr, 2345);
  assert(result.first == HoneycombError::ok);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(client.isAuthenticated());
  assert(client.isConnected());
  assert(client.getMillisLastServerMessage() == 2345);
}

static void testAuthErrorMessage(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  JsonDocument authMessage;
  authMessage["__messageType"] = "auth";
  authMessage["error"] = "authentication rejected";
  prepareMessage(authMessage);
  std::string errorFromServer;

  const auto result = client.readIncomingMessages(nullptr, &errorFromServer, 1234);
  assert(result.first == HoneycombError::invalidAuthenticateRequest);
  assert(result.second == Honeycomb::IncomingMessage::errorFromServer);
  assert(errorFromServer == "authentication rejected");
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 1234);
}

static void testAuthMissingSuccess(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  JsonDocument authMessage;
  authMessage["__messageType"] = "auth";
  prepareMessage(authMessage);

  const auto result = client.readIncomingMessages(nullptr, nullptr, 1234);
  assert(result.first == HoneycombError::unspecifiedAuthSuccess);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 1234);
}

static void testAuthRejectedByServer(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  client.setAuthenticated(true);
  JsonDocument authMessage;
  authMessage["__messageType"] = "auth";
  authMessage["success"] = false;
  prepareMessage(authMessage);

  const auto result = client.readIncomingMessages(nullptr, nullptr, 1234);
  assert(result.first == HoneycombError::otherConnectedDeviceHasSameID);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 1234);
}

static void testPatchMessage(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  JsonDocument output;
  JsonDocument patchMessage;
  patchMessage["__messageType"] = "patch";
  patchMessage["temperature_celsius"] = 22.5;
  constexpr unsigned long messageTime = 1234;
  prepareMessage(patchMessage);

  std::string errorFromServer = "unchanged";
  const auto result = client.readIncomingMessages(&output, &errorFromServer, messageTime);
  assert(result.first == HoneycombError::ok);
  assert(result.second == Honeycomb::IncomingMessage::objectFromServer);
  assert(output["__messageType"] == "patch");
  assert(output["temperature_celsius"].as<float>() == 22.5f);
  assert(errorFromServer == "unchanged");
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == messageTime);
}

static void testPatchMessageWithNullOutput(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  JsonDocument patchMessage;
  patchMessage["__messageType"] = "patch";
  patchMessage["temperature_celsius"] = 22.5;
  prepareMessage(patchMessage);

  const auto result = client.readIncomingMessages(nullptr, nullptr, 2345);
  assert(result.first == HoneycombError::ok);
  assert(result.second == Honeycomb::IncomingMessage::objectFromServer);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 2345);
}

static void testPongMessage(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  JsonDocument pongMessage;
  pongMessage["__messageType"] = "pong";
  prepareMessage(pongMessage);

  const auto result = client.readIncomingMessages(nullptr, nullptr, 3456);
  assert(result.first == HoneycombError::ok);
  assert(result.second == Honeycomb::IncomingMessage::noMessage);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 3456);
}

static void testErrorMessageType(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  JsonDocument errorMessage;
  errorMessage["__messageType"] = "error";
  errorMessage["error"] = "bad message";
  prepareMessage(errorMessage);

  std::string errorFromServer;
  const auto result = client.readIncomingMessages(nullptr, &errorFromServer, 4567);
  assert(result.first == HoneycombError::messageFormError);
  assert(result.second == Honeycomb::IncomingMessage::errorFromServer);
  assert(errorFromServer == "bad message");
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 4567);
}

static void testErrorMessageWithNullOutput(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  JsonDocument errorMessage;
  errorMessage["__messageType"] = "error";
  errorMessage["error"] = "bad message";
  prepareMessage(errorMessage);

  const auto result = client.readIncomingMessages(nullptr, nullptr, 4568);
  assert(result.first == HoneycombError::messageFormError);
  assert(result.second == Honeycomb::IncomingMessage::errorFromServer);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 4568);
}

static void testPatchErrorMessageType(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  JsonDocument patchErrorMessage;
  patchErrorMessage["__messageType"] = "patcherr";
  patchErrorMessage["error"] = "datapoint rejected";
  prepareMessage(patchErrorMessage);

  std::string errorFromServer;
  const auto result = client.readIncomingMessages(nullptr, &errorFromServer, 5678);
  assert(result.first == HoneycombError::patchError);
  assert(result.second == Honeycomb::IncomingMessage::errorFromServer);
  assert(errorFromServer == "datapoint rejected");
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 5678);
}

static void testPatchErrorMessageWithNullOutput(){
  SerialMock serial;
  ReadMessagesTestClient client("host", 80, 0, 1, "secret", 0, &serial);
  client.setConnected(true);
  JsonDocument patchErrorMessage;
  patchErrorMessage["__messageType"] = "patcherr";
  patchErrorMessage["error"] = "datapoint rejected";
  prepareMessage(patchErrorMessage);

  const auto result = client.readIncomingMessages(nullptr, nullptr, 5679);
  assert(result.first == HoneycombError::patchError);
  assert(result.second == Honeycomb::IncomingMessage::errorFromServer);
  assert(client.isConnected());
  assert(not client.isAuthenticated());
  assert(client.getMillisLastServerMessage() == 5679);
}

void test_read_incoming_messages(){
  std::cout << "test_read_incoming_messages():\n";
  std::cout << "\tpatch output\n";
  testPatchMessage();
  std::cout << "\tpatch with null output\n";
  testPatchMessageWithNullOutput();
  std::cout << "\tsuccessful auth\n";
  testSuccessfulAuthMessage();
  std::cout << "\tpong\n";
  testPongMessage();
  std::cout << "\terror type\n";
  testErrorMessageType();
  std::cout << "\terror with null output\n";
  testErrorMessageWithNullOutput();
  std::cout << "\tpatch error text\n";
  testPatchErrorMessageType();
  std::cout << "\tpatch error with null output\n";
  testPatchErrorMessageWithNullOutput();
  std::cout << "\tdisconnected\n";
  testDisconnected();
  std::cout << "\tno message before timeout\n";
  testNoMessageBeforeTimeout();
  std::cout << "\tstale connection\n";
  testStaleConnection();
  std::cout << "\tmessage too large\n";
  testMessageTooLarge();
  std::cout << "\tnon-text message\n";
  testNonTextMessage();
  std::cout << "\tinvalid JSON\n";
  testInvalidJson();
  std::cout << "\tmissing message type\n";
  testMissingMessageType();
  std::cout << "\tunknown message type\n";
  testUnknownMessageType();
  std::cout << "\tauth error message\n";
  testAuthErrorMessage();
  std::cout << "\tauth missing success\n";
  testAuthMissingSuccess();
  std::cout << "\tauth rejected\n";
  testAuthRejectedByServer();
}
