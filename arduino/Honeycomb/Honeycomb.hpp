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

template< typename firstT, typename secondT>
struct Pair{
  firstT first;
  secondT second;
  
  Pair()
  : first(), second()
  {
    
  }
  
  Pair(const firstT& first, secondT second)
  : first(first), second(second)
  {
  }

  Pair<firstT, secondT>& operator=(const Pair<firstT, secondT>& other){
    this->first = other.first;
    this->second = other.second;
    return *this;
  }
};

enum class HoneycombError : uint8_t{
  ok,
  maxSize,
  noMemory,
  connectionStale, 
 
  jsonEmptyInput,
  jsonIncompleteInput,
  jsonInvalidInput,
  jsonTooDeep,
  
  outboundMessageSend,
  disconnectedWebSocket,
  otherConnectedDeviceHasSameID,

  ArduinoHttpClientConnectionFailed,
  ArduinoHttpClientApiError,
  ArduinoHttpClientTimedout,
  ArduinoHttpClientInvalidServerResponse,
  httpInvalidServerResponseStatus,
  httpInvalidServerResponseBody,
  
  receivedMessageNotText,
  unknownReceivedMessageType,
  messageFormError,
  invalidAuthenticateRequest,
  unspecifiedAuthSuccess,
  notAuthenticated,
  unknown
};

template <
  class HttpClientInterface, 
  class WebSocketClientInterface, 
  class NetworkInterface, 
  class StringT, 
  class SerialInterface,
  long int scratchpadBufferBytes
>
class HoneycombClient{
  public:
  HoneycombClient(
    const char* serverURL,
    uint16_t serverPort, 
    unsigned long maxMsBeforeTimeout,
    uint64_t deviceID,
    const char* deviceSecret,
    unsigned long msSinceStartup,
    SerialInterface& serial
  );
  HoneycombError begin();
  HoneycombError authenticate();
  HoneycombError pingServer();
  Pair<HoneycombError, bool> readIncomingMessages(JsonDocument* objectFromServer, unsigned long msSinceStartup);
  HoneycombError patchDatapoint(JsonObject jsonRef);

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
  inline getMillisLastServerMessage() const noexcept{
    return this->millisLastServerMessage;
  }
  #ifdef HONEYCOMB_USE_DEV_METHODS
  inline void setConnected(bool connected) noexcept{
    this->connected = connected;
  }
  inline void setAuthenticated(bool authenticated) noexcept{
    this->authenticated = authenticated;
  }
  inline HttpClientInterface& getHttpClient() noexcept{
    return this->httpClient;
  }
  inline WebSocketClientInterface& getWebSocketConnection() noexcept{
    return this->webSocketConnection;
  }
  #endif
};

inline HoneycombError deserializationErrorToHoneycombError(const DeserializationError error) noexcept{
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

inline HoneycombError httpErrorToHoneycombError(int error) noexcept{
  switch(error){
    case HTTP_SUCCESS:
    return HoneycombError::ok;
    case HTTP_ERROR_CONNECTION_FAILED:
    return HoneycombError::ArduinoHttpClientConnectionFailed;
    case HTTP_ERROR_API:
    return HoneycombError::ArduinoHttpClientApiError;
    case HTTP_ERROR_TIMED_OUT:
    return HoneycombError::ArduinoHttpClientTimedout;
    case HTTP_ERROR_INVALID_RESPONSE:
    return HoneycombError::ArduinoHttpClientInvalidServerResponse;
    default: return HoneycombError::unknown;
  }
}

#include "Honeycomb.tpp"

#endif
