#include "arduino_mock.hpp"
#include "../Honeycomb/Honeycomb.hpp"
#include "../Honeycomb/ArduinoJson.h"

#include <cassert>
#include <iostream>

void test_read_incoming_messages();
void test_client_begin();
void test_client_authenticate();
void test_client_ping_server();
void test_client_patch_datapoint();

int main(){
  std::cout << "Testing HoneycombClient... All tests succeeds if no assertion errors occur below." << std::endl;
  test_client_begin();
  test_client_authenticate();
  test_client_ping_server();
  test_client_patch_datapoint();
  test_read_incoming_messages();
  return 0;
}
