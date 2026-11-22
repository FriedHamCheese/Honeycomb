## Very Work-in-progress!
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

<img width="832" height="829" alt="Screenshot_22-11-2026_145617_localhost" src="https://github.com/user-attachments/assets/28247060-f5c9-41ca-9394-86f38ba84dc1" />
<img width="832" height="829" alt="Screenshot_22-11-2026_145721_localhost" src="https://github.com/user-attachments/assets/5a61b72b-75e5-468b-8491-29ff5d0ee991" />
<img width="832" height="829" alt="Screenshot_22-11-2026_145729_localhost" src="https://github.com/user-attachments/assets/0ad14ecc-8786-416e-8c29-d978930085c4" />
<img width="832" height="440" alt="Screenshot_22-11-2026_145759_localhost" src="https://github.com/user-attachments/assets/52e26f1f-da3b-49a9-a702-6355242146e0" />
