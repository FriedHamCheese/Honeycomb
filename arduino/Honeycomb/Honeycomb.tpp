#include <stdio.h>
#include <cstring>

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
  
  JsonDocument json;
  json["__messageType"] = "auth";
  json["deviceID"] = this->deviceID;
  json["deviceSecret"] = this->deviceSecret;

  const bool beginMessageError = this->webSocketConnection.beginMessage(TYPE_TEXT) != 0;
  if(beginMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
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

  constexpr char pingMessage[] = "{\"__messageType\":\"ping\"}";
  constexpr size_t PING_MESSAGE_BUFFER_BYTES = sizeof(pingMessage);
  if(PING_MESSAGE_BUFFER_BYTES > scratchpadBufferBytes)
    return HoneycombError::jsonIncompleteInput;

  const int beginMessageError = this->webSocketConnection.beginMessage(TYPE_TEXT);
  if(beginMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
  memcpy(this->scratchpadBuffer, pingMessage, PING_MESSAGE_BUFFER_BYTES);
  this->webSocketConnection.write(
    (uint8_t*)this->scratchpadBuffer,
    PING_MESSAGE_BUFFER_BYTES - sizeof('\0')
  );

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
Pair<HoneycombError, Honeycomb::IncomingMessage> HoneycombClient<
  HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface, scratchpadBufferBytes
>::readIncomingMessages(JsonDocument* objectFromServer, StringT* errorFromServer, unsigned long msSinceStartup
){
  if(not (this->connected)) return {HoneycombError::disconnectedWebSocket, Honeycomb::IncomingMessage::noMessage};

  JsonDocument json;
  const size_t messageBytes = this->webSocketConnection.parseMessage();  
  
  if(messageBytes == 0){
    const bool connectionStale = msSinceStartup - this->millisLastServerMessage >= this->maxMsBeforeTimeout;
    if(not connectionStale) return {HoneycombError::ok, Honeycomb::IncomingMessage::noMessage};
    this->connected = false;
    this->authenticated = false;
    return {HoneycombError::connectionStale, Honeycomb::IncomingMessage::noMessage};
  }
  
  this->millisLastServerMessage = msSinceStartup;

  if(messageBytes > scratchpadBufferBytes)
    return {HoneycombError::maxSize, Honeycomb::IncomingMessage::noMessage};
  if(this->webSocketConnection.messageType() != TYPE_TEXT)
    return {HoneycombError::receivedMessageNotText, Honeycomb::IncomingMessage::noMessage};

  const DeserializationError parsingError = deserializeJson(json, this->webSocketConnection.readString());
  if(parsingError != DeserializationError::Ok)
    return {deserializationErrorToHoneycombError(parsingError), Honeycomb::IncomingMessage::noMessage};

  if(json["__messageType"].isNull())
    return {HoneycombError::unknownReceivedMessageType, Honeycomb::IncomingMessage::noMessage};
  
  constexpr int strncmp_equal = 0;
  if(strncmp(json["__messageType"], "pong", sizeof("pong")) == strncmp_equal){
    return {HoneycombError::ok, Honeycomb::IncomingMessage::noMessage};
  }  
  
  if(strncmp(json["__messageType"], "patch", sizeof("patch")) == strncmp_equal){
    if(objectFromServer != nullptr)
      *objectFromServer = json;
    return {HoneycombError::ok, Honeycomb::IncomingMessage::objectFromServer};    
  }
  
  if(strncmp(json["__messageType"], "auth", sizeof("auth")) == strncmp_equal){
    this->authenticated = false;
    
    if(json["error"].is<const char*>()){
      if(errorFromServer != nullptr)
        *errorFromServer = json["error"].as<const char*>();
      return {HoneycombError::invalidAuthenticateRequest, Honeycomb::IncomingMessage::errorFromServer};
    };
    if(not (json["success"].is<bool>())) 
      return {HoneycombError::unspecifiedAuthSuccess, Honeycomb::IncomingMessage::noMessage};
    if(not (json["success"].as<bool>())) 
      return {HoneycombError::otherConnectedDeviceHasSameID, Honeycomb::IncomingMessage::noMessage};
    this->authenticated = true;
    return {HoneycombError::ok, Honeycomb::IncomingMessage::noMessage};
  }
  
  if(strncmp(json["__messageType"], "error", sizeof("error")) == strncmp_equal){
    if(json["error"].is<const char*>() && errorFromServer != nullptr)
      *errorFromServer = json["error"].as<const char*>();
    return {HoneycombError::messageFormError, Honeycomb::IncomingMessage::errorFromServer};
  }
  if(strncmp(json["__messageType"], "patcherr", sizeof("patcherr")) == strncmp_equal){
    if(json["error"].is<const char*>() && errorFromServer != nullptr)
      *errorFromServer = json["error"].as<const char*>();
    return {HoneycombError::patchError, Honeycomb::IncomingMessage::errorFromServer};
  }
  
  return {HoneycombError::unknownReceivedMessageType, Honeycomb::IncomingMessage::noMessage};
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
