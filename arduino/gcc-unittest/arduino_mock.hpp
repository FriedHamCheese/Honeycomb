#ifndef ARDUINO_MOCK_HPP
#define ARDUINO_MOCK_HPP

#include <cstdint>
#include <cstddef>

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
  StringT reponseBody();
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
};

class SerialMock{
  public:
  inline SerialMock() noexcept{
  }
  
  size_t print(const auto val) noexcept{
    return 0;
  }
  size_t println(const auto val) noexcept{
    return 0;
  }
};

#include "arduino_mock.tpp"

#endif