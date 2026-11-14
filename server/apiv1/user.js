import {getUserDevicePreviews, registerUser, loginUser} from './userController.js';
import {saltAndRehash, saveToLoginCache, getCachedLogin, checkCachedLoginMiddleware} from '../auth.js';
import {honeycombDBConnectionPool} from '../sqlConnectionPool.js';

import express from 'express';

export const userRouter = express.Router();

userRouter.get(
  "/devicePreviews", 
  checkCachedLoginMiddleware, 
  async function(request, response){getUserDevicePreviews(request, response, honeycombDBConnectionPool);}
);
userRouter.post(
  "/register", 
  async function (request, response){registerUser(request, response, honeycombDBConnectionPool, saltAndRehash)}
);
userRouter.post(
  "/login", 
  async function(request, response){
    loginUser(request, response, honeycombDBConnectionPool, saltAndRehash, getCachedLogin, saveToLoginCache)
  }
);