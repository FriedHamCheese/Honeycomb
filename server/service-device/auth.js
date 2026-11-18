import {honeycombDBConnectionPool} from './sqlConnectionPool.js';
process.loadEnvFile(new URL('./.env', import.meta.url));

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

import{
  USE_INTER_SERVICE_CALL_MOCK,
} from './config.js';

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

//Probably alright to not unit test login methods, auth will be on api gateway

const cachedLoginByToken = new Map();
const CACHED_LOGIN_TTL_MS = 60 * 1000;

export async function getCachedLogin(userToken){
  if(typeof userToken !== "string") return null;

  const cachedEntry = cachedLoginByToken.get(userToken);
  if(cachedEntry && cachedEntry.expiresAt > Date.now())
    return cachedEntry.cachedLogin;
  if(cachedEntry)
    cachedLoginByToken.delete(userToken);

  try {
    let cachedLogin;
    if (USE_INTER_SERVICE_CALL_MOCK) {
      // The test fixture contains one user (Jane Doe, ID 1); any supplied
      // syntactically valid token represents that fixture user in mock mode.
      cachedLogin = {userID: 1, email: 'jane.doe@example.com', token: userToken};
    } else {
      const userAuthResponse = await fetch(`${AUTH_SERVICE_DOMAIN}/apiv1/user`, {
        headers: {Authorization: userToken},
        keepalive: true,
      });
      cachedLogin = userAuthResponse.ok ? await userAuthResponse.json() : null;
    }
    cachedLoginByToken.set(userToken, {
      cachedLogin,
      expiresAt: Date.now() + CACHED_LOGIN_TTL_MS,
    });
    return cachedLogin;
  } catch {
    return null;
  }
}

export async function checkCachedLoginMiddleware(request, response, nextRoute){
  /*
  Input: 
  - Authorization: user session token, uuidv7-hex, str[36]
  
  Returns:
  - HTTP status 401 with .error: str; if session token not string type or not in cached logins.
  - Nothing, adds request.cachedLogin, calls nextRoute()
  */
  const userLoginToken = request.get('Authorization');
  const cachedLogin = await getCachedLogin(userLoginToken);
  if(!cachedLogin) 
    return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "Invalid user login token."});
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
