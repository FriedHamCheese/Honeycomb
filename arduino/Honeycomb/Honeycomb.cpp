#include "Honeycomb.hpp"
#include <stdio.h>

HoneycombClient::HoneycombClient(
  const char* serverURL, 
  uint16_t serverPort, 
  uint16_t maxIncomingBytes, 
  unsigned long maxMsBeforeTimeout,
  uint64_t deviceID, 
  const char* deviceSecret
)
: variablesFromServer(nullptr),
  wifiClient(),
  webSocketConnection(wifiClient, serverURL, serverPort),
  httpConnection(wifiClient, serverURL, serverPort),
  deviceSecret(deviceSecret),
  deviceID(deviceID),
  millisLastServerMessage(millis()),
  maxMsBeforeTimeout(maxMsBeforeTimeout),
  maxIncomingBytes(maxIncomingBytes),
  connected(false),
  authenticated(false)
{
  snprintf(this->patchDatapointURL, this->patchDatapointURLLength, "/apiv1/device/%llu/datapoint", deviceID);
}

int HoneycombClient::begin(){
  this->authenticated = false;
  const int connectionBeginError = this->webSocketConnection.begin("/toDevice");
  if(!connectionBeginError){
    this->connected = true;
    this->millisLastServerMessage = millis();
  }
  
  return connectionBeginError;
}

HoneycombError HoneycombClient::authenticate(){
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

HoneycombError HoneycombClient::pingServer(){
  const int beginMessageError = this->webSocketConnection.beginMessage(TYPE_TEXT);
  Serial.print("begin: ");
  Serial.println(beginMessageError);
  if(beginMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
  const char pingMessage[] = "{\"__messageType\":\"ping\"}";
  this->webSocketConnection.write((uint8_t*)pingMessage, sizeof(pingMessage) - sizeof('\0'));

  const int endMessageError = this->webSocketConnection.endMessage();
  Serial.print("end: ");
  Serial.println(endMessageError);
  if(endMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  return HoneycombError::ok;
}

HoneycombError HoneycombClient::readIncomingMessages(){
  if(not (this->connected)) return HoneycombError::disconnectedWebSocket;

  JsonDocument json;
  const size_t messageBytes = this->webSocketConnection.parseMessage();  
  
  if(messageBytes == 0){
    const bool connectionStale = millis() - this->millisLastServerMessage >= this->maxMsBeforeTimeout;
    if(not connectionStale) return HoneycombError::ok;
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::connectionStale;
  }
  
  this->millisLastServerMessage = millis();

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

HoneycombError HoneycombClient::patchDatapoint(JsonObjectConst jsonRef){  
  const size_t stringifiedJSONBytes = serializeJson(jsonRef, this->scratchpadBuffer, this->scratchpadBufferBytes);
  const bool noEndingNullTerminator = stringifiedJSONBytes >= this->scratchpadBufferBytes;
  if(noEndingNullTerminator) return HoneycombError::noMemory;
  
  this->httpConnection.beginRequest();
  const int httpSendingError = this->httpConnection.post(this->patchDatapointURL);
  if(httpSendingError){
    this->httpConnection.endRequest();
    return httpErrorToHoneycombError(httpSendingError);
  }
  
  constexpr uint8_t u16MaxStrLength = 6;
  char contentLengthStr[u16MaxStrLength];
  snprintf(contentLengthStr, u16MaxStrLength, "%hu", stringifiedJSONBytes);
  
  this->httpConnection.sendHeader("Authorization", this->deviceSecret);
  this->httpConnection.sendHeader("Content-type: application/json");
  this->httpConnection.sendHeader("Content-Length", contentLengthStr);
  this->httpConnection.beginBody();
  this->httpConnection.write((uint8_t*)(this->scratchpadBuffer), stringifiedJSONBytes);
  this->httpConnection.endRequest();
  
  const int responseCode = this->httpConnection.responseStatusCode();
  constexpr int httpCodeForCreated = 201;
  if(responseCode == httpCodeForCreated)
    return HoneycombError::ok;
  switch(responseCode){
    case 400: return HoneycombError::httpInvalidRequest;
    case 401: return HoneycombError::invalidAuthenticateRequest;
    default: return HoneycombError::unknown;
  }
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