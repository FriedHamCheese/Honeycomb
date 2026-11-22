#include "arduino_mock.hpp"
#include "../Honeycomb/Honeycomb.hpp"
#include "../Honeycomb/ArduinoJson.h"

#include <iostream>

int main(){
  SerialMock serial;
  
  HoneycombClient<
    HttpClientMock<NetworkInterfaceMock, std::string>,
    WebSocketClientMock<NetworkInterfaceMock, std::string>,
    NetworkInterfaceMock, 
    std::string,
    SerialMock
  > client(
    " ", 65, 65, 65, 65, " ", 0, serial
  );
  return 0;
}