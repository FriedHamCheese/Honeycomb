import {
  registerDevice,
  registerCompositeDevice,
  getUserDevicePreviews,
  deleteDevice,
  addDatapoint,
  getDevice,
  getLatestDatapoint,
  checkUserOwnsDevice,
  getDeviceTableColumns,
} from './deviceController.js';

import {
  supportedDeviceDatatypes
} from './deviceLogic.js';

import {
  deviceIDParameterValid,
  deviceSecretAuthenticationMiddleware,
  checkCachedLoginMiddleware,
  checkAuthForDeviceQueryMiddleware,
  checkCachedLoginIsDeviceOwnerMiddleware,
} from '../auth.js';

import express from "express";
import {HTTP_STATUS_FOR_OK} from '../../../constraints.js';
export const deviceRouter = express.Router();

deviceRouter.get(
  "/test/:deviceID/owner",
  deviceIDParameterValid,
  checkCachedLoginIsDeviceOwnerMiddleware,
  (request, response) => response.sendStatus(HTTP_STATUS_FOR_OK)
);

deviceRouter.get(
  "/test/id/:deviceID",
  deviceIDParameterValid,
  (request, response) => response.send({
    deviceIDInt: request.deviceIDInt,
    deviceIDStr: request.deviceIDStr,
  })
);

deviceRouter.post(
  /*
  Input:
  - deviceSecret: str[0-32], truncated to 32 if exceeded
  - {(attributes: value)}
    - an attribute can be omitted, resulting in SQL null for the attribute in the row
    - if an attribute does not exist in the device initial column, it is ignored
  
  Returns:
  - HTTP status 201 if datapoint is added
  - HTTP status 400 with .error:str, if device is a composite device, or device ID from URL is not a positive integer
  - HTTP status 401 if deviceSecret is not a string type or not secret of the device
  - HTTP status 500 for undocumented server errors
  */
  "/:deviceID/datapoint", 
  deviceIDParameterValid, 
  deviceSecretAuthenticationMiddleware, 
  addDatapoint
);

deviceRouter.get(
  /*
  Returns:
  - HTTP status 200 with deviceLogic.supportedDeviceDatatypes
  */
  "/datatypes",
  (request, response) => {
    response.send(supportedDeviceDatatypes);
  }
)

deviceRouter.post(
  /*
  Input:
  - Authorization: user session token, uuid-hex, str[36]
  - {
    __deviceName: str[1-32],
    __deviceSecret: str[0-32],
    __deviceViewingSecret: str[0-32],
    (attribute: type),
    ...
  }
  See deviceLogic: supportedDeviceDatatypes.requestedTypes for available types.
  string type requires to be in "string[size]" to be valid, where size is from 0 to 255.
  
  Returns:
  - HTTP status 201 with {
    message: str
    warnings: str
    deviceID: int
  } if successful
  - HTTP status 400 with .error:str if request is invalid
  - HTTP status 401 if Authorization token is invalid
  - HTTP status 500 for undocumented server errors
  */
  "/", 
  checkCachedLoginMiddleware,
  registerDevice
);

deviceRouter.post(
  /*
  input:
  - Authorization: user session token, uuid-hex, str[36]
  - {
    __deviceName: str[1-32],
    __deviceSecret: str[0-32],
    __deviceViewingSecret: str[0-32],
    
    device0ID: int,
    device0ViewingSecret: str[0-32],
    device1ID: int,
    device1ViewingSecret: str[0-32],
    
    device0ConditionField: str[1-32],
    device1ConditionField: str[1-32],
    mergeUsingCondition: enum int{
      0 = equal, mergeConditionArgument can be null
      1 = within range
    },
    mergeConditionArgument: null, float
  }
  
  Returns:
  - HTTP status 201 with {
    message: str
    deviceID: int
  } if successful
  - HTTP status 400 with .error:str, if request is invalid
  - HTTP status 401 if user session token is invalid
  - HTTP status 500 for undocumented server errors
  */
  "/compositeDevice",
  checkCachedLoginMiddleware,
  registerCompositeDevice
);

deviceRouter.get(
  /*
  Input:
  - Authorization: userSessionToken, uuidv7-hex
  
  Returns:
  - {
    devices: [
      {
        deviceID: int(64),
        deviceName: str[1-32],
        isCompositeDevice: int(1),
        ownerUserID: int(64),
      },
      ...
    ]
  }, with HTTP status 200
  - HTTP status 401 with .error:str, if session token from Authorization is invalid
  - HTTP status 500 for undocumented server errors
  */
  "/userDeviceSummary", 
  checkCachedLoginMiddleware, 
  getUserDevicePreviews
);

deviceRouter.get(
  /*
  Returns:
  - HTTP status 200 with {
    domain: str,
    port: int,
    path: str
  } as parameters to form websocket URL on Arduino side
  - HTTP status 500 for undocumented server errors
  */
  "/webSocketURL",
  //Add inter-service check here
  (request, response) => {
    try{
      response.send({
        domain: process.env.WEBSOCKET_DOMAIN,
        port: Number(process.env.WEBSOCKET_PORT),
        path: process.env.WEBSOCKET_PATH,
      });
    }catch(err){
      console.log(err);
      response.status(HTTP_STATUS_INTERNAL_SERVER_ERROR).send({});
    }
  }
);

deviceRouter.get(
  /*
  Returns
  - HTTP status 200 with {
    columns: [SQL columns]
  }
  - HTTP status 400 with .error:str, if deviceID is invalid
  - HTTP status 500 for undocumented server errors
  */
  //Add inter-service check here
  "/:deviceID/columns",
  deviceIDParameterValid,
  getDeviceTableColumns
);

deviceRouter.get(
  /*
  - HTTP status 200 with {
    isOwner: bool
  }
  - HTTP status 400 with .error:str, if deviceID is invalid
  - HTTP status 500 for undocumented server errors
  */
  //Add inter-service check here
  "/:deviceID/isOwnedBy/:userID",
  deviceIDParameterValid,
  checkUserOwnsDevice
);

deviceRouter.get(
  /*
  TODO: have endpoint test with composite device
  
  Input:
  - Authorization: uuid user token, str[36]
  
  Returns:
  - HTTP status 200 with {
    datapoint: {lastestRow}
  }
  - HTTP status 400 with .error:str, if deviceID is invalid
  - HTTP status 401 with .error:str, if session token from Authorization is invalid
  - HTTP status 500 for undocumented server errors
  */
  "/:deviceID/latest",
  deviceIDParameterValid,
  checkCachedLoginIsDeviceOwnerMiddleware,
  getLatestDatapoint
);

deviceRouter.get(
  /*
  Input:
  - Authorization: uuid user token, str[36]
    or deviceSecret: str[0-32]
    or deviceViewingSecret: str[0-32]
  
  Returns:
  - HTTP status 200 with {
    deviceName: str,
    table: [tableRows]
  }
  - HTTP status 400 with .error:str, if deviceID is invalid
  - HTTP status 401 with .error:str if the given authentication method is invalid
  - HTTP status 500 for undocumented server errors
  */
  "/:deviceID",
  deviceIDParameterValid,
  checkAuthForDeviceQueryMiddleware,
  getDevice
);

deviceRouter.delete(
  /*
  Input:
  - Authorization: uuid user token, str[36]
  
  Returns:
  - HTTP status 200 with .message:str if done
  - HTTP status 400 with .error:str, if deviceID is invalid
  - HTTP status 401 with .error:str if user token is invalid
  - HTTP status 500 for undocumented server errors
  */
  "/:deviceID", 
  deviceIDParameterValid,
  checkCachedLoginIsDeviceOwnerMiddleware, 
  deleteDevice
);