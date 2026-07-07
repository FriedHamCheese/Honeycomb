import {
  registerDevice,
  createInitialDeviceTable, 
  deleteDevice,
  addDatapoint,
  createCompositeDeviceView,
  createCompositeDeviceViewError,
  createCompositeDeviceViewErrorStr,
} from '../api_methods.js';

import {
  sqlConnectionPool,
  honeycombDBConnectionPool,
} from '../sqlConnectionPool.js'

import {
  deviceIDParameterValid,
  deviceSecretAuthenticationMiddleware,
  checkCachedLoginMiddleware,
  checkAuthForDeviceQueryMiddleware,
  checkCachedLoginIsDeviceOwnerMiddleware,
} from '../auth.js';

import {
  FIRST_CHARACTER,
  MAX_DEVICE_SECRET_CHARACTERS,
  MIN_DEVICE_NAME_CHARACTERS,
  MAX_DEVICE_NAME_CHARACTERS,
  MAX_DEVICE_VIEWING_SECRET_CHARACTERS,
  
  HTTP_STATUS_FOR_OK,
  HTTP_STATUS_FOR_CREATED,
  HTTP_STATUS_FOR_BAD_REQUEST,
  HTTP_STATUS_FOR_UNAUTHORIZED,
  HTTP_STATUS_FOR_SERVER_ERROR,
} from '../../constraints.js';

import {webSocketRouterToMCU} from './webSockets.js';

import express from "express";
export const deviceRouter = express.Router();

deviceRouter.post(
  "/:deviceID/datapoint", 
  deviceIDParameterValid, 
  deviceSecretAuthenticationMiddleware, 
  async (request, response) => {
    /*
    Input:
    - Authorization: device secret, str[1-32]'
    - {(attributes: value)}
    
    Returns:
    - HTTP status 201 if datapoint is added
    - HTTP status 400 with .error:str, if device is a composite device, or device ID from URL is not a positive integer
    - HTTP status 401 if Authorization is not a string type or not secret of the device
    - HTTP status 500 for undocumented server errors
    */
    const objectFromResponse = request.body;
    const tableName = `${request.deviceIDStr}_0`;
    
    try{
      const isCompositeDevice = !(await addDatapoint(objectFromResponse, tableName, sqlConnectionPool, honeycombDBConnectionPool, request.deviceIDInt));
      if(isCompositeDevice)
        response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: `Cannot add datapoint to a composite device.`});
      else
        response.status(HTTP_STATUS_FOR_CREATED).send({message: `Added datapoint to device ${request.deviceIDStr}`});
    }catch(err){
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});
      console.log(err);
    }    
  }
);

deviceRouter.post(
  "/", 
  checkCachedLoginMiddleware,
  async (request, response) => {
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
    
    Returns:
    - HTTP status 201 with {
      message: str
      warnings: str
      deviceID: int
    } if successful
      if successful
    - HTTP status 400 with .error: str if request is invalid
    - HTTP status 401 if Authorization token is invalid
    - HTTP status 500 for undocumented server errors
    */
    if((typeof request.body.__deviceSecret) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceSecret not string type."});
    if((typeof request.body.__deviceViewingSecret) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceViewingSecret not string type."});
    if((typeof request.body.__deviceName) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceName not string type."});    
    
    const deviceSecretTrimmed = request.body.__deviceSecret
      .substring(FIRST_CHARACTER, MAX_DEVICE_SECRET_CHARACTERS)
      .trim()
    ;
    const deviceViewingSecretTrimmed = request.body.__deviceViewingSecret
      .substring(FIRST_CHARACTER, MAX_DEVICE_VIEWING_SECRET_CHARACTERS)
      .trim()
    ;
  
    const deviceNameTrimmed = request.body.__deviceName
      .substring(FIRST_CHARACTER, MAX_DEVICE_NAME_CHARACTERS)
      .trim()
    ;
    if(deviceNameTrimmed.length < MIN_DEVICE_NAME_CHARACTERS){
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({
        error: "Device name requires at least 1 character."
      });
    }
   
    const honeycombDBConnection = await honeycombDBConnectionPool.getConnection();
    await honeycombDBConnection.beginTransaction();

    try{
      const deviceID = await registerDevice(
          honeycombDBConnection, 
          deviceSecretTrimmed, 
          deviceViewingSecretTrimmed, 
          deviceNameTrimmed, 
          false, 
          request.cachedLogin.userID
        );
      const warnings = await createInitialDeviceTable(request.body, String(deviceID), honeycombDBConnection);

      await honeycombDBConnection.commit();
      honeycombDBConnectionPool.releaseConnection(honeycombDBConnection);
      response.status(HTTP_STATUS_FOR_CREATED).send({
        message: `created initial table for device ID ${String(deviceID)}.`,
        warnings: warnings,
        deviceID: deviceID,
      });
    }catch(err){
      await honeycombDBConnection.rollback();
      honeycombDBConnectionPool.releaseConnection(honeycombDBConnection);
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: err});
      console.log(err);
    }
  }
);

deviceRouter.post(
  "/compositeDevice",
  checkCachedLoginMiddleware,
  async (request, response) => {
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
        0 = equal
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
    
    if((typeof request.body.__deviceSecret) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceSecret not string type."});
    if((typeof request.body.__deviceViewingSecret) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceViewingSecret not string type."});
    if((typeof request.body.__deviceName) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceName not string type."});    
    
    const deviceSecretTrimmed = request.body.__deviceSecret
      .substring(FIRST_CHARACTER, MAX_DEVICE_SECRET_CHARACTERS)
      .trim()
    ;
    const deviceViewingSecretTrimmed = request.body.__deviceViewingSecret
      .substring(FIRST_CHARACTER, MAX_DEVICE_VIEWING_SECRET_CHARACTERS)
      .trim()
    ;
  
    const deviceNameTrimmed = request.body.__deviceName
      .substring(FIRST_CHARACTER, MAX_DEVICE_NAME_CHARACTERS)
      .trim()
    ;
    if(deviceNameTrimmed.length < MIN_DEVICE_NAME_CHARACTERS){
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({
        error: "Device name requires at least 1 character."
      });
    }
   
    const honeycombDBConnection = await honeycombDBConnectionPool.getConnection();
    await honeycombDBConnection.beginTransaction();
    try{
      const deviceID = await registerDevice(
        honeycombDBConnection, 
        deviceSecretTrimmed, 
        deviceViewingSecretTrimmed, 
        deviceNameTrimmed, 
        true, 
        request.cachedLogin.userID
      );
      const createViewError = await createCompositeDeviceView(sqlConnectionPool, honeycombDBConnection, request.body, deviceID);
      if(createViewError){
        await honeycombDBConnection.rollback();
        honeycombDBConnectionPool.releaseConnection(honeycombDBConnection);          
        
        return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({
          error: createCompositeDeviceViewErrorStr[createViewError]
        });
      }
      
      await honeycombDBConnection.commit();
      honeycombDBConnectionPool.releaseConnection(honeycombDBConnection);
      response.status(HTTP_STATUS_FOR_CREATED).send({
        message: `created view for composite device ID ${String(deviceID)}.`,
        deviceID: deviceID,
      });
    }catch(err){
      await honeycombDBConnection.rollback();
      honeycombDBConnectionPool.releaseConnection(honeycombDBConnection);
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: err});
      console.log(err);
    }
  }
);

deviceRouter.get(
  "/:deviceID",
  deviceIDParameterValid,
  checkAuthForDeviceQueryMiddleware,
  async (request, response) => {
    try{
      const [deviceNameResult, tableResult] = await Promise.all([
        honeycombDBConnectionPool.execute(
          "SELECT deviceName FROM Device WHERE deviceID = ?", [request.deviceIDInt]
        ),
        honeycombDBConnectionPool.execute(
          `SELECT * FROM ${request.deviceIDStr}_0`
        ),
      ]);
      
      const QUERY_RESULT = 0;
      webSocketRouterToMCU.putToDevice(JSON.stringify({
          __messageType: "patch", temperature_celsius: 25.0, relative_humidity_percent: 75.0
        }), 
        request.deviceIDInt
      );
      response.send({
        deviceName: deviceNameResult[QUERY_RESULT][0].deviceName,
        table: tableResult[QUERY_RESULT],
      });
    }catch(err){
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});      
      throw err;
    }
});

deviceRouter.delete(
  "/:deviceID", 
  deviceIDParameterValid,
  checkCachedLoginIsDeviceOwnerMiddleware, 
  async (request, response) => {
    try{
      //exceptions from SQL command execution.
      await deleteDevice(honeycombDBConnectionPool, sqlConnectionPool, request.deviceIDStr, request.deviceIDInt);
      response.status(HTTP_STATUS_FOR_OK).send({message: `Deleted device ID ${request.deviceIDStr}`});    
    }catch(err){
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});
      throw err;
    }
  }
);