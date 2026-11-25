#include "arduino_mock.hpp"
#include "../Honeycomb/Honeycomb.hpp"

#include <cassert>
#include <iostream>
#include <string>

constexpr long int SCRATCHPAD_BUFFER_BYTES = 1024;
using BeginTestHttpClient = HttpClientMock<NetworkInterfaceMock, std::string>;
using BeginTestWebSocket = WebSocketClientMock<NetworkInterfaceMock, std::string>;
using BeginTestClient = HoneycombClient<
  BeginTestHttpClient,
  BeginTestWebSocket,
  NetworkInterfaceMock,
  std::string,
  SerialMock,
  SCRATCHPAD_BUFFER_BYTES
>;

static SerialMock serial;

static void prepareResponse(BeginTestClient& client, const std::string& body){
  client.getHttpClient().getReturnValue = HTTP_SUCCESS;
  client.getHttpClient().responseStatusCodeValue = 200;
  client.getHttpClient().contentLengthValue = static_cast<long>(body.size());
  client.getHttpClient().responseBodyValue = body;
  BeginTestWebSocket::beginReturnValue = HTTP_SUCCESS;
}

static void assertDisconnectedAndUnauthenticated(const BeginTestClient& client){
  assert(!client.isConnected());
  assert(!client.isAuthenticated());
}

static std::string validResponseBody(){
  JsonDocument response;
  response["domain"] = "server.com";
  response["port"] = 5000;
  response["path"] = "/websocketapiv1";
  std::string body;
  serializeJson(response, body);
  return body;
}

static void testBeginTypical(){
  const char* const serverURL = "serverhttp.com";
  constexpr uint16_t serverPort = 65;
  BeginTestClient client(serverURL, serverPort, 0, 0, "", 0, serial);
  prepareResponse(client, validResponseBody());

  assert(client.begin() == HoneycombError::ok);
  assert(client.getHttpClient().serverNameFromCtor == serverURL);
  assert(client.getHttpClient().serverPortFromCtor == serverPort);
  assert(client.getHttpClient().pathFromGet == "/apiv1/device/webSocketURL");
  assert(BeginTestWebSocket::serverNameFromCtor == "server.com");
  assert(BeginTestWebSocket::serverPortFromCtor == 5000);
  assert(BeginTestWebSocket::pathFromBegin == "/websocketapiv1");
  assert(client.isConnected());
  assert(!client.isAuthenticated());
}

static void testHttpConnectionFailed(){
  BeginTestClient client("host", 80, 0, 0, "", 0, serial);
  prepareResponse(client, validResponseBody());
  client.getHttpClient().getReturnValue = HTTP_ERROR_CONNECTION_FAILED;
  assert(client.begin() == HoneycombError::ArduinoHttpClientConnectionFailed);
  assertDisconnectedAndUnauthenticated(client);
}

static void testHttpStatusNot200(){
  BeginTestClient client("host", 80, 0, 0, "", 0, serial);
  prepareResponse(client, validResponseBody());
  client.getHttpClient().responseStatusCodeValue = 503;
  assert(client.begin() == HoneycombError::httpInvalidServerResponseStatus);
  assertDisconnectedAndUnauthenticated(client);
}

static void testResponseAtScratchpadLimit(){
  BeginTestClient client("host", 80, 0, 0, "", 0, serial);
  std::string body = validResponseBody();
  assert(body.size() <= SCRATCHPAD_BUFFER_BYTES);
  body.append(SCRATCHPAD_BUFFER_BYTES - body.size(), ' ');
  prepareResponse(client, body);
  assert(client.begin() == HoneycombError::ok);
  assert(client.isConnected());
  assert(!client.isAuthenticated());
}

static void testResponseOneByteOverScratchpadLimit(){
  BeginTestClient client("host", 80, 0, 0, "", 0, serial);
  std::string body = validResponseBody();
  body.append(SCRATCHPAD_BUFFER_BYTES + 1 - body.size(), ' ');
  prepareResponse(client, body);
  assert(client.begin() == HoneycombError::maxSize);
  assertDisconnectedAndUnauthenticated(client);
}

static void testEmptyResponseBody(){
  BeginTestClient client("host", 80, 0, 0, "", 0, serial);
  prepareResponse(client, "");
  assert(client.begin() == HoneycombError::jsonEmptyInput);
  assertDisconnectedAndUnauthenticated(client);
}

static void testBrokenJsonSyntax(){
  BeginTestClient client("host", 80, 0, 0, "", 0, serial);
  prepareResponse(client, "{broken json}");
  assert(client.begin() == HoneycombError::jsonInvalidInput);
  assertDisconnectedAndUnauthenticated(client);
}

static void testMissingExpectedAttribute(){
  BeginTestClient client("host", 80, 0, 0, "", 0, serial);
  JsonDocument response;
  response["domain"] = "server.com";
  response["port"] = 5000;
  std::string body;
  serializeJson(response, body);
  prepareResponse(client, body);
  assert(client.begin() == HoneycombError::httpInvalidServerResponseBody);
  assertDisconnectedAndUnauthenticated(client);
}

static void testAttributeWrongType(){
  BeginTestClient client("host", 80, 0, 0, "", 0, serial);
  JsonDocument response;
  response["domain"] = "server.com";
  response["port"] = "5000";
  response["path"] = "/ws";
  std::string body;
  serializeJson(response, body);
  prepareResponse(client, body);
  assert(client.begin() == HoneycombError::httpInvalidServerResponseBody);
  assertDisconnectedAndUnauthenticated(client);
}

static void testWebSocketBeginFails(){
  BeginTestClient client("host", 80, 0, 0, "", 0, serial);
  prepareResponse(client, validResponseBody());
  BeginTestWebSocket::beginReturnValue = -1;
  assert(client.begin() == HoneycombError::disconnectedWebSocket);
  assertDisconnectedAndUnauthenticated(client);
}

void test_client_begin(){
  std::cout << "test_client_begin():\n";
  std::cout << "\tpositive response\n";
  testBeginTypical();
  std::cout << "\tHTTP connection failure\n";
  testHttpConnectionFailed();
  std::cout << "\tnon-200 status\n";
  testHttpStatusNot200();
  std::cout << "\texact scratchpad size\n";
  testResponseAtScratchpadLimit();
  std::cout << "\tone byte over scratchpad size\n";
  testResponseOneByteOverScratchpadLimit();
  std::cout << "\tempty body\n";
  testEmptyResponseBody();
  std::cout << "\tbroken JSON\n";
  testBrokenJsonSyntax();
  std::cout << "\tmissing attribute\n";
  testMissingExpectedAttribute();
  std::cout << "\twrong attribute type\n";
  testAttributeWrongType();
  std::cout << "\tWebSocket begin failure\n";
  testWebSocketBeginFails();
}
