import {registerUser, loginUser} from './userController.js';
import {saltAndRehash, saveToLoginCache, removeLoginCache, getCachedLogin, checkCachedLoginMiddleware} from '../auth.js';
import {sqlConnectionPool} from '../sqlConnectionPool.js';
import {HTTP_STATUS_FOR_OK, HTTP_STATUS_FOR_SERVER_ERROR} from '../../../constraints.js';

import express from 'express';

export const userRouter = express.Router();

userRouter.get(
  '/',
  checkCachedLoginMiddleware,
  async function (request, response){response.status(200).send(request.cachedLogin)}
);

userRouter.post(
  /*
  Input: {
    email: str[1-48]
    name: str[1-32]
    password: str[8-32]
  }
  Any attributes exceeing the maximum length will be truncated.
  A registering user cannot have same name or email of existing user.
  
  Returns:
  - HTTP status 201 if user registered successfully
  - HTTP status 400 with {error: str} if
    - .email, .name or .password is not a string type
    - any attribute has less than specified characters
    - .email or .name is already taken
  - HTTP status 500 for undocumented server errors
  */
  "/register", 
  registerUser
);

userRouter.post(
  /*
  Input: 
  - Authorization: user uuid7-hex token
  - if Authorization not valid or not included:{
      email: str[0-48]  
      password: str[0-32]
    }
    Any attributes exceeing the maximum length will be truncated
  
  Returns:
  - HTTP status 200 with .loginToken: uuidv7, str[32]
  - HTTP status 400 with .error: str; if request structure is invalid
  - HTTP status 401 with .error: str; if .email and .password combination incorrect
  - HTTP status 500 for undocumented server errors
  */
  "/login", 
  loginUser
);

userRouter.delete(
  /*
  Input:
  - Authorization: uuid user token
  
  Returns:
  - HTTP status 200 with .message:str if ok
  - HTTP status 401 with .error:str if user token is invalid
  - HTTP status 500 for undocumented server errors  
  */
  '/',
  checkCachedLoginMiddleware,
  async (request, response) => {
    try{
      await sqlConnectionPool.execute("DELETE FROM Honeycomb.UserObject WHERE id=?", [request.cachedLogin.userID]);
      removeLoginCache(request.cachedLogin.userID);
    }catch(err){
      console.log(err);
      return response.status(HTTP_STATUS_FOR_SERVER_ERROR).send();
    }
    response.status(HTTP_STATUS_FOR_OK).send({message: `Delete user with ID ${request.cachedLogin.userID}.`});
  }
);