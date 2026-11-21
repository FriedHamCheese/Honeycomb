# Honeycomb
A project aiming to recreate Arduino Cloud ecosystem to serve as learning area for backend and database development, 
and microcontroller networking.

# Target Features/Implementations
- [x]  Device creation with custom SQL tables via API request
- [x]  Datapoint storage
- [x]  "Composite Device" - not tied to a microcontroller but merging rows of 2 microcontrollers together
- [x]  Endpoint authentication enforcements
  - Although currently microservice-v1 exposed a few service-service endpoint with no validation, will get around it soon!
- [x]  WebSocket implementation on Arduino side and server side, no wasteful frequent polling for current data
  - [ ]  Implement "wait until other side responds", improving reliability
- [x]  Editable Dashboard per device
- [x]  Microservice architecture
  - [x] API Gateway
  - [x] Service-service SQL table merging mechanism
  - [ ] API Gateway authenticates request so no service-service calls and easier post-gateway mocking for each service 
  - Don't do unless you have a specific vertical scaling issue or have too many people on the team
- [ ] Over-the-air software update to microcontroller
  - [ ] Allow user to upload compiled .bin file and use ESP8266httpUpdate or equivalent
- [ ] Payment-based feature quota
