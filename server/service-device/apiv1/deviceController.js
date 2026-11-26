import {
  registerDeviceLogic,
  addDatapointLogic,
  deleteDeviceLogic,
  createCompositeDeviceViewLogic,
  createCompositeDeviceViewError,
  createCompositeDeviceViewErrorStr,
  getDeviceTableNameFromID,
  parseBodyToSQLTableAttributes,
  checkPartialCompositeDeviceViewParameters,
} from './deviceLogic.js';

import {
  sqlConnectionPool,
} from '../sqlConnectionPool.js'

import {webSocketRouter} from './webSockets.js';

import {
  FIRST_CHARACTER,
  MAX_DEVICE_SECRET_CHARACTERS,
  MIN_DEVICE_NAME_CHARACTERS,
  MAX_DEVICE_NAME_CHARACTERS,
  MIN_COLUMN_NAME_CHARACTERS,
  MAX_COLUMN_NAME_CHARACTERS,
  MAX_DEVICE_VIEWING_SECRET_CHARACTERS,
  
  HTTP_STATUS_FOR_OK,
  HTTP_STATUS_FOR_CREATED,
  HTTP_STATUS_FOR_BAD_REQUEST,
  HTTP_STATUS_FOR_UNAUTHORIZED,
  HTTP_STATUS_FOR_SERVER_ERROR,
} from '../../../constraints.js';

import express from "express";
export const deviceRouter = express.Router();

export async function addDatapoint(request, response){
  const objectFromResponse = request.body;
  if((typeof objectFromResponse) !== "object")
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Response body must be JSON."});
  
  const tableName = getDeviceTableNameFromID(request.deviceIDInt);
  
  try{
    const isCompositeDevice = !(await addDatapointLogic(objectFromResponse, tableName, sqlConnectionPool, request.deviceIDInt));
    if(isCompositeDevice)
      response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: `Cannot add datapoint to a composite device.`});
    else{
      webSocketRouter.putToDevice(request.body, request.deviceIDInt);
      response.status(HTTP_STATUS_FOR_CREATED).send({message: `Added datapoint to device ${request.deviceIDStr}`});
    }
  }catch(err){
    response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});
    console.log(err);
  }
}

export async function registerDevice(request, response){
  if((typeof request.body) !== "object")
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Response body must be JSON."});
  
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

  delete request.body.__deviceName;
  delete request.body.__deviceSecret;
  delete request.body.__deviceViewingSecret;
  const parsedSQLAttributes = parseBodyToSQLTableAttributes(request.body, MIN_COLUMN_NAME_CHARACTERS, MAX_COLUMN_NAME_CHARACTERS);
  if(parsedSQLAttributes.error)
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: parsedSQLAttributes.error});
 
  let sqlConnection;
  let deviceID, warnings;
  try{
    sqlConnection = await sqlConnectionPool.getConnection();
    await sqlConnection.beginTransaction();
  
    let registrationError = false;
    try{
      deviceID = await registerDeviceLogic({
        sqlConnection, 
        deviceSecret: deviceSecretTrimmed, 
        viewingSecret: deviceViewingSecretTrimmed, 
        deviceName: deviceNameTrimmed, 
        isCompositeDevice: false, 
        ownerUserID: request.cachedLogin.userID
      });
      
      const finalTableAttributes = "__datapointIndex BIGINT PRIMARY KEY AUTO_INCREMENT, " + parsedSQLAttributes.sqlTableAttributes;
      const createTableQuery = `CREATE TABLE Honeycomb.${getDeviceTableNameFromID(deviceID)} (${finalTableAttributes});`; 
      await sqlConnection.execute(createTableQuery);
      
      await sqlConnection.commit();
    }catch(err){
      registrationError = true;
      await sqlConnection.rollback();
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: err});
      console.log(err);
    }
    
    if(!registrationError){
      response.status(HTTP_STATUS_FOR_CREATED).send({
        message: `created initial table for device ID ${String(deviceID)}.`,
        warnings: warnings,
        deviceID: deviceID,
      });
    }
  }catch(err){
    console.log(err);
    //Try sending again, a single fault without this might make user think the device wasn't created
    if(!registrationError){
      response.status(HTTP_STATUS_FOR_CREATED).send({
        message: `created initial table for device ID ${String(deviceID)}.`,
        warnings: warnings,
        deviceID: deviceID,
      });
    }else response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: err});
  }
  finally{
    if(sqlConnection)
      sqlConnectionPool.releaseConnection(sqlConnection);
  }
}

export async function registerCompositeDevice(request, response){  
  if((typeof request.body) !== "object")
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Response body must be JSON."});

  if((typeof request.body.__deviceSecret) !== "string")
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceSecret not string type."});
  if((typeof request.body.__deviceViewingSecret) !== "string")
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceViewingSecret not string type."});
  if((typeof request.body.__deviceName) !== "string")
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "__deviceName not string type."});    

  const partialParameterCheckError = checkPartialCompositeDeviceViewParameters(request.body);
  if(partialParameterCheckError)
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send(
      createCompositeDeviceViewErrorStr[partialParameterCheckError]
    );

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
 
  let sqlConnection;
  try{
    sqlConnection = await sqlConnectionPool.getConnection();
    await sqlConnection.beginTransaction();

    let registrationError = false;
    let deviceID;
    try{
      deviceID = await registerDeviceLogic({
        sqlConnection,
        deviceSecret: deviceSecretTrimmed,
        viewingSecret: deviceViewingSecretTrimmed,
        deviceName: deviceNameTrimmed,
        isCompositeDevice: true,
        ownerUserID: request.cachedLogin.userID
      });
      const createViewError = await createCompositeDeviceViewLogic(sqlConnection, request.body, deviceID);
      if(createViewError){
        await sqlConnection.rollback();
        registrationError = true;
        return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({
          error: createCompositeDeviceViewErrorStr[createViewError]
        });
      }

      await sqlConnection.commit();
    }catch(err){
      registrationError = true;
      await sqlConnection.rollback();
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: err});
      console.log(err);
    }

    if(!registrationError){
      response.status(HTTP_STATUS_FOR_CREATED).send({
        message: `created view for composite device ID ${String(deviceID)}.`,
        deviceID: deviceID,
      });
    }
  }catch(err){
    console.log(err);
    //Try sending again, a single fault without this might make user think the device wasn't created
    if(!registrationError){
      response.status(HTTP_STATUS_FOR_CREATED).send({
        message: `created view for composite device ID ${String(deviceID)}.`,
        deviceID: deviceID,
      });
    }else response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: err});
  }
  finally{
    if(sqlConnection)
      sqlConnectionPool.releaseConnection(sqlConnection);
  }
}

export async function getDevice(request, response){
  try{
    const [deviceNameResult, tableResult] = await Promise.all([
      sqlConnectionPool.execute(
        "SELECT deviceName FROM Honeycomb.Device WHERE deviceID = ?", [request.deviceIDInt]
      ),
      sqlConnectionPool.execute(
        `SELECT * FROM Honeycomb.${getDeviceTableNameFromID(request.deviceIDStr)}`
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
}

export async function getUserDevicePreviews(request, response){
  try{
    const [devices] = await sqlConnectionPool.execute(
      "SELECT deviceID, deviceName, isCompositeDevice, ownerUserID FROM Honeycomb.Device WHERE ownerUserID = ?", [request.cachedLogin.userID]
    );
    response.send({devices: devices});
  }catch(err){
    response.status(HTTP_STATUS_FOR_SERVER_ERROR).send();
    console.log(err);
  }
};

export async function checkUserOwnsDevice(request, response){
  const userID = Number.parseInt(request.params.userID, 10);
  if(Number.isNaN(userID) || userID < 0)
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "userID must be a positive integer."});

  try{
    const [matchingDevice] = await sqlConnectionPool.execute(
      "SELECT deviceID FROM Honeycomb.Device WHERE deviceID = ? AND ownerUserID = ?",
      [request.deviceIDInt, userID]
    );
    response.send({isOwner: matchingDevice.length !== 0});
  }catch(err){
    response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});
    console.log(err);
  }
}

export async function getLatestDatapoint(request, response){
  try{
    const [device] = await sqlConnectionPool.execute(
      "SELECT isCompositeDevice FROM Honeycomb.Device WHERE deviceID=?", [request.deviceIDInt]
    );
    if(device.length === 0)
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Device with given ID not found."});

    const datapointIndex = device[0].isCompositeDevice ? "1___datapointIndex" : "__datapointIndex";
    const [latestDatapoint] = await sqlConnectionPool.execute(
      `SELECT * FROM Honeycomb.${getDeviceTableNameFromID(request.deviceIDStr)}
       ORDER BY ${datapointIndex} DESC LIMIT 1`
    );

    response.send({datapoint: latestDatapoint[0] || null});
  }catch(err){
    response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});
    throw err;
  }
}

export async function getDeviceTableColumns(request, response){
  try{
    const [columns] = await sqlConnectionPool.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'Honeycomb' AND TABLE_NAME = ?",
      [getDeviceTableNameFromID(request.deviceIDStr)]
    );
    response.send({columns: columns.map((column) => column.COLUMN_NAME)});
  }catch(err){
    response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});
    console.log(err);
  }
}

export async function deleteDevice(request, response){
  try{
    //exceptions from SQL command execution.
    await deleteDeviceLogic(sqlConnectionPool, request.deviceIDStr, request.deviceIDInt);
    response.status(HTTP_STATUS_FOR_OK).send({message: `Deleted device ID ${request.deviceIDStr}`});    
  }catch(err){
    response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});
    throw err;
  }
}
