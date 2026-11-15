import {honeycombDBConnectionPool} from './sqlConnectionPool.js';

import {uuidv7} from 'uuidv7';
import {createHash}  from 'node:crypto'

import {
  FIRST_CHARACTER,
  MAX_DEVICE_ID_CHARACTERS,
  MAX_DEVICE_SECRET_CHARACTERS,
  MAX_DEVICE_VIEWING_SECRET_CHARACTERS,
  UUID_CHARACTER_COUNT,
  
  HTTP_STATUS_FOR_BAD_REQUEST,
  HTTP_STATUS_FOR_UNAUTHORIZED,
} from '../../constraints.js';

export function saltAndRehash(secret, saltStr){
  const sha512Hash = createHash('sha512');
  sha512Hash.update(secret + saltStr);
  return sha512Hash.digest('hex');
}

export function deviceIDParameterValid(request, response, nextRouter){
  const deviceIDStr = request.params.deviceID.substring(FIRST_CHARACTER, MAX_DEVICE_ID_CHARACTERS).trim();
  const deviceIDInt = Number.parseInt(deviceIDStr);
  if(!deviceIDStr || Number.isNaN(deviceIDInt) || deviceIDInt < 0)
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "deviceID not a positive integer."});  
  
  request.deviceIDStr = deviceIDStr;
  request.deviceIDInt = deviceIDInt;
  nextRouter();
}

export const secretAuthenticationError = {
  OK: 0,
  DEVICEID: 1,
  SECRET: 2,
};

export async function deviceViewingSecretAuthentication(deviceID, secret, sqlConnection){  
  const [deviceFromID] = await sqlConnection.execute(
    "SELECT saltedViewingSecret, deviceSecretSalt FROM Honeycomb.Device WHERE deviceID = ?", [deviceID]
  );
  if(!deviceFromID.length) return secretAuthenticationError.DEVICEID;
  
  const matchingSaltedViewingSecret = 
    saltAndRehash(secret, deviceFromID[0].deviceSecretSalt) === deviceFromID[0].saltedViewingSecret;
  return (matchingSaltedViewingSecret ? secretAuthenticationError.OK : secretAuthenticationError.SECRET);
}

export async function deviceSecretAndViewingSecretAuthentication(deviceID, secret, viewingSecret, sqlConnection){
  const [deviceFromID] = await sqlConnection.execute(
    "SELECT saltedViewingSecret, saltedDeviceSecret, deviceSecretSalt FROM Honeycomb.Device WHERE deviceID = ?", [deviceID]
  );
  if(!deviceFromID.length) return secretAuthenticationError.DEVICEID;
  
  if(secret){
    const saltedDeviceSecret = saltAndRehash(secret, deviceFromID[0].deviceSecretSalt);  
    const matchingSaltedSecret = saltedDeviceSecret === deviceFromID[0].saltedDeviceSecret;
    if(matchingSaltedSecret) return secretAuthenticationError.OK;
  }
  if(viewingSecret){
    const saltedViewingSecret = saltAndRehash(viewingSecret, deviceFromID[0].deviceSecretSalt);
    const matchingSaltedViewingSecret = saltedViewingSecret === deviceFromID[0].saltedViewingSecret;
    if(matchingSaltedViewingSecret) return secretAuthenticationError.OK;
  }
  return secretAuthenticationError.SECRET;
}

export async function deviceSecretAuthentication(deviceSecret, deviceID){
  const trimmedDeviceSecret = deviceSecret.substring(FIRST_CHARACTER, MAX_DEVICE_SECRET_CHARACTERS).trim();
  const [deviceFromID] = await honeycombDBConnectionPool.execute(
    "SELECT saltedDeviceSecret, deviceSecretSalt FROM Device WHERE deviceID = ?",
    [deviceID]
  );
  
  const deviceIDNotRegistered = deviceFromID.length < 1;
  if(deviceIDNotRegistered)
    return secretAuthenticationError.DEVICEID;
  const saltedDeviceSecret = saltAndRehash(trimmedDeviceSecret, deviceFromID[0].deviceSecretSalt);
  if(saltedDeviceSecret !== deviceFromID[0].saltedDeviceSecret)
    return secretAuthenticationError.SECRET;
  
  return secretAuthenticationError.OK;
}

export async function deviceSecretAuthenticationMiddleware(request, response, nextRouter){
  /*
  Input:
  - devicesecret: device secret, str[1-32]
  
  Returns:
  - HTTP status 401 with .error: str; if devicesecret not string type or invalid combination with request.deviceIDInt
  - Nothing, calls nextRouter()
  */
  
  const deviceSecret = request.headers.devicesecret;
  if((typeof deviceSecret) !== "string")
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "devicesecret header not string type."});
  
  const trimmedDeviceSecret = deviceSecret.substring(FIRST_CHARACTER, MAX_DEVICE_SECRET_CHARACTERS).trim();
  const [deviceFromID] = await honeycombDBConnectionPool.execute(
    "SELECT saltedDeviceSecret, deviceSecretSalt FROM Device WHERE deviceID = ?",
    [request.deviceIDInt]
  );
  
  const deviceIDNotRegistered = deviceFromID.length < 1;
  if(deviceIDNotRegistered)
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "deviceID not registered."});
  const saltedDeviceSecret = saltAndRehash(trimmedDeviceSecret, deviceFromID[0].deviceSecretSalt);
  if(saltedDeviceSecret !== deviceFromID[0].saltedDeviceSecret)
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "Device secret mismatch."});
  
  nextRouter();
}