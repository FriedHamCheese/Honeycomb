#ifndef HONEYCOMB_HPP
#define HONEYCOMB_HPP

#if defined(ESP8266) || defined(ARDUINO_ARCH_ESP8266)
#include <ESP8266WiFi.h>
#else
#include <WiFi.h>
#endif

#include <ArduinoJson.h>
#include <ArduinoHttpClient.h>

inline bool periodicWait(
  unsigned long& waitedMs, unsigned long targetWaitMs, unsigned long periodMs, void(*waitMs)(unsigned long)
){
  if(waitedMs >= targetWaitMs) return true;
  waitMs(periodMs);
  waitedMs += periodMs;
  if(waitedMs >= targetWaitMs){
    waitedMs = 0;
    return true;
  }
  return false;
}

template<typename errorCodeT, typename outputT>
struct Optional{
  outputT output;
  errorCodeT errorCode;
  
  Optional()
  : output(), errorCode()
  {
    
  }
  
  Optional(errorCodeT errorCode, const outputT& output)
  : output(output), errorCode(errorCode)
  {
  }

  Optional<errorCodeT, outputT>& operator=(const Optional<errorCodeT, outputT>& other){
    this->errorCode = other.errorCode;
    this->output = other.output;
    return *this;
  }
};

enum class HoneycombError : uint8_t{
  ok,
  maxSize,
  noOutJsonContainer,
  connectionStale, 
 
  jsonEmptyInput,
  jsonIncompleteInput,
  jsonInvalidInput,
  noMemory,
  jsonTooDeep,
  
  outboundMessageSend,

  disconnectedWebSocket,
  otherConnectedDeviceHasSameID,

  receivedMessageNotText,
  unknownReceivedMessageType,
  messageFormError,
  invalidAuthenticateRequest,
  unknown
};

class HoneycombClient{
  public:
  HoneycombClient(const char* serverURL, uint16_t serverPort, uint16_t maxIncomingBytes, unsigned long maxMsBeforeTimeout);
  //so what happens if mcu lost wifi?
  int begin();
  HoneycombError authenticate(uint64_t deviceID, const char* deviceSecret);
  HoneycombError pingServer();
  HoneycombError readIncomingMessages();

  Optional<bool, JsonDocument>* variablesFromServer;

  static constexpr uint16_t scratchpadBufferBytes = 512;

  private:
  char scratchpadBuffer[scratchpadBufferBytes];
  WiFiClient wifiClient;
  WebSocketClient webSocketConnection;
  
  unsigned long millisLastServerMessage;
  unsigned long maxMsBeforeTimeout;
  uint16_t maxIncomingBytes;
  
  bool connected;
  bool authenticated;
  
  public:
  inline bool isConnected() const{
    return this->connected;
  }
  inline bool isAuthenticated() const{
    return this->authenticated;
  }
};

HoneycombError deserializationErrorToHoneycombError(const DeserializationError error);

#endif