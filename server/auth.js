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
  const dbConnection = honeycombDBConnection || honeycombDBConnectionPool;
  
  const [deviceFromID] = await dbConnection.execute(
    "SELECT saltedViewingSecret, deviceSecretSalt FROM Device WHERE deviceID = ?", [deviceID]
  );
  const invalidDeviceID = deviceFromID.length === 0;
  if(invalidDeviceID) return secretAuthenticationError.DEVICEID;
  
  const matchingSaltedViewingSecret = 
    saltRehashDeviceSecret(secret, deviceFromID[0].deviceSecretSalt) === deviceFromID[0].saltedViewingSecret;
  return (matchingSaltedViewingSecret ? secretAuthenticationError.OK : secretAuthenticationError.SECRET);
}

export async function deviceSecretAndViewingSecretAuthentication(deviceID, secret, viewingSecret, honeycombDBConnection){
  const dbConnection = honeycombDBConnection || honeycombDBConnectionPool;
  
  const [deviceFromID] = await dbConnection.execute(
    "SELECT saltedViewingSecret, saltedDeviceSecret, deviceSecretSalt FROM Device WHERE deviceID = ?", [deviceID]
  );
  const invalidDeviceID = deviceFromID.length === 0;
  if(invalidDeviceID) return secretAuthenticationError.DEVICEID;
  
  if(secret){
    const saltedDeviceSecret = saltRehashDeviceSecret(secret, deviceFromID[0].deviceSecretSalt);  
    const matchingSaltedSecret = saltedDeviceSecret === deviceFromID[0].saltedDeviceSecret;
    if(matchingSaltedSecret) return secretAuthenticationError.OK;
  }
  if(viewingSecret){
    const saltedViewingSecret = saltRehashDeviceSecret(viewingSecret, deviceFromID[0].deviceSecretSalt);
    const matchingSaltedViewingSecret = saltedViewingSecret === deviceFromID[0].saltedViewingSecret;
    if(matchingSaltedViewingSecret) return secretAuthenticationError.OK;
  }
  return secretAuthenticationError.SECRET;
}


export async function deviceSecretAuthenticationMiddleware(request, response, nextRouter){
  const deviceSecret = request.headers.authorization;
  if((typeof deviceSecret) !== "string")
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "authorization header not string type."});
  
  const trimmedDeviceSecret = deviceSecret.substring(INCLUDE_FIRST_CHARACTER, MAX_DEVICE_SECRET_CHARACTERS).trim();
  const [deviceFromID] = await honeycombDBConnectionPool.execute(
    "SELECT saltedDeviceSecret, deviceSecretSalt FROM Device WHERE deviceID = ?",
    [request.deviceIDInt]
  );
  
  const deviceIDNotRegistered = deviceFromID.length < 1;
  if(deviceIDNotRegistered)
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "deviceID not registered."});
  const saltedDeviceSecret = saltRehashDeviceSecret(trimmedDeviceSecret, deviceFromID[0].deviceSecretSalt);
  if(saltedDeviceSecret !== deviceFromID[0].saltedDeviceSecret)
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

export function saveToLoginCache(email, userID){
  const loginToken = String(uuidv7());
  userLoginCache.push({email: email, userID: userID, token: loginToken});
  return loginToken;
}

export function checkCachedLoginMiddleware(request, response, nextRoute){
  const userLoginToken = request.get('Authorization');
  const cachedLogin = getCachedLogin(userLoginToken);
  if(!cachedLogin) 
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({message: "Invalid user login token."});
  request.cachedLogin = cachedLogin;
  nextRoute();
}

export async function checkCachedLoginIsDeviceOwner(userLoginToken, deviceID, honeycombDBConnection){
  const dbConnection = honeycombDBConnection || honeycombDBConnectionPool;
  const cachedLogin = await getCachedLogin(userLoginToken);
  if(!cachedLogin)
    return false;
  
  const [matchingDevice] = await honeycombDBConnectionPool.execute(
    "SELECT isCompositeDevice FROM Device WHERE deviceID = ? AND ownerUserID = ?", [deviceID, cachedLogin.userID]
  );
  const correctUserAndDevice = matchingDevice.length !== 0;
  return correctUserAndDevice;
}

export async function checkAuthForDeviceQueryMiddleware(request, response, nextRoute){
  const deviceSecret = request.get("deviceSecret");
  const deviceViewingSecret = request.get("deviceViewingSecret");
  const userLoginToken = request.get("Authorization");
  
  const hasOnlyUserLoginToken = (typeof(deviceSecret) !== "string") && (typeof(deviceViewingSecret) !== "string");
  if(!hasOnlyUserLoginToken){
    const error = await deviceSecretAndViewingSecretAuthentication(
      request.deviceIDInt, deviceSecret, deviceViewingSecret, honeycombDBConnectionPool
    );
    if(!error) return nextRoute();
  }
  
  const loggedInUserIsOwner = await checkCachedLoginIsDeviceOwner(userLoginToken, request.deviceIDInt);
  if(loggedInUserIsOwner) return nextRoute();
  
  return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({
    error: "Device secret, viewing secret and user token are all invalid."
  });
}

export async function checkCachedLoginIsDeviceOwnerMiddleware(request, response, nextRoute){
  const userLoginToken = request.get("Authorization");
  const loggedInUserIsOwner = await checkCachedLoginIsDeviceOwner(userLoginToken, request.deviceIDInt);
  if(loggedInUserIsOwner) return nextRoute();
  
  return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({
    error: "User is not the owner of the device."
  });  
}