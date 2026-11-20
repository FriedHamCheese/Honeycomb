import {
  saltAndRehash,
  deviceViewingSecretAuthentication,
  secretAuthenticationError,
} from '../auth.js';

import {randomBytes} from 'node:crypto';
import {MAX_COLUMN_NAME_CHARACTERS, MAX_TYPE_CHARACTERS} from '../../../constraints.js';

const MIN_COLUMN_NAME_CHARACTERS = 1;

export async function registerDeviceLogic({
  sqlConnection,
  deviceSecret,
  viewingSecret,
  deviceName,
  isCompositeDevice,
  ownerUserID,
}){
  //Raises MySQL exceptions
  const SALT_SIZE_BYTES = 16;
  const salt = randomBytes(SALT_SIZE_BYTES).toString('hex');
  const storingDeviceSecret = saltAndRehash(deviceSecret, salt);
  const saltedViewingSecret = saltAndRehash(viewingSecret, salt);
  
  const [insertionResult] = await sqlConnection.execute(
    "INSERT INTO Honeycomb.Device (saltedDeviceSecret, saltedViewingSecret, deviceSecretSalt, deviceName, isCompositeDevice, ownerUserID) VALUES (?,?,?,?,?,?)",
    [storingDeviceSecret, saltedViewingSecret, salt, deviceName, isCompositeDevice, ownerUserID]
  );
  const deviceID = insertionResult.insertId;
  return deviceID;
}

export async function deleteDeviceLogic(
  sqlConnectionPool,
  deviceIDStr,
  deviceIDInt
){
  /*
  Exceptions: exceptions from SQL connections, connection pools or command execution.
  Returns nothing.
  */
  const sqlConnection = await sqlConnectionPool.getConnection();
  try{
    const promises = [];

    await sqlConnection.beginTransaction();
    await Promise.all([
      sqlConnection.execute("DELETE FROM Honeycomb.Device WHERE deviceID = ?", [deviceIDInt]),
      sqlConnection.execute(`DROP TABLE Honeycomb.${getDeviceTableNameFromID(deviceIDStr)}`)
    ]);

    await sqlConnection.commit();
  }catch(err){
    await sqlConnection.rollback();
    sqlConnectionPool.releaseConnection(sqlConnection);
    throw err;
  }
  
  sqlConnectionPool.releaseConnection(sqlConnection);
}

export async function addDatapointLogic(
  objectFromResponse, 
  tableName, 
  sqlConnectionPool, 
  deviceID,
){
  //Raises SQL exceptions
  const [deviceQuery, columnQuery] = await Promise.all([
    sqlConnectionPool.execute("SELECT isCompositeDevice FROM Honeycomb.Device WHERE deviceID = ?", [deviceID]),
    sqlConnectionPool.execute(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME = '${tableName}'`),
  ]);
  
  const QUERY = 0;
  const cannotAddToSQLView = deviceQuery[QUERY][0].isCompositeDevice;
  if(cannotAddToSQLView) return false;
  
  const columns = [];
  const correspondingValues = [];
  for(const e of columnQuery[QUERY]){
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
  const sqlQuery = `INSERT INTO Honeycomb.${tableName} (${joinedColumnNames}) VALUES (${valuePositions.join(',')})`;
  
  await sqlConnectionPool.execute(
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

export function checkPartialCompositeDeviceViewParameters(objectFromRequest){
  if(!Number.isInteger(objectFromRequest.device0ID))
    return createCompositeDeviceViewError.DEVICE0ID;
  if(objectFromRequest.device0ID < 0)
    return createCompositeDeviceViewError.DEVICE0ID;
  
  if(!Number.isInteger(objectFromRequest.device1ID))
    return createCompositeDeviceViewError.DEVICE1ID;
  if(objectFromRequest.device1ID < 0)
    return createCompositeDeviceViewError.DEVICE0ID;
  
  if(typeof(objectFromRequest.device0ViewingSecret) !== "string")
    return createCompositeDeviceViewError.DEVICE0_VIEWING_SECRET;
  if(typeof(objectFromRequest.device1ViewingSecret) !== "string")
    return createCompositeDeviceViewError.DEVICE1_VIEWING_SECRET;
  
  if(typeof(objectFromRequest.device0ConditionField) !== "string")
    return createCompositeDeviceViewError.DEVICE0_CONDITION_FIELD;
  if(typeof(objectFromRequest.device1ConditionField) !== "string")
    return createCompositeDeviceViewError.DEVICE1_CONDITION_FIELD;
  
  if(!Number.isInteger(objectFromRequest.mergeUsingCondition))
    return createCompositeDeviceViewError.MERGING_CONDITION;
  if(objectFromRequest.mergeUsingCondition < 0)
    return createCompositeDeviceViewError.MERGING_CONDITION; 
  
  if(objectFromRequest.mergeUsingCondition !== 0)
    if(typeof(objectFromRequest.mergeConditionArgument) !== "number")
      return createCompositeDeviceViewError.MERGING_CONDITION_ARGUMENT;
  
  return createCompositeDeviceViewError.OK;
}

export async function createCompositeDeviceViewLogic(
  sqlConnection,
  objectFromRequest,
  deviceID,
){
  //Raises MySQL exceptions
  const [device0AuthError, device1AuthError] = await Promise.all([
    deviceViewingSecretAuthentication(
      objectFromRequest.device0ID, objectFromRequest.device0ViewingSecret, sqlConnection
    ),
    deviceViewingSecretAuthentication(
      objectFromRequest.device1ID, objectFromRequest.device1ViewingSecret, sqlConnection
    ),
  ]);

  if(device0AuthError) return createCompositeDeviceViewError.DEVICE0_VIEWING_SECRET;
  if(device1AuthError) return createCompositeDeviceViewError.DEVICE1_VIEWING_SECRET;
  
  const device0TableName = getDeviceTableNameFromID(objectFromRequest.device0ID);
  const device1TableName = getDeviceTableNameFromID(objectFromRequest.device1ID);
  
  const trimmedDevice0ConditionField = objectFromRequest.device0ConditionField.trim();
  const trimmedDevice1ConditionField = objectFromRequest.device1ConditionField.trim();
  
  const QUERY = 0;
  const [device0Columns, device1Columns] = await Promise.all([
    sqlConnection.execute(
      "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = ?", [device0TableName]
    ),
    sqlConnection.execute(
      "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = ?", [device1TableName])
  ]);
  
  const matchingDevice0ConditionColumns = device0Columns[QUERY].filter((element) => {
    return element.COLUMN_NAME === trimmedDevice0ConditionField;
  });
  const matchingDevice1ConditionColumns = device1Columns[QUERY].filter((element) => {
    return element.COLUMN_NAME === trimmedDevice1ConditionField;
  });  

  const invalidDevice0Column = matchingDevice0ConditionColumns.length === 0;
  if(invalidDevice0Column) return createCompositeDeviceViewError.DEVICE0_CONDITION_FIELD;
  const invalidDevice1Column = matchingDevice1ConditionColumns.length === 0;  
  if(invalidDevice1Column) return createCompositeDeviceViewError.DEVICE1_CONDITION_FIELD;
  
  const columnNotSameType = matchingDevice0ConditionColumns[0].DATA_TYPE !== matchingDevice1ConditionColumns[0].DATA_TYPE;
  if(columnNotSameType) return createCompositeDeviceView.DATATYPE_MISMATCH;
  
  for(let i = 0; i < device0Columns[QUERY].length; i++)
    device0Columns[QUERY][i] = `${device0TableName}.${device0Columns[QUERY][i].COLUMN_NAME} AS ${objectFromRequest.device0ID}_${device0Columns[QUERY][i].COLUMN_NAME}`
  for(let i = 0; i < device1Columns[QUERY].length; i++)
    device1Columns[QUERY][i] = `${device1TableName}.${device1Columns[QUERY][i].COLUMN_NAME} AS ${objectFromRequest.device1ID}_${device1Columns[QUERY][i].COLUMN_NAME}`
  const columnsWithDevicePrefix = device0Columns[QUERY].concat(device1Columns[QUERY]);
  const columnsWithDevicePrefixStr = columnsWithDevicePrefix.join(',');
  
  const viewWithoutCondition = `CREATE VIEW Honeycomb.${getDeviceTableNameFromID(deviceID)} AS SELECT ${columnsWithDevicePrefixStr} FROM Honeycomb.${device0TableName}, Honeycomb.${device1TableName}`;
  const MERGE_ON_EQUAL_VALUES = 0;
  const MERGE_ON_VALUE_WITHIN_RANGE = 1;
  
  if(objectFromRequest.mergeUsingCondition === MERGE_ON_EQUAL_VALUES){
    const viewWithCondition = `${viewWithoutCondition} WHERE Honeycomb.${device0TableName}.${trimmedDevice0ConditionField} = Honeycomb.${device1TableName}.${trimmedDevice1ConditionField}`;
    await sqlConnection.execute(viewWithCondition);
    return createCompositeDeviceViewError.OK;
  }
  if(objectFromRequest.mergeUsingCondition === MERGE_ON_VALUE_WITHIN_RANGE){
    const withinRangeCondition = ` WHERE ABS(Honeycomb.${device0TableName}.${trimmedDevice0ConditionField} - ${device1TableName}.${trimmedDevice1ConditionField}) <= ${objectFromRequest.mergeConditionArgument}`;
    await sqlConnection.execute(viewWithoutCondition + withinRangeCondition);
    return createCompositeDeviceViewError.OK;
  }
  
  return createCompositeDeviceViewError.MERGING_CONDITION;
}

export function getDeviceTableNameFromID(deviceIDStr){
  return `Device${deviceIDStr}_Table`;
}


export const supportedDeviceDatatypes = [
  {requestedType: "int8", sqlType: "TINYINT"},
  {requestedType: "int16", sqlType: "SMALLINT"},
  {requestedType: "int32", sqlType: "INT"},
  {requestedType: "int64", sqlType: "BIGINT"},
  {requestedType: "float32", sqlType: "FLOAT(24)"},
  {requestedType: "float64", sqlType: "FLOAT(53)"},
  {requestedType: "string", sqlType: "VARCHAR", customSizeBoundary: {min: 1, max: 255}},
];

export function parseBodyToSQLTableAttributes(objectFromBody, minColumnNameCharacters, maxColumnNameCharacters){
  const attributes = [];
  for (const [columnName, typeName] of Object.entries(objectFromBody)) {
    const sanitisedColumnName = columnName.trim();
    const columnNamePureAlphanumeric = /^[a-zA-Z0-9_]+$/.test(sanitisedColumnName);
    if (!columnNamePureAlphanumeric 
      || (sanitisedColumnName.length < minColumnNameCharacters)
      || (sanitisedColumnName.length > maxColumnNameCharacters)
    )
      return {error: `Invalid column name ${columnName}.`};
    
    if (typeof typeName !== 'string')
      return {error: `Type of ${sanitisedColumnName} must be a string.`};
    
    const sanitisedTypeName = typeName.substring(0, MAX_TYPE_CHARACTERS).trim();
    const typenameValid = /^[a-zA-Z0-9_]+(?:\[\d+\])?$/.test(sanitisedTypeName);
    if (!typenameValid)
      return {error: `Invalid typename ${sanitisedTypeName}.`};
    
    const sizedString = /^string\[(\d+)\]$/.exec(sanitisedTypeName);
    const requestedType = sizedString ? 'string' : sanitisedTypeName;
    const typeDefinition = supportedDeviceDatatypes.find(type => type.requestedType === requestedType);
    if (!typeDefinition)
      return {error: `Unsupported type ${sanitisedTypeName} for ${sanitisedColumnName}.`};

    let sqlType = typeDefinition.sqlType;
    if (sizedString){
      const size = Number(sizedString[1]);
      const {min, max} = typeDefinition.customSizeBoundary;
      if (size < min || size > max)
        return {error: `String size for ${sanitisedColumnName} must be between ${min} and ${max}.`};
      sqlType += `(${size})`;
    }
    attributes.push(`${sanitisedColumnName} ${sqlType}`);
  }
  return {sqlTableAttributes: attributes.join(', ')};
}
