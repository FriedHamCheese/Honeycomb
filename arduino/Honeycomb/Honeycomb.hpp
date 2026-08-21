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

  httpConnectionFailed,
  httpApiError,
  httpTimedout,
  httpInvalidServerResponse,
  httpInvalidRequest,

  receivedMessageNotText,
  unknownReceivedMessageType,
  messageFormError,
  invalidAuthenticateRequest,
  unknown
};

class HoneycombClient{
  public:
  HoneycombClient(
    const char* serverURL,
    uint16_t serverPort, 
    uint16_t maxIncomingBytes, 
    unsigned long maxMsBeforeTimeout,
    uint64_t deviceID,
    const char* deviceSecret
  );
  int begin();
  HoneycombError authenticate();
  HoneycombError pingServer();
  HoneycombError readIncomingMessages();
  HoneycombError patchDatapoint(JsonObjectConst jsonRef);

  Optional<bool, JsonDocument>* variablesFromServer;

  static constexpr uint16_t scratchpadBufferBytes = 512;
  static constexpr uint16_t patchDatapointURLLength = 64;

  private:
  //Buffer is not multithreading-proof if writes or reads are executed simultaneously
  char scratchpadBuffer[scratchpadBufferBytes];
  WiFiClient wifiClient;
  WebSocketClient webSocketConnection;
  HttpClient httpConnection;
  
  char patchDatapointURL[patchDatapointURLLength];
  const char* deviceSecret;
  uint64_t deviceID;
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
HoneycombError httpErrorToHoneycombError(int error);

#endif