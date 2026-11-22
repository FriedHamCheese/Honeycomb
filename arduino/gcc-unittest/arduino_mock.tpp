#include <cstdint>
#include <cstddef>

template <class NetworkInterface, class StringT>
HttpClientMock<NetworkInterface, StringT>::HttpClientMock(NetworkInterface& aClient, const char* aServerName, uint16_t aServerPort){
}

template <class NetworkInterface, class StringT>
int HttpClientMock<NetworkInterface, StringT>::get(const char* aURLPath){
  return 0;
}

template <class NetworkInterface, class StringT>
int HttpClientMock<NetworkInterface, StringT>::responseStatusCode(){
  return 0;
}

template <class NetworkInterface, class StringT>
long HttpClientMock<NetworkInterface, StringT>::contentLength(){
  return 0;
}

template <class NetworkInterface, class StringT>
StringT HttpClientMock<NetworkInterface, StringT>::reponseBody(){
  return StringT{};
}

template <class NetworkInterface, class StringT>
WebSocketClientMock<NetworkInterface, StringT>::WebSocketClientMock(
  NetworkInterface& aClient,
  const char* aServerName,
  uint16_t aServerPort
){
}

template <class NetworkInterface, class StringT>
int WebSocketClientMock<NetworkInterface, StringT>::begin(const char* aPath){
  return 0;
}

template <class NetworkInterface, class StringT>
int WebSocketClientMock<NetworkInterface, StringT>::beginMessage(int aType){
  return 0;
}

template <class NetworkInterface, class StringT>
int WebSocketClientMock<NetworkInterface, StringT>::endMessage(){
  return 0;
}

template <class NetworkInterface, class StringT>
int WebSocketClientMock<NetworkInterface, StringT>::parseMessage(){
  return 0;
}

template <class NetworkInterface, class StringT>
int WebSocketClientMock<NetworkInterface, StringT>::messageType(){
  return 0;
}

template <class NetworkInterface, class StringT>
StringT WebSocketClientMock<NetworkInterface, StringT>::readString(){
  return StringT{};
}

template <class NetworkInterface, class StringT>
size_t WebSocketClientMock<NetworkInterface, StringT>::write(const uint8_t *aBuffer, size_t aSize){
  return 0;
}
