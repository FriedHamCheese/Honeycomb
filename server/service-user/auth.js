import {uuidv7} from 'uuidv7';
import {createHash}  from 'node:crypto'
import {env, loadEnvFile} from 'node:process';
loadEnvFile();

import {
  FIRST_CHARACTER,
  MAX_DEVICE_ID_CHARACTERS,
  UUID_CHARACTER_COUNT,
  
  HTTP_STATUS_FOR_BAD_REQUEST,
  HTTP_STATUS_FOR_UNAUTHORIZED,
} from '../../constraints.js';

export function saltAndRehash(secret, saltStr){
  const sha512Hash = createHash('sha512');
  sha512Hash.update(secret + saltStr);
  return sha512Hash.digest('hex');
}

const userLoginCache = [];

export function getCachedLogin(userToken){
  if(typeof(userToken) !== "string") return undefined;
  if(userToken.length !== UUID_CHARACTER_COUNT) return undefined;
  return userLoginCache.find((login) => login.token === userToken);
}

export function saveToLoginCache(email, userID){
  const loginToken = String(uuidv7());
  userLoginCache.push({email: email, userID: userID, token: loginToken});
  return loginToken;
}
export function removeLoginCache(userID){
  const cacheIndex = userLoginCache.findIndex((cache) => cache.userID === userID);
  if(cacheIndex === -1) return;
  const REMOVE_ELEMENT_AT_INDEX = 1;
  userLoginCache.splice(cacheIndex, REMOVE_ELEMENT_AT_INDEX);
}

export function checkCachedLoginMiddleware(request, response, nextRoute){
  /*
  Input: 
  - Authorization: user session token, uuidv7-hex, str[36]
  
  Returns:
  - HTTP status 401 with .error: str; if session token not string type or not in cached logins.
  - Nothing, adds request.cachedLogin, calls nextRoute()
  */
  const userLoginToken = request.get('Authorization');
  const cachedLogin = getCachedLogin(userLoginToken);
  if(!cachedLogin) 
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "Invalid user login token."});
  request.cachedLogin = cachedLogin;
  nextRoute();
}

export async function checkCachedLoginIsDeviceOwner(userLoginToken, deviceID){
  const cachedLogin = await getCachedLogin(userLoginToken);
  if(!cachedLogin)
    return false;

  try {
    const deviceOwnershipResponse = await fetch(
      `${env.DEVICE_SERVICE_DOMAIN}/apiv1/device/${deviceID}/isOwnedBy/${cachedLogin.userID}`,
      {keepalive: true}
    );
    if(!deviceOwnershipResponse.ok)
      return false;
    const ownershipResult = await deviceOwnershipResponse.json();
    return ownershipResult.isOwner === true;
  } catch(err){
    console.log(err);
    return false;
  }
}

export async function checkCachedLoginIsDeviceOwnerMiddleware(request, response, nextRoute){
  const userLoginToken = request.get("Authorization");
  const loggedInUserIsOwner = await checkCachedLoginIsDeviceOwner(userLoginToken, request.deviceIDInt);
  if(loggedInUserIsOwner) return nextRoute();
  
  return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({
    error: "User is not the owner of the device."
  });  
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