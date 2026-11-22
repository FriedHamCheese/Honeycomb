#ifndef HONEYCOMB_HPP
#define HONEYCOMB_HPP

#include "ArduinoJson.h"

static const int HTTP_SUCCESS =0;
// The end of the headers has been reached.  This consumes the '\n'
// Could not connect to the server
static const int HTTP_ERROR_CONNECTION_FAILED =-1;
// This call was made when the HttpClient class wasn't expecting it
// to be called.  Usually indicates your code is using the class
// incorrectly
static const int HTTP_ERROR_API =-2;
// Spent too long waiting for a reply
static const int HTTP_ERROR_TIMED_OUT =-3;
// The response from the server is invalid, is it definitely an HTTP
// server?
static const int HTTP_ERROR_INVALID_RESPONSE =-4;

static const int TYPE_CONTINUATION     = 0x0;
static const int TYPE_TEXT             = 0x1;
static const int TYPE_BINARY           = 0x2;
static const int TYPE_CONNECTION_CLOSE = 0x8;
static const int TYPE_PING             = 0x9;
static const int TYPE_PONG             = 0xa;

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

template <class HttpClientInterface, class WebSocketClientInterface, class NetworkInterface, class StringT, class SerialInterface>
class HoneycombClient{
  public:
  HoneycombClient(
    const char* serverURL,
    uint16_t serverPort, 
    uint16_t maxIncomingBytes, 
    unsigned long maxMsBeforeTimeout,
    uint64_t deviceID,
    const char* deviceSecret,
    unsigned long msSinceStartup,
    SerialInterface& serial
  );
  HoneycombError begin(unsigned long msSinceStartup);
  HoneycombError authenticate();
  HoneycombError pingServer();
  HoneycombError readIncomingMessages(unsigned long msSinceStartup);
  HoneycombError patchDatapoint(JsonObject jsonRef);

  Optional<bool, JsonDocument>* variablesFromServer;

  static constexpr uint16_t scratchpadBufferBytes = 512;

  private:
  //Buffer is not multithreading-proof if writes or reads are executed simultaneously
  char scratchpadBuffer[scratchpadBufferBytes];
  NetworkInterface httpWiFiClient;
  HttpClientInterface httpClient;
  NetworkInterface webSocketWiFiClient;
  WebSocketClientInterface webSocketConnection;
  SerialInterface& serial;
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

#include "Honeycomb.tpp"

#endif
