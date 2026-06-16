import {
  registerDevice,
  createInitialDeviceTable, 
  deleteDevice,
  addDatapoint,
  createCompositeDeviceView,
  createCompositeDeviceViewError,
  createCompositeDeviceViewErrorStr,
} from './api_methods.js';

import {
  sqlConnectionPool,
  honeycombDBConnectionPool,
} from './sqlConnectionPool.js'

import {
  saltRehashDeviceSecret,
  deviceIDParameterValid,
  deviceSecretAuthentication,
  MAX_DEVICE_SECRET_CHARACTERS,
  MAX_DEVICE_VIEWING_SECRET_CHARACTERS,
  MAX_DEVICE_ID_CHARACTERS,
} from './auth.js';

import express from "express"
import cors from "cors"

const PORT_NUMBER = 5001

const app = express();
app.use(express.json({limit: "1kb"}))
app.use(cors());
const apiRouter = express.Router();

const HTTP_STATUS_FOR_CREATED = 201;
const HTTP_STATUS_FOR_BAD_REQUEST = 400; 
const HTTP_STATUS_FOR_UNAUTHORIZED = 401;
const HTTP_STATUS_FOR_SERVER_ERROR = 500;

const INCLUDE_FIRST_CHARACTER = 0;
const MIN_DEVICE_NAME_CHARACTERS = 1;
const MAX_DEVICE_NAME_CHARACTERS = 32;

apiRouter.post(
  "/device/:deviceID/datapoint", 
  deviceIDParameterValid, 
  deviceSecretAuthentication, 
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

apiRouter.post(
  "/device/", 
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
      const deviceID = await registerDevice(honeycombDBConnection, deviceSecretTrimmed, deviceViewingSecretTrimmed, deviceNameTrimmed, false);
      
      delete request.body.__deviceName;
      delete request.body.__deviceSecret;
      delete request.body.__deviceViewingSecret;
      
      const warnings = await createInitialDeviceTable(request.body, String(deviceID), honeycombDBConnection);
      
      await honeycombDBConnection.commit();
      honeycombDBConnectionPool.releaseConnection(honeycombDBConnection);
      response.status(HTTP_STATUS_FOR_CREATED).send({
        message: `created initial table for device ID ${String(deviceID)}.`,
        warnings: warnings,
      });
    }catch(err){
      await honeycombDBConnection.rollback();
      honeycombDBConnectionPool.releaseConnection(honeycombDBConnection);
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: err});
      throw err;
    }
  }
);

//This should accept either device secret, viewing secret or user credentials
apiRouter.get(
  "/device/:deviceID",
  deviceIDParameterValid,
  //deviceSecretAuthentication,
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

apiRouter.get(
  "/devices",
  async (request, response) => {
    try{
      const [devices] = await honeycombDBConnectionPool.execute("SELECT deviceID, deviceName, isCompositeDevice FROM Device");
      response.send({devices: devices});
    }catch(err){
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});      
      throw err;
    }
});

apiRouter.delete(
  "/device/:deviceID", 
  deviceIDParameterValid,
  deviceSecretAuthentication, 
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

apiRouter.post(
  "/compositeDevice",
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
        honeycombDBConnection, deviceSecretTrimmed, deviceViewingSecretTrimmed, deviceNameTrimmed, true
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
      });
    }catch(err){
      await honeycombDBConnection.rollback();
      honeycombDBConnectionPool.releaseConnection(honeycombDBConnection);
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: err});
      throw err;
    }
  }
);


app.use("/apiv1", apiRouter);
app.listen(PORT_NUMBER, async () => {
  await honeycombDBConnectionPool.execute("SELECT MAX(deviceID) FROM Device");
  console.log(`Honeycomb server running on port ${PORT_NUMBER}.`)
})