import {
  parseBodyToSQLTableAttributes,
} from "./utils.js";

import {
  saltRehashDeviceSecret,
  deviceViewingSecretAuthentication,
  secretAuthenticationError,
} from './auth.js';

import {randomBytes} from 'node:crypto';

const MIN_COLUMN_NAME_CHARACTERS = 1;
const MAX_COLUMN_NAME_CHARACTERS = 32;  

export async function registerDevice(
  honeycombDBConnection,
  deviceSecret,
  viewingSecret,
  deviceName,
  isCompositeDevice,
  ownerUserID,
){
  const SALT_SIZE_BYTES = 16;
  const salt = randomBytes(SALT_SIZE_BYTES).toString('hex');
  const storingDeviceSecret = saltRehashDeviceSecret(deviceSecret, salt);
  const saltedViewingSecret = saltRehashDeviceSecret(viewingSecret, salt);
  
  const [insertionResult] = await honeycombDBConnection.execute(
    "INSERT INTO Device (saltedDeviceSecret, saltedViewingSecret, deviceSecretSalt, deviceName, isCompositeDevice, ownerUserID) VALUES (?,?,?,?,?,?)",
    [storingDeviceSecret, saltedViewingSecret, salt, deviceName, isCompositeDevice, ownerUserID]
  );
  const deviceID = insertionResult.insertId;
  return deviceID;
}

export async function createInitialDeviceTable(
  objectFromRequest, 
  deviceIDStr, 
  honeycombDBConnection
){
  /*
  Exceptions: exceptions from SQL command execution.
  Returns a string consisting of warnings from parsing client request. 
  If there are no warnings, empty string is returned.
  */
  
  delete objectFromRequest.__deviceName;
  delete objectFromRequest.__deviceSecret;
  delete objectFromRequest.__deviceViewingSecret;
  
  const {sqlTableAttributes, warnings} = parseBodyToSQLTableAttributes(
    objectFromRequest,
    MIN_COLUMN_NAME_CHARACTERS,
    MAX_COLUMN_NAME_CHARACTERS,
  );
  
  const finalTableAttributes = "__datapointIndex INT(64) PRIMARY KEY AUTO_INCREMENT, " + sqlTableAttributes;
  const createTableQuery = `CREATE TABLE ${deviceIDStr}_0 (${finalTableAttributes});`; 
  await honeycombDBConnection.execute(createTableQuery);
  return warnings;
}

export async function deleteDevice(
  honeycombDBConnectionPool,
  sqlConnectionPool,
  deviceIDStr,
  deviceIDInt
){
  /*
  Exceptions: exceptions from SQL connections, connection pools or command execution.
  Returns nothing.
  */
  const honeycombDBConnection = await honeycombDBConnectionPool.getConnection();
  try{
    const [tableNamesOfDevice] = await sqlConnectionPool.execute(`SELECT DISTINCT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME LIKE '${deviceIDStr}%'`);    
    const promises = [];

    await honeycombDBConnection.beginTransaction();
    promises.push(honeycombDBConnection.execute("DELETE FROM Device WHERE deviceID = ?", [deviceIDInt]));
    for(const tableName of tableNamesOfDevice)
      promises.push(honeycombDBConnection.execute(`DROP TABLE ${tableName.TABLE_NAME}`));  
    
    await Promise.all(promises);
    await honeycombDBConnection.commit();
  }catch(err){
    await honeycombDBConnection.rollback();
    honeycombDBConnectionPool.releaseConnection(honeycombDBConnection);
    throw err;
  }
  
  honeycombDBConnectionPool.releaseConnection(honeycombDBConnection);
}

export async function addDatapoint(
  objectFromResponse, 
  tableName, 
  sqlConnectionPool, 
  honeycombDBConnectionPool,
  deviceID,
){  
  const [deviceQuery] = await honeycombDBConnectionPool.execute(
    "SELECT isCompositeDevice FROM Device WHERE deviceID = ?", [deviceID]
  );
  const cannotAddToSQLView = deviceQuery[0].isCompositeDevice;
  if(cannotAddToSQLView) return false;

  const [queryResult] = await sqlConnectionPool.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME = '${tableName}'`
  );
  
  const columns = [];
  const correspondingValues = [];
  for(const e of queryResult){
    const columnName = e.COLUMN_NAME;
    const correspondingValue = objectFromResponse[columnName];
    const fillColumnWithSQLNull = (correspondingValue === undefined) || (correspondingValue === null);
    if(fillColumnWithSQLNull) continue;
    
    columns.push(columnName);
    correspondingValues.push(correspondingValue);
  }
  
  const FIRST_ELEMENT = 0;
  const joinedColumnNames = columns.join(',');
  const valuePositions = Array(columns.length).fill('?', FIRST_ELEMENT);
  const sqlQuery = `INSERT INTO ${tableName} (${joinedColumnNames}) VALUES (${valuePositions.join(',')})`;
  
  await honeycombDBConnectionPool.execute(
    sqlQuery,
    correspondingValues
  );
  return true;
}


export const createCompositeDeviceViewError = {
  OK: 0,
  DEVICE0ID: 1,
  DEVICE1ID: 2,
  DEVICE0_VIEWING_SECRET: 3,
  DEVICE1_VIEWING_SECRET: 4,
  DEVICE0_CONDITION_FIELD: 5,
  DEVICE1_CONDITION_FIELD: 6,
  MERGING_CONDITION: 7,
  MERGING_CONDITION_ARGUMENT: 8,
  DATATYPE_MISMATCH: 9,
};

export const createCompositeDeviceViewErrorStr = {
  0: "OK",
  1: "Invalid device 0 ID",
  2: "Invalid device 1 ID",
  3: "Invalid device 0 viewing secret",
  4: "Invalid device 1 viewing secret",
  5: "Invalid device 0 name of column for merging condition",
  6: "Invalid device 1 name of column for merging condition",
  7: "Invalid merging condition type",
  8: "Invalid merging condition supporting argument",
  9: "Specified merging condition columns of device 0 and device 1 have type mismatch",
};

export async function createCompositeDeviceView(
  sqlConnectionPool,
  honeycombDBConnection,
  objectFromRequest,
  deviceID,
){
  if(typeof(objectFromRequest.device0ID) !== "number")
    return createCompositeDeviceViewError.DEVICE0ID;
  if(typeof(objectFromRequest.device1ID) !== "number")
    return createCompositeDeviceViewError.DEVICE1ID;
  
  if(!Number.isInteger(objectFromRequest.device0ID))
    return createCompositeDeviceViewError.DEVICE0ID;
  if(!Number.isInteger(objectFromRequest.device1ID))
    return createCompositeDeviceViewError.DEVICE1ID;
  
  if(typeof(objectFromRequest.device0ViewingSecret) !== "string")
    return createCompositeDeviceViewError.DEVICE0_VIEWING_SECRET;
  if(typeof(objectFromRequest.device1ViewingSecret) !== "string")
    return createCompositeDeviceViewError.DEVICE1_VIEWING_SECRET;
  
  if(typeof(objectFromRequest.device0ConditionField) !== "string")
    return createCompositeDeviceViewError.DEVICE0_CONDITION_FIELD;
  if(typeof(objectFromRequest.device1ConditionField) !== "string")
    return createCompositeDeviceViewError.DEVICE1_CONDITION_FIELD;
  
  if(typeof(objectFromRequest.mergeUsingCondition) !== "number")
    return createCompositeDeviceViewError.MERGING_CONDITION;
  
  const device0AuthError = await deviceViewingSecretAuthentication(
    objectFromRequest.device0ID, objectFromRequest.device0ViewingSecret, honeycombDBConnection
  );
  if(device0AuthError) return createCompositeDeviceViewError.DEVICE0_VIEWING_SECRET;
  
  const device1AuthError = await deviceViewingSecretAuthentication(
    objectFromRequest.device1ID, objectFromRequest.device1ViewingSecret, honeycombDBConnection
  );
  if(device1AuthError) return createCompositeDeviceViewError.DEVICE1_VIEWING_SECRET;
  
  const device0TableName = objectFromRequest.device0ID + "_0";
  const device1TableName = objectFromRequest.device1ID + "_0";
  
  const trimmedDevice0ConditionField = objectFromRequest.device0ConditionField.trim();
  const trimmedDevice1ConditionField = objectFromRequest.device1ConditionField.trim();
  
  const [device0Columns] = await sqlConnectionPool.execute(
    "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = ?", 
    [device0TableName]
  );
  const [device1Columns] = await sqlConnectionPool.execute(
    "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = ?", 
    [device1TableName]
  );
  
  const matchingDevice0ConditionColumns = device0Columns.filter((element) => {
      return element.COLUMN_NAME === trimmedDevice0ConditionField;
  });
  const matchingDevice1ConditionColumns = device1Columns.filter((element) => {
      return element.COLUMN_NAME === trimmedDevice1ConditionField;
  });  
  
  const invalidDevice0Column = matchingDevice0ConditionColumns.length === 0;
  if(invalidDevice0Column) return createCompositeDeviceViewError.DEVICE0_CONDITION_FIELD;
  const invalidDevice1Column = matchingDevice1ConditionColumns.length === 0;  
  if(invalidDevice1Column) return createCompositeDeviceViewError.DEVICE1_CONDITION_FIELD;
  
  const columnNotSameType = matchingDevice0ConditionColumns[0].DATA_TYPE !== matchingDevice1ConditionColumns[0].DATA_TYPE;
  if(columnNotSameType) return createCompositeDeviceView.DATATYPE_MISMATCH;
  
  for(let i = 0; i < device0Columns.length; i++)
    device0Columns[i] = `${device0TableName}.${device0Columns[i].COLUMN_NAME} AS ${device0TableName}_${device0Columns[i].COLUMN_NAME}`
  for(let i = 0; i < device1Columns.length; i++)
    device1Columns[i] = `${device1TableName}.${device1Columns[i].COLUMN_NAME} AS ${device1TableName}_${device1Columns[i].COLUMN_NAME}`
  const columnsWithDevicePrefix = device0Columns.concat(device1Columns);
  const columnsWithDevicePrefixStr = columnsWithDevicePrefix.join(',');
  
  const viewWithoutCondition = `CREATE VIEW ${deviceID}_0 AS SELECT ${columnsWithDevicePrefixStr} FROM ${device0TableName}, ${device1TableName}`;
  const MERGE_ON_EQUAL_VALUES = 0;
  const MERGE_ON_VALUE_WITHIN_RANGE = 1;
  
  if(objectFromRequest.mergeUsingCondition === MERGE_ON_EQUAL_VALUES){
    const viewWithCondition = `${viewWithoutCondition} WHERE ${device0TableName}.${trimmedDevice0ConditionField} = ${device1TableName}.${trimmedDevice1ConditionField}`;
    honeycombDBConnection.execute(viewWithCondition);
    return createCompositeDeviceViewError.OK;
  }
  
  if(objectFromRequest.mergeUsingCondition === MERGE_ON_VALUE_WITHIN_RANGE){
    if(typeof(objectFromRequest.mergeConditionArgument) !== "number")
      return createCompositeDeviceViewError.MERGING_CONDITION_ARGUMENT;
    if(Number.isNaN(objectFromRequest.mergeConditionArgument))
      return createCompositeDeviceViewError.MERGING_CONDITION_ARGUMENT;
    
    const withinRangeCondition = ` WHERE ABS(${device0TableName}.${trimmedDevice0ConditionField} - ${device1TableName}.${trimmedDevice1ConditionField}) <= ${objectFromRequest.mergeConditionArgument}`;
    await honeycombDBConnection.execute(viewWithoutCondition + withinRangeCondition);
    return createCompositeDeviceViewError.OK;
  }
  
  return createCompositeDeviceViewError.MERGING_CONDITION;
}