import {saltAndRehash, saveToLoginCache, getCachedLogin} from '../auth.js';
import {sqlConnectionPool} from '../sqlConnectionPool.js';

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
} from '../../../constraints.js';

import {randomBytes} from 'node:crypto';

export async function registerUser(request, response){
  if((typeof request.body) !== "object")
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Request is not JSON."});
  
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
    const [userWithSameEmailOrName] = await sqlConnectionPool.execute(
      "SELECT name FROM Honeycomb.UserObject WHERE email=? OR name=?", [truncatedEmail, truncatedName]
    );

    if(userWithSameEmailOrName.length) 
      if(userWithSameEmailOrName.email === truncatedEmail)
        return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Email taken"});
      else
        return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Name taken"});
    
    const saltStr = randomBytes(GENERATED_USER_RAW_SALT_BYTES).toString('hex');
    const saltedUserPassword = saltAndRehash(truncatedPassword, saltStr);
    
    const [insertionResult] = await sqlConnectionPool.execute(
      "INSERT INTO Honeycomb.UserObject(email, saltedPassword, salt, name) VALUES (?,?,?,?)",
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

export async function loginUser(request, response){
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
    const [matchingUser] = await sqlConnectionPool.execute(
      "SELECT salt, saltedPassword, id FROM Honeycomb.UserObject WHERE email = ?",
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