import {saltAndRehash, saveToLoginCache, getCachedLogin, checkCachedLoginMiddleware} from '../auth.js';
import {honeycombDBConnectionPool} from '../sqlConnectionPool.js';

import {
  FIRST_CHARACTER,
  MIN_USERNAME_CHARACTERS,
  MIN_USER_EMAIL_CHARACTERS,
  MIN_USER_PASSWORD_CHARACTERS,
  
  MAX_USER_EMAIL_CHARACTERS,
  MAX_USER_PASSWORD_CHARACTERS,
  MAX_USERNAME_CHARACTERS,
  
  GENERATED_USER_RAW_SALT_BYTES,
  
  HTTP_STATUS_FOR_OK,
  HTTP_STATUS_FOR_CREATED,
  HTTP_STATUS_FOR_BAD_REQUEST,
  HTTP_STATUS_FOR_UNAUTHORIZED,
  HTTP_STATUS_FOR_SERVER_ERROR,
} from '../../constraints.js';

import express from 'express';
import {randomBytes} from 'node:crypto';

export const userRouter = express.Router();

userRouter.get(
  "/devicePreviews",
  checkCachedLoginMiddleware,
  async (request, response) => {
    /*
    Input:
    - Authorization: userSessionToken, uuidv7-hex
    
    Returns:
    - {
      devices: [
        {
          deviceID: int(64),
          deviceName: str[1-32],
          isCompositeDevice: int(1)
        },
        ...
      ]
    }, with HTTP status 200
    - HTTP status 401 if session token from Authorization is invalid
    - HTTP status 500 for undocumented server errors
    */
    try{
      const [devices] = await honeycombDBConnectionPool.execute(
        "SELECT deviceID, deviceName, isCompositeDevice FROM Device WHERE ownerUserID = ?", [request.cachedLogin.userID]
      );
      response.send({devices: devices});
    }catch(err){
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send();
      console.log(err);
    }
});

userRouter.post(
  "/register",
  async (request, response) => {
    /*
    Input: {
      email: str[1-48]
      name: str[1-32]
      password: str[8-32]
    }
    
    Returns:
    - HTTP status 201 if user registered successfully
    - HTTP status 400 with {error: error message (str)} if information for registration is not ok
    - HTTP status 500 for undocumented server errors
    */
    
    const {email, password, name} = request.body;
    
    if((typeof email) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: ".email attribute not string type"});
    if((typeof password) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: ".password attribute not string type"});
    if((typeof name) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: ".name attribute not string type"});
  
    const truncatedEmail = email.substr(FIRST_CHARACTER, MAX_USER_EMAIL_CHARACTERS).trim();
    const truncatedPassword = password.substr(FIRST_CHARACTER, MAX_USER_PASSWORD_CHARACTERS).trim();
    const truncatedName = name.substr(FIRST_CHARACTER, MAX_USERNAME_CHARACTERS).trim();
    
    if(truncatedEmail.length < MIN_USER_EMAIL_CHARACTERS) 
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({
        error: `Email field require at least ${MIN_USER_EMAIL_CHARACTERS} characters.`
      });
    if(truncatedPassword.length < MIN_USER_PASSWORD_CHARACTERS) 
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({
        error: `Password field require at least ${MIN_USER_PASSWORD_CHARACTERS} characters.`
      });   
    if(truncatedName.length < MIN_USERNAME_CHARACTERS) 
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({
        error: `Name field require at least ${MIN_USERNAME_CHARACTERS} characters.`
      });  
    
    try{
      const [userObjectWithSameEmailResult, userObjectWithSameNameResult] = await Promise.all([
        honeycombDBConnectionPool.execute("SELECT name FROM UserObject WHERE email = ?", [truncatedEmail]),
        honeycombDBConnectionPool.execute("SELECT name FROM UserObject WHERE name = ?", [truncatedName]),
      ]);
      
      const QUERY_RESULT = 0;
      const userObjectWithSameEmail = userObjectWithSameEmailResult[QUERY_RESULT];
      const userObjectWithSameName = userObjectWithSameNameResult[QUERY_RESULT];
  
      if(userObjectWithSameEmail.length) 
        return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Email taken"});
      if(userObjectWithSameName.length)
        return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Name taken"});
      
      const saltStr = randomBytes(GENERATED_USER_RAW_SALT_BYTES).toString('hex');
      const saltedUserPassword = saltAndRehash(truncatedPassword, saltStr);
      
      const [insertionResult] = await honeycombDBConnectionPool.execute(
        "INSERT INTO UserObject(email, saltedPassword, salt, name) VALUES (?,?,?,?)",
        [truncatedEmail, saltedUserPassword, saltStr, truncatedName]
      );
      
      response.status(HTTP_STATUS_FOR_CREATED).send({
        message: `User registered with user ID ${insertionResult.insertId}.`
      });
    }catch(err){
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send();
      console.log(err);
    }
  }
);

userRouter.post(
  "/login",
  async (request, response) => {
    /*
    Input: 
    - Authorization: user uuid7-hex token
    - if Authorization not valid:{
        email: str[1-48]  
        password: str[8-32]
      }
    
    Returns:
    - HTTP status 200 with .loginToken: uuidv7, str[32]
    - HTTP status 400 with .error: str; if .email or .password not conforming to specified form
    - HTTP status 401 with .error: str; if .email and .password combination incorrect
    - HTTP status 500 for undocumented server errors
    */
    
    const userToken = request.get('Authorization');
    if(getCachedLogin(userToken)) 
      return response.status(HTTP_STATUS_FOR_OK).send({loginToken: userToken});  
    
    if((typeof request.body) !== "object")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Request is required to be a JSON object."});  

    const {email, password} = request.body;
    if((typeof email) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: ".email attribute not string type"});
    if((typeof password) !== "string")
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: ".password attribute not string type"});
    
    const truncatedEmail = email.substr(FIRST_CHARACTER, MAX_USER_EMAIL_CHARACTERS).trim();
    const truncatedPassword = password.substr(FIRST_CHARACTER, MAX_USER_PASSWORD_CHARACTERS).trim();

    try{
      const [matchingUser] = await honeycombDBConnectionPool.execute(
        "SELECT salt, saltedPassword, id FROM UserObject WHERE email = ?",
        [truncatedEmail]
      );
      if(!matchingUser.length)
        return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "No user associated with email"});
      const saltedPassword = saltAndRehash(truncatedPassword, matchingUser[0].salt);
      if(saltedPassword !== matchingUser[0].saltedPassword)
        return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "Incorrect password"});
      
      const loginToken = saveToLoginCache(truncatedEmail, matchingUser[0].id);
      response.status(HTTP_STATUS_FOR_OK).send({loginToken: loginToken});
    }catch(err){
      response.status(HTTP_STATUS_FOR_SERVER_ERROR).send();
      console.log(err);
    }
  }
);