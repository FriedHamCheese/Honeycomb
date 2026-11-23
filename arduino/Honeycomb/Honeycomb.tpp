#include <stdio.h>

template <
  class HttpClientInterface, 
  class WebSocketClientInterface, 
  class NetworkInterface, 
  class StringT, 
  class SerialInterface,
  long int scratchpadBufferBytes
>
HoneycombClient<
  HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface, scratchpadBufferBytes
>::HoneycombClient(
  const char* serverURL,
  uint16_t serverPort,
  unsigned long maxMsBeforeTimeout,
  uint64_t deviceID, 
  const char* deviceSecret,
  unsigned long msSinceStartup,
  SerialInterface& serial
)
: httpWiFiClient(),
  httpClient(httpWiFiClient, serverURL, serverPort),
  webSocketWiFiClient(),
  webSocketConnection(webSocketWiFiClient, serverURL, 80),
  serial(serial),
  deviceSecret(deviceSecret),
  deviceID(deviceID),
  millisLastServerMessage(msSinceStartup),
  maxMsBeforeTimeout(maxMsBeforeTimeout),
  connected(false),
  authenticated(false)
{
}

template <
  class HttpClientInterface, 
  class WebSocketClientInterface, 
  class NetworkInterface, 
  class StringT, 
  class SerialInterface,
  long int scratchpadBufferBytes
>
HoneycombError HoneycombClient<
  HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface, scratchpadBufferBytes
>::begin(){
  this->httpClient.flush();
  this->httpClient.stop();

  this->authenticated = false;
  this->connected = false;
  
  const int httpError = this->httpClient.get("/apiv1/device/webSocketURL");
  if(httpError)
    return httpErrorToHoneycombError(httpError);
  
  constexpr int httpOK = 200;
  if(this->httpClient.responseStatusCode() != httpOK)
    return HoneycombError::httpInvalidServerResponseStatus;
  if(this->httpClient.contentLength() > scratchpadBufferBytes)
    return HoneycombError::maxSize;
  
  const StringT httpResponseBody = this->httpClient.responseBody();
  JsonDocument responseJson;
  const DeserializationError jsonToObjectError = deserializeJson(responseJson, httpResponseBody);
  if(jsonToObjectError != DeserializationError::Ok)
    return deserializationErrorToHoneycombError(jsonToObjectError);
  
  const bool responseObjectIncorrectTypes = (
    !responseJson["domain"].is<const char*>() || !responseJson["port"].is<uint16_t>() || !responseJson["path"].is<const char*>()
  );
  if(responseObjectIncorrectTypes)
    return HoneycombError::httpInvalidServerResponseBody;
  
  this->webSocketConnection = WebSocketClientInterface(
    this->webSocketWiFiClient, responseJson["domain"].as<const char*>(), responseJson["port"].as<uint16_t>()
  );
  
  const int connectionBeginError = this->webSocketConnection.begin(responseJson["path"].as<const char*>());
  if(connectionBeginError)
    return HoneycombError::disconnectedWebSocket;
  this->connected = true;
  return HoneycombError::ok;
}

template <
  class HttpClientInterface, 
  class WebSocketClientInterface, 
  class NetworkInterface, 
  class StringT, 
  class SerialInterface,
  long int scratchpadBufferBytes
>
HoneycombError HoneycombClient<
  HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface, scratchpadBufferBytes
>::authenticate(){
  if(!(this->connected)) return HoneycombError::disconnectedWebSocket;
  
  const bool beginMessageError = this->webSocketConnection.beginMessage(TYPE_TEXT) != 0;
  if(beginMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
  JsonDocument json;
  json["__messageType"] = "auth";
  json["deviceID"] = this->deviceID;
  json["deviceSecret"] = this->deviceSecret;
  const size_t stringifiedJSONBytes = serializeJson(json, this->scratchpadBuffer, scratchpadBufferBytes);  
  this->webSocketConnection.write((uint8_t*)(this->scratchpadBuffer), stringifiedJSONBytes);
  
  const bool endMessageError = this->webSocketConnection.endMessage() != 0;
  if(endMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
  return HoneycombError::ok;
}

template <
  class HttpClientInterface, 
  class WebSocketClientInterface, 
  class NetworkInterface, 
  class StringT, 
  class SerialInterface,
  long int scratchpadBufferBytes
>
HoneycombError HoneycombClient<
  HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface, scratchpadBufferBytes
>::pingServer(){
  if(!(this->connected)) return HoneycombError::disconnectedWebSocket;

  const int beginMessageError = this->webSocketConnection.beginMessage(TYPE_TEXT);
  if(beginMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
  const char pingMessage[] = "{\"__messageType\":\"ping\"}";
  //JavaScript dies froms seeing null terminator, write without it, SerializeJson with Arduino String type does not have it
  this->webSocketConnection.write((uint8_t*)pingMessage, sizeof(pingMessage) - sizeof('\0'));

  const int endMessageError = this->webSocketConnection.endMessage();
  if(endMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  return HoneycombError::ok;
}

template <
  class HttpClientInterface, 
  class WebSocketClientInterface, 
  class NetworkInterface, 
  class StringT, 
  class SerialInterface,
  long int scratchpadBufferBytes
>
Pair<HoneycombError, bool> HoneycombClient<
  HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface, scratchpadBufferBytes
>::readIncomingMessages(JsonDocument* objectFromServer, unsigned long msSinceStartup
){
  if(not (this->connected)) return {HoneycombError::disconnectedWebSocket, false};

  JsonDocument json;
  const size_t messageBytes = this->webSocketConnection.parseMessage();  
  
  if(messageBytes == 0){
    const bool connectionStale = msSinceStartup - this->millisLastServerMessage >= this->maxMsBeforeTimeout;
    if(not connectionStale) return {HoneycombError::ok, false};
    this->connected = false;
    this->authenticated = false;
    return {HoneycombError::connectionStale, false};
  }
  
  this->millisLastServerMessage = msSinceStartup;

  if(messageBytes > scratchpadBufferBytes)
    return {HoneycombError::maxSize, false};
  if(this->webSocketConnection.messageType() != TYPE_TEXT)
    return {HoneycombError::receivedMessageNotText, false};

  const DeserializationError parsingError = deserializeJson(json, this->webSocketConnection.readString());
  if(parsingError != DeserializationError::Ok)
    return {deserializationErrorToHoneycombError(parsingError), false};

  if(json["__messageType"].isNull())
    return {HoneycombError::unknownReceivedMessageType, false};
  
  constexpr int strncmp_equal = 0;
  if(strncmp(json["__messageType"], "patch", sizeof("patch")) == strncmp_equal){
    if(not objectFromServer)
      return {HoneycombError::ok, true};
    *objectFromServer = json;
    return {HoneycombError::ok, true};    
  }
  if(strncmp(json["__messageType"], "auth", sizeof("auth")) == strncmp_equal){
    this->authenticated = false;
    
    if(not json["error"].isNull()) return {HoneycombError::invalidAuthenticateRequest, false};
    if(not (json["success"].is<bool>())) return {HoneycombError::unspecifiedAuthSuccess, false};
    if(not (json["success"].as<bool>())) return {HoneycombError::otherConnectedDeviceHasSameID, false};
    this->authenticated = true;
    return {HoneycombError::ok, false};
  }
  if(strncmp(json["__messageType"], "pong", sizeof("pong")) == strncmp_equal){
    return {HoneycombError::ok, false};
  }  
  if(strncmp(json["__messageType"], "error", sizeof("error")) == strncmp_equal){
    return {HoneycombError::messageFormError, false};
  }
  
  return {HoneycombError::unknownReceivedMessageType, false};
}

template <
  class HttpClientInterface, 
  class WebSocketClientInterface, 
  class NetworkInterface, 
  class StringT, 
  class SerialInterface,
  long int scratchpadBufferBytes
>
HoneycombError HoneycombClient<
  HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface, scratchpadBufferBytes
>::patchDatapoint(JsonObject jsonRef){
  if(not (this->connected)) return HoneycombError::disconnectedWebSocket;
  if(not (this->authenticated)) return HoneycombError::notAuthenticated;

  jsonRef["__messageType"] = "patch";
  const size_t stringifiedJSONBytes = serializeJson(jsonRef, this->scratchpadBuffer, scratchpadBufferBytes);
  
  const bool beginMessageError = this->webSocketConnection.beginMessage(TYPE_TEXT) != 0;
  if(beginMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
  this->webSocketConnection.write((uint8_t*)(this->scratchpadBuffer), stringifiedJSONBytes);
  const bool endMessageError = this->webSocketConnection.endMessage() != 0;
  if(endMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }

  return HoneycombError::ok;
}