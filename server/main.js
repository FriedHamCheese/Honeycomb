import {
  registerDevice,
  createCompositeDeviceView,
  createCompositeDeviceViewError,
  createCompositeDeviceViewErrorStr,
} from './api_methods.js';

import {
  deviceRouter
} from './apiv1/device.js';

import {
  sqlConnectionPool,
  honeycombDBConnectionPool,
} from './sqlConnectionPool.js'

import {
  saltAndRehash,
  saveToLoginCache,
  getCachedLogin,
  MAX_DEVICE_SECRET_CHARACTERS,
  MAX_DEVICE_VIEWING_SECRET_CHARACTERS,
  MAX_DEVICE_ID_CHARACTERS,
} from './auth.js';

import {randomBytes} from 'node:crypto';

import express from "express";
import cors from "cors";

const PORT_NUMBER = 5001

const app = express();
app.use(express.json({limit: "1kb"}))
app.use(cors());
const apiRouter = express.Router();

const HTTP_STATUS_FOR_OK = 200;
const HTTP_STATUS_FOR_CREATED = 201;
const HTTP_STATUS_FOR_BAD_REQUEST = 400; 
const HTTP_STATUS_FOR_UNAUTHORIZED = 401;
const HTTP_STATUS_FOR_SERVER_ERROR = 500;

const INCLUDE_FIRST_CHARACTER = 0;
const MIN_DEVICE_NAME_CHARACTERS = 1;
const MAX_DEVICE_NAME_CHARACTERS = 32;

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

const MAX_USER_EMAIL_CHARACTERS = 48;
const MAX_USER_PASSWORD_CHARACTERS = 32;
const MAX_USER_NAME_CHARACTERS = 32;

apiRouter.post(
  "/user/register",
  async (request, response) => {
    /*
    Input: {
      email: str[1-48]
      name: str[1-32]
      password: str[8-32]
    }
    */
    
    const truncatedEmail = request.body.email.trim().substr(INCLUDE_FIRST_CHARACTER, MAX_USER_EMAIL_CHARACTERS);
    const truncatedPassword = request.body.password.substr(INCLUDE_FIRST_CHARACTER, MAX_USER_PASSWORD_CHARACTERS);
    const truncatedName = request.body.name.trim().substr(INCLUDE_FIRST_CHARACTER, MAX_USER_NAME_CHARACTERS);
    
    const [userObjectWithSameEmail, userObjectWithSameName] = await Promise.all([
      honeycombDBConnectionPool.execute("SELECT name FROM UserObject WHERE email = ?", [truncatedEmail]),
      honeycombDBConnectionPool.execute("SELECT name FROM UserObject WHERE name = ?", [truncatedName]),
    ]);

    const userAlreadyExists = userObjectWithSameEmail.length > 0;
    const duplicateName = userObjectWithSameName.length > 0;
    if(userAlreadyExists) 
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Email taken"});
    if(duplicateName)
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Name taken"});
    
    const USER_PASSWORD_SALT_BYTES = 32/2;
    const saltStr = randomBytes(USER_PASSWORD_SALT_BYTES).toString('hex');
    const saltedUserPassword = saltAndRehash(truncatedPassword, saltStr);
    
    const [insertionResult] = await honeycombDBConnectionPool.execute(
      "INSERT INTO UserObject(email, saltedPassword, salt, name) VALUES (?,?,?,?)",
      [truncatedEmail, saltedUserPassword, saltStr, truncatedName]
    );
    
    response.send({message: `User registered with user ID ${insertionResult.insertId}.`});
  }
);

apiRouter.post(
  "/user/login",
  async (request, response) => {
    /*
    Input: 
    Authorization: user uuid7 token
    
    if token not valid:
    {
      email: str[1-48]
      password: str[8-32]
    }
    */
    
    const userToken = request.get('Authorization');
    if(getCachedLogin(userToken)) 
      return response.status(HTTP_STATUS_FOR_OK).send({loginToken: userToken});  
  
    const truncatedEmail = request.body.email.trim().substr(INCLUDE_FIRST_CHARACTER, MAX_USER_EMAIL_CHARACTERS);
    const truncatedPassword = request.body.password.substr(INCLUDE_FIRST_CHARACTER, MAX_USER_PASSWORD_CHARACTERS);
    
    const [matchingUser] = await honeycombDBConnectionPool.execute(
      "SELECT salt, saltedPassword FROM UserObject WHERE email = ?",
      [truncatedEmail]
    );
    const noUserWithEmail = matchingUser.length < 1;
    if(noUserWithEmail)
      return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "No user associated with email"});
    const saltedPassword = saltAndRehash(truncatedPassword, matchingUser[0].salt);
    if(saltedPassword !== matchingUser[0].saltedPassword)
      return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "Incorrect password"});
    
    const loginToken = saveToLoginCache(truncatedEmail);
    return response.status(HTTP_STATUS_FOR_OK).send({loginToken: loginToken});
  }
);


apiRouter.use("/device", deviceRouter);
app.use("/apiv1", apiRouter);
app.listen(PORT_NUMBER, async () => {
  await honeycombDBConnectionPool.execute("SELECT MAX(deviceID) FROM Device");
  console.log(`Honeycomb server running on port ${PORT_NUMBER}.`)
})