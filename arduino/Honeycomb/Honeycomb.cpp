#include "Honeycomb.hpp"

HoneycombClient::HoneycombClient(
  const char* serverURL, uint16_t serverPort, uint16_t maxIncomingBytes, unsigned long maxMsBeforeTimeout
)
: variablesFromServer(nullptr),
  wifiClient(),
  webSocketConnection(wifiClient, serverURL, serverPort),
  millisLastServerMessage(millis()),
  maxMsBeforeTimeout(maxMsBeforeTimeout),
  maxIncomingBytes(maxIncomingBytes),
  connected(false),
  authenticated(false)
{

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

HoneycombError HoneycombClient::authenticate(uint64_t deviceID, const char* deviceSecret){
  const bool beginMessageError = this->webSocketConnection.beginMessage(TYPE_TEXT) != 0;
  if(beginMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
  JsonDocument json;
  json["__messageType"] = "auth";
  json["deviceID"] = deviceID;
  json["deviceSecret"] = deviceSecret;
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
  const bool beginMessageError = this->webSocketConnection.beginMessage(TYPE_TEXT) != 0;
  if(beginMessageError){
    this->connected = false;
    this->authenticated = false;
    return HoneycombError::outboundMessageSend;
  }
  
  const char pingMessage[] = "{\"__messageType\":\"ping\"}";
  this->webSocketConnection.write((uint8_t*)pingMessage, sizeof(pingMessage) - sizeof('\0'));

  const bool endMessageError = this->webSocketConnection.endMessage() != 0;
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
  if(strncmp(json["__messageType"], "error", sizeof("error")) == strncmp_equal){
    return HoneycombError::messageFormError;
  }
  
  return HoneycombError::unknownReceivedMessageType;
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