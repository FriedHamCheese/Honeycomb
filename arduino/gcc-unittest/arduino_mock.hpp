#ifndef ARDUINO_MOCK_HPP
#define ARDUINO_MOCK_HPP

#include <utility>
#include <cstdint>
#include <cstddef>
#include <iostream>

class NetworkInterfaceMock{
  public:
  inline NetworkInterfaceMock() noexcept {

  }
};

template <class NetworkInterface, class StringT>
class HttpClientMock{
  public:
  HttpClientMock(NetworkInterface& aClient, const char* aServerName, uint16_t aServerPort = 80);
  int get(const char* aURLPath);
  int responseStatusCode();
  long contentLength();
  StringT responseBody();
  void flush();
  void stop();

  StringT serverNameFromCtor;
  int serverPortFromCtor;
  StringT pathFromGet;
  int getReturnValue;
  int contentLengthValue;
  StringT responseBodyValue;
  int responseStatusCodeValue;
};

template <class NetworkInterface, class StringT>
class WebSocketClientMock{
  public:
  WebSocketClientMock(NetworkInterface& aClient, const char* aServerName, uint16_t aServerPort = 80);
  int begin(const char* aPath = "/");
  int beginMessage(int aType);
  int endMessage();
  int parseMessage();
  int messageType();
  StringT readString();
  size_t write(const uint8_t *aBuffer, size_t aSize);
  
  inline static StringT serverNameFromCtor = "";
  inline static int serverPortFromCtor = 0;
  inline static StringT pathFromBegin = "";
  inline static int beginReturnValue = 0;
  inline static int messageTypeFromBeginMessage = 0;
  inline static int beginMessageReturnValue = 0;
  inline static int endMessageReturnValue = 0;
  inline static int parseMessageReturnValue = 0;
  inline static int messageTypeReturnValue = 0;
  inline static StringT readStringValue = "";
  inline static size_t writeSizeValue = 0;
  
  static constexpr size_t writeBufferBytes = 2048;
  inline static uint8_t writeBuffer[writeBufferBytes];
};

class SerialMock{
  public:
  inline SerialMock() noexcept{
  }
  
  size_t print(const auto val) noexcept{
    std::cout << val;
    return 0;
  }
  size_t println(const auto val) noexcept{
    std::cout << val << std::endl;
    return 0;
  }
};

#include "arduino_mock.tpp"

#endif
