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
  MAX_DEVICE_SECRET_CHARACTERS,
  MAX_DEVICE_VIEWING_SECRET_CHARACTERS,
  MAX_DEVICE_ID_CHARACTERS,
} from '../auth.js';

import express from "express";
export const deviceRouter = express.Router();

const HTTP_STATUS_FOR_CREATED = 201;
const HTTP_STATUS_FOR_BAD_REQUEST = 400; 
const HTTP_STATUS_FOR_UNAUTHORIZED = 401;
const HTTP_STATUS_FOR_SERVER_ERROR = 500;

const INCLUDE_FIRST_CHARACTER = 0;
const MIN_DEVICE_NAME_CHARACTERS = 1;
const MAX_DEVICE_NAME_CHARACTERS = 32;

deviceRouter.post(
  "/:deviceID/datapoint", 
  deviceIDParameterValid, 
  deviceSecretAuthenticationMiddleware, 
  async (request, response) => {
    const objectFromResponse = request.body;
    const tableName = `${request.deviceIDStr}_0`;
    
    try{
      const isCompositeDevice = !(await addDatapoint(objectFromResponse, tableName, sqlConnectionPool, honeycombDBConnectionPool, request.deviceIDInt));
      if(isCompositeDevice)
        response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({message: `Cannot add datapoint to a composite device.`});
      else
        response.status(HTTP_STATUS_FOR_CREATED).send({message: `Added datapoint to device ${request.deviceIDStr}`});
    }catch(err){
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({err: String(err)});
      throw err;
    }    
  }
);

deviceRouter.post(
  "/", 
  checkCachedLoginMiddleware,
  async (request, response) => {
    /*
    input:{
      __deviceName: str[1-32],
      __deviceSecret: str[0-64],
      __deviceViewingSecret: str[0-64],
      (attribute: type),
      ...
    }
    */
    if((typeof request.body.__deviceSecret) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceSecret not string type."});
    if((typeof request.body.__deviceViewingSecret) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceViewingSecret not string type."});
    if((typeof request.body.__deviceName) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceName not string type."});    
    
    const deviceSecretTrimmed = request.body.__deviceSecret
      .substring(INCLUDE_FIRST_CHARACTER, MAX_DEVICE_SECRET_CHARACTERS)
      .trim()
    ;
    const deviceViewingSecretTrimmed = request.body.__deviceViewingSecret
      .substring(INCLUDE_FIRST_CHARACTER, MAX_DEVICE_VIEWING_SECRET_CHARACTERS)
      .trim()
    ;
  
    const deviceNameTrimmed = request.body.__deviceName
      .substring(INCLUDE_FIRST_CHARACTER, MAX_DEVICE_NAME_CHARACTERS)
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
      throw err;
    }
  }
);

deviceRouter.post(
  "/compositeDevice",
  checkCachedLoginMiddleware,
  async (request, response) => {
    /*
    input:{
      __deviceName: str[1-32],
      __deviceSecret: str[64],
      __deviceViewingSecret: str[0-64],
      
      device0ID: int,
      device0ViewingSecret: str[64],
      device1ID: int,
      device1ViewingSecret: str[64],
      
      device0ConditionField: str[1-32],
      device1ConditionField: str[1-32],
      mergeUsingCondition: enum int{
        0 = equal
        1 = within range
      },
      mergeConditionArgument: null, float
    }    
    */
    
    if((typeof request.body.__deviceSecret) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceSecret not string type."});
    if((typeof request.body.__deviceViewingSecret) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceViewingSecret not string type."});
    if((typeof request.body.__deviceName) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceName not string type."});    
    
    const deviceSecretTrimmed = request.body.__deviceSecret
      .substring(INCLUDE_FIRST_CHARACTER, MAX_DEVICE_SECRET_CHARACTERS)
      .trim()
    ;
    const deviceViewingSecretTrimmed = request.body.__deviceViewingSecret
      .substring(INCLUDE_FIRST_CHARACTER, MAX_DEVICE_VIEWING_SECRET_CHARACTERS)
      .trim()
    ;
  
    const deviceNameTrimmed = request.body.__deviceName
      .substring(INCLUDE_FIRST_CHARACTER, MAX_DEVICE_NAME_CHARACTERS)
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
      throw err;
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
    const HTTP_STATUS_FOR_OK = 200;    
    const HTTP_STATUS_FOR_SERVER_ERROR = 500;
    
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