#include "Honeycomb.hpp"

HoneycombClient::HoneycombClient(const char* serverURL, uint16_t serverPort, uint16_t maxIncomingBytes)
: variablesFromServer(nullptr),
  wifiClient(),
  webSocketConnection(wifiClient, serverURL, serverPort), 
  maxIncomingBytes(maxIncomingBytes)
{

}

int HoneycombClient::begin(){
  return this->webSocketConnection.begin("/toDevice");
}

HoneycombError HoneycombClient::authenticate(uint64_t deviceID, const char* deviceSecret){
  const bool beginMessageError = this->webSocketConnection.beginMessage(TYPE_TEXT);
  if(beginMessageError) return HoneycombError::outboundMessageInit;
  
  JsonDocument json;
  json["__messageType"] = "auth";
  json["deviceID"] = deviceID;
  json["deviceSecret"] = deviceSecret;
  const size_t stringifiedJSONBytes = serializeJson(json, this->scratchpadBuffer, this->scratchpadBufferBytes);
  const bool noEndingNullTerminator = stringifiedJSONBytes >= this->scratchpadBufferBytes;
  if(noEndingNullTerminator) return HoneycombError::noMemory;
  
  this->webSocketConnection.write((uint8_t*)(this->scratchpadBuffer), stringifiedJSONBytes);
  
  const bool endMessageError = this->webSocketConnection.endMessage();
  if(endMessageError) return HoneycombError::outboundMessageSend;
  
  return HoneycombError::ok;
}

HoneycombError HoneycombClient::readIncomingMessages(){
  JsonDocument json;
  const int messageBytes = this->webSocketConnection.parseMessage();
  Serial.print("bytes: ");
  Serial.println(messageBytes);
  if(messageBytes == 0) return HoneycombError::ok;
  if(messageBytes > this->maxIncomingBytes)
    return HoneycombError::maxSize;
  if(this->webSocketConnection.messageType() == TYPE_BINARY)
    return HoneycombError::notText;

  const DeserializationError parsingError = deserializeJson(json, this->webSocketConnection.readString());
  if(parsingError != DeserializationError::Ok)
    return deserializationErrorToHoneycombError(parsingError);

  Serial.println("Deserialised");

  if(json["__messageType"].isNull())
    return HoneycombError::unclearType;
  
  constexpr int strncmp_equal = 0;
  if(strncmp(json["__messageType"], "patch", sizeof("patch")) == strncmp_equal){
    Serial.println("It is patch");
    if(!(this->variablesFromServer)) return HoneycombError::noHandler;
    *(this->variablesFromServer) = Optional(true, json);
    Serial.print("patch: ");
    Serial.println(this->variablesFromServer->errorCode);
    return HoneycombError::ok;
  }
  if(strncmp(json["__messageType"], "auth", sizeof("auth")) == strncmp_equal){
    if(not json["error"].isNull()) return HoneycombError::authenticate;
    return (json["success"].isNull()) ? HoneycombError::authenticate : HoneycombError::ok;
  }
  if(strncmp(json["__messageType"], "error", sizeof("error")) == strncmp_equal)
    return HoneycombError::unknown;
  
  return HoneycombError::unclearType;
}

HoneycombError deserializationErrorToHoneycombError(const DeserializationError error){
  if(error == DeserializationError::Ok)
    return HoneycombError::ok;
  if(error == DeserializationError::EmptyInput)
    return HoneycombError::emptyInput;
  if(error == DeserializationError::IncompleteInput)
    return HoneycombError::incompleteInput;
  if(error == DeserializationError::InvalidInput)
    return HoneycombError::invalidInput;
  if(error == DeserializationError::NoMemory)
    return HoneycombError::noMemory;
  if(error == DeserializationError::TooDeep)
    return HoneycombError::jsonTooDeep;
  return HoneycombError::unknown;
}