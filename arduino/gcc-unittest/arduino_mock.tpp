#include <algorithm>
#include <cstring>
#include <cstdint>
#include <cstddef>

template <class NetworkInterface, class StringT>
HttpClientMock<NetworkInterface, StringT>::HttpClientMock(
  NetworkInterface&, const char* aServerName, uint16_t aServerPort
){
  this->serverNameFromCtor = StringT(aServerName);
  this->serverPortFromCtor = aServerPort;
}

template <class NetworkInterface, class StringT>
int HttpClientMock<NetworkInterface, StringT>::get(const char* aURLPath){
  this->pathFromGet = StringT(aURLPath);
  return this->getReturnValue;
}

template <class NetworkInterface, class StringT>
int HttpClientMock<NetworkInterface, StringT>::responseStatusCode(){
  return this->responseStatusCodeValue;
}

template <class NetworkInterface, class StringT>
long HttpClientMock<NetworkInterface, StringT>::contentLength(){
  return this->contentLengthValue;
}

template <class NetworkInterface, class StringT>
StringT HttpClientMock<NetworkInterface, StringT>::responseBody(){
  return this->responseBodyValue;
}

template <class NetworkInterface, class StringT>
void HttpClientMock<NetworkInterface, StringT>::flush(){
  return;
}

template <class NetworkInterface, class StringT>
void HttpClientMock<NetworkInterface, StringT>::stop(){
  return;
}


template <class NetworkInterface, class StringT>
WebSocketClientMock<NetworkInterface, StringT>::WebSocketClientMock(
  NetworkInterface&,
  const char* aServerName,
  uint16_t aServerPort
){
  WebSocketClientMock<NetworkInterface, StringT>::serverNameFromCtor = StringT(aServerName);
  WebSocketClientMock<NetworkInterface, StringT>::serverPortFromCtor = aServerPort;
}

template <class NetworkInterface, class StringT>
int WebSocketClientMock<NetworkInterface, StringT>::begin(const char* aPath){
  WebSocketClientMock<NetworkInterface, StringT>::pathFromBegin = StringT(aPath);
  return WebSocketClientMock<NetworkInterface, StringT>::beginReturnValue;
}

template <class NetworkInterface, class StringT>
int WebSocketClientMock<NetworkInterface, StringT>::beginMessage(int aType){
  WebSocketClientMock<NetworkInterface, StringT>::messageTypeFromBeginMessage = aType;
  return WebSocketClientMock<NetworkInterface, StringT>::beginMessageReturnValue;
}

template <class NetworkInterface, class StringT>
int WebSocketClientMock<NetworkInterface, StringT>::endMessage(){
  return WebSocketClientMock<NetworkInterface, StringT>::endMessageReturnValue;
}

template <class NetworkInterface, class StringT>
int WebSocketClientMock<NetworkInterface, StringT>::parseMessage(){
  return WebSocketClientMock<NetworkInterface, StringT>::parseMessageReturnValue;
}

template <class NetworkInterface, class StringT>
int WebSocketClientMock<NetworkInterface, StringT>::messageType(){
  return WebSocketClientMock<NetworkInterface, StringT>::messageTypeReturnValue;
}

template <class NetworkInterface, class StringT>
StringT WebSocketClientMock<NetworkInterface, StringT>::readString(){
  return WebSocketClientMock<NetworkInterface, StringT>::readStringValue;
}

template <class NetworkInterface, class StringT>
size_t WebSocketClientMock<NetworkInterface, StringT>::write(const uint8_t *aBuffer, size_t aSize){
  const size_t writtenBytes = std::min(aSize, WebSocketClientMock<NetworkInterface, StringT>::writeBufferBytes);
  strncpy(static_cast<char*>(static_cast<void*>(writeBuffer)), static_cast<const char*>(static_cast<const void*>(aBuffer)), writtenBytes);
  WebSocketClientMock<NetworkInterface, StringT>::writeSizeValue = writtenBytes;
  return writtenBytes;
}
