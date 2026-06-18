import {honeycombDBConnectionPool} from './sqlConnectionPool.js';

import {uuidv7} from 'uuidv7';
import {createHash}  from 'node:crypto'

const INCLUDE_FIRST_CHARACTER = 0;
export const MAX_DEVICE_ID_CHARACTERS = 16;
export const MAX_DEVICE_VIEWING_SECRET_CHARACTERS = 64;
export const MAX_DEVICE_SECRET_CHARACTERS = 64;

const HTTP_STATUS_FOR_BAD_REQUEST = 400; 
const HTTP_STATUS_FOR_UNAUTHORIZED = 401;

export function saltAndRehash(secret, saltStr){
  const sha512Hash = createHash('sha512');
  sha512Hash.update(secret + saltStr);
  return sha512Hash.digest('hex');
}

export function saltRehashDeviceSecret(deviceSecret, saltStr){
  return saltAndRehash(deviceSecret, saltStr);
}

export function deviceIDParameterValid(request, response, nextRouter){
  
  const deviceIDStr = request.params.deviceID.substring(INCLUDE_FIRST_CHARACTER, MAX_DEVICE_ID_CHARACTERS).trim();
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

export async function deviceViewingSecretAuthentication(deviceID, secret, honeycombDBConnection){
  const [rows] = await honeycombDBConnection.execute(
    "SELECT saltedViewingSecret, deviceSecretSalt FROM Device WHERE deviceID = ?", [deviceID]
  );
  const invalidDeviceID = rows.length === 0;
  if(invalidDeviceID) return secretAuthenticationError.DEVICEID;
  
  const matchingSaltedViewingSecret = saltRehashDeviceSecret(secret, rows[0].deviceSecretSalt) === rows[0].saltedViewingSecret;
  return (matchingSaltedViewingSecret ? secretAuthenticationError.OK : secretAuthenticationError.SECRET);
}

export async function deviceSecretAuthentication(request, response, nextRouter){
  const deviceSecret = request.headers.authorization;
  if((typeof deviceSecret) !== "string")
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "authorization header not string type."});
  
  const trimmedDeviceSecret = deviceSecret.substring(INCLUDE_FIRST_CHARACTER, MAX_DEVICE_SECRET_CHARACTERS).trim();
  const [rows] = await honeycombDBConnectionPool.execute(
    "SELECT saltedDeviceSecret, deviceSecretSalt FROM Device WHERE deviceID = ?",
    [request.deviceIDInt]
  );
  
  const deviceIDNotRegistered = rows.length < 1;
  if(deviceIDNotRegistered)
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "deviceID not registered."});
  const saltedDeviceSecret = saltRehashDeviceSecret(trimmedDeviceSecret, rows[0].deviceSecretSalt);
  if(saltedDeviceSecret !== rows[0].saltedDeviceSecret)
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "Device secret mismatch."});
  
  nextRouter();
}

const userLoginCache = [];

const USER_TOKEN_CHARACTERS = 32+4;
export function getCachedLogin(userToken){
  if(typeof(userToken) !== "string") return undefined;
  if(userToken.length !== USER_TOKEN_CHARACTERS) return undefined;
  return userLoginCache.find((login) => login.token === userToken);
}

export function saveToLoginCache(email){
  const loginToken = String(uuidv7());
  userLoginCache.push({email: email, token: loginToken});
  return loginToken;
}