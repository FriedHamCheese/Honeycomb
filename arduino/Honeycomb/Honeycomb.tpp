#include <stdio.h>

template <class HttpClientInterface, class WebSocketClientInterface, class NetworkInterface, class StringT, class SerialInterface>
HoneycombClient<HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface>::HoneycombClient(
  const char* serverURL,
  uint16_t serverPort,
  uint16_t maxIncomingBytes, 
  unsigned long maxMsBeforeTimeout,
  uint64_t deviceID, 
  const char* deviceSecret,
  unsigned long msSinceStartup,
  SerialInterface& serial
)
: variablesFromServer(nullptr),
  httpWiFiClient(),
  httpClient(httpWiFiClient, serverURL, serverPort),
  webSocketWiFiClient(),
  webSocketConnection(webSocketWiFiClient, serverURL, 80),
  serial(serial),
  deviceSecret(deviceSecret),
  deviceID(deviceID),
  millisLastServerMessage(msSinceStartup),
  maxMsBeforeTimeout(maxMsBeforeTimeout),
  maxIncomingBytes(maxIncomingBytes),
  connected(false),
  authenticated(false)
{
}

template <class HttpClientInterface, class WebSocketClientInterface, class NetworkInterface, class StringT, class SerialInterface>
HoneycombError HoneycombClient<HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface>::begin(unsigned long msSinceStartup
){
  this->httpClient.flush();
  this->httpClient.stop();

  this->authenticated = false;
  this->connected = false;
  
  const int httpError = this->httpClient.get("/apiv1/device/webSocketURL");
  if(httpError)
    return httpErrorToHoneycombError(httpError);
  
  constexpr int httpOK = 200;
  if(this->httpClient.responseStatusCode() != httpOK)
    return HoneycombError::httpInvalidServerResponse;
  if(this->httpClient.contentLength() > HoneycombClient::scratchpadBufferBytes)
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
    return HoneycombError::httpInvalidServerResponse;
  
  this->webSocketConnection = WebSocketClient(
    this->webSocketWiFiClient, responseJson["domain"].as<const char*>(), responseJson["port"].as<uint16_t>()
  );
  
  const int connectionBeginError = this->webSocketConnection.begin(responseJson["path"].as<const char*>());
  if(!connectionBeginError){
    this->connected = true;
    this->millisLastServerMessage = msSinceStartup;
  }
  
  return HoneycombError::httpConnectionFailed;
}

template <class HttpClientInterface, class WebSocketClientInterface, class NetworkInterface, class StringT, class SerialInterface>
HoneycombError HoneycombClient<HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface>::authenticate(){
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
  const size_t stringifiedJSONBytes = serializeJson(json, this->scratchpadBuffer, this->scratchpadBufferBytes);
  const bool noEndingNullTerminator = stringifiedJSONBytes >= this->scratchpadBufferBytes;
  if(noEndingNullTerminator) return HoneycombError::noMemory;
  
  this->webSocketConnection.write((uint8_t*)(this->scratchpadBuffer), stringifiedJSONBytes);
  
  const bool endMessageError = this->webSocketConnection.endMessage() != 0;
  if(endMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
  return HoneycombError::ok;
}

template <class HttpClientInterface, class WebSocketClientInterface, class NetworkInterface, class StringT, class SerialInterface>
HoneycombError HoneycombClient<HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface>::pingServer(){
  const int beginMessageError = this->webSocketConnection.beginMessage(TYPE_TEXT);
  this->serial.print("begin: ");
  this->serial.println(beginMessageError);
  if(beginMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
  const char pingMessage[] = "{\"__messageType\":\"ping\"}";
  this->webSocketConnection.write((uint8_t*)pingMessage, sizeof(pingMessage) - sizeof('\0'));

  const int endMessageError = this->webSocketConnection.endMessage();
  this->serial.print("end: ");
  this->serial.println(endMessageError);
  if(endMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  return HoneycombError::ok;
}

template <class HttpClientInterface, class WebSocketClientInterface, class NetworkInterface, class StringT, class SerialInterface>
HoneycombError HoneycombClient<HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface>::readIncomingMessages(  unsigned long msSinceStartup
){
  if(not (this->connected)) return HoneycombError::disconnectedWebSocket;

  JsonDocument json;
  const size_t messageBytes = this->webSocketConnection.parseMessage();  
  
  if(messageBytes == 0){
    const bool connectionStale = msSinceStartup - this->millisLastServerMessage >= this->maxMsBeforeTimeout;
    if(not connectionStale) return HoneycombError::ok;
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::connectionStale;
  }
  
  this->millisLastServerMessage = msSinceStartup;

  if(messageBytes > this->maxIncomingBytes)
    return HoneycombError::maxSize;
  if(this->webSocketConnection.messageType() != TYPE_TEXT)
    return HoneycombError::receivedMessageNotText;

  const DeserializationError parsingError = deserializeJson(json, this->webSocketConnection.readString());
  if(parsingError != DeserializationError::Ok)
    return deserializationErrorToHoneycombError(parsingError);

  if(json["__messageType"].isNull())
    return HoneycombError::unknownReceivedMessageType;
  
  constexpr int strncmp_equal = 0;
  if(strncmp(json["__messageType"], "patch", sizeof("patch")) == strncmp_equal){
    if(!(this->variablesFromServer)) return HoneycombError::noOutJsonContainer;
    *(this->variablesFromServer) = Optional(true, json);
    return HoneycombError::ok;
  }
  if(strncmp(json["__messageType"], "auth", sizeof("auth")) == strncmp_equal){
    this->authenticated = false;
    
    if(not json["error"].isNull()) return HoneycombError::invalidAuthenticateRequest;
    if(not (json["success"].as<bool>())) return HoneycombError::otherConnectedDeviceHasSameID;
    this->authenticated = true;
    return HoneycombError::ok;
  }
  if(strncmp(json["__messageType"], "pong", sizeof("pong")) == strncmp_equal){
    return HoneycombError::ok;
  }  
  if(strncmp(json["__messageType"], "error", sizeof("error")) == strncmp_equal){
    return HoneycombError::messageFormError;
  }
  
  return HoneycombError::unknownReceivedMessageType;
}

template <class HttpClientInterface, class WebSocketClientInterface, class NetworkInterface, class StringT, class SerialInterface>
HoneycombError HoneycombClient<HttpClientInterface, WebSocketClientInterface, NetworkInterface, StringT, SerialInterface>::patchDatapoint(JsonObject jsonRef){
  if(not (this->connected)) return HoneycombError::disconnectedWebSocket;
  if(not (this->authenticated)) return HoneycombError::invalidAuthenticateRequest;

  jsonRef["__messageType"] = "patch";
  const size_t stringifiedJSONBytes = serializeJson(jsonRef, this->scratchpadBuffer, this->scratchpadBufferBytes);
  const bool noEndingNullTerminator = stringifiedJSONBytes >= this->scratchpadBufferBytes;
  if(noEndingNullTerminator) return HoneycombError::noMemory;
  
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

HoneycombError deserializationErrorToHoneycombError(const DeserializationError error){
  if(error == DeserializationError::Ok)
    return HoneycombError::ok;
  if(error == DeserializationError::EmptyInput)
    return HoneycombError::jsonEmptyInput;
  if(error == DeserializationError::IncompleteInput)
    return HoneycombError::jsonIncompleteInput;
  if(error == DeserializationError::InvalidInput)
    return HoneycombError::jsonInvalidInput;
  if(error == DeserializationError::NoMemory)
    return HoneycombError::noMemory;
  if(error == DeserializationError::TooDeep)
    return HoneycombError::jsonTooDeep;
  return HoneycombError::unknown;
}

HoneycombError httpErrorToHoneycombError(int error){
  switch(error){
    case HTTP_SUCCESS:
    return HoneycombError::ok;
    case HTTP_ERROR_CONNECTION_FAILED:
    return HoneycombError::httpConnectionFailed;
    case HTTP_ERROR_API:
    return HoneycombError::httpApiError;
    case HTTP_ERROR_TIMED_OUT:
    return HoneycombError::httpTimedout;
    case HTTP_ERROR_INVALID_RESPONSE:
    return HoneycombError::httpInvalidServerResponse;
    default: return HoneycombError::unknown;
  }
}
