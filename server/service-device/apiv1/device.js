import {
  registerDeviceLogic,
  addDatapointLogic
} from './deviceLogic.js';

import {
  registerDevice,
  registerCompositeDevice,
  deleteDevice,
  addDatapoint,
  getDevice,
  getLatestDatapoint,
} from './deviceController.js';

import {
  sqlConnectionPool,
  honeycombDBConnectionPool,
} from '../sqlConnectionPool.js'

import {
  deviceIDParameterValid,
  deviceSecretAuthenticationMiddleware,
} from '../auth.js';

import express from "express";
export const deviceRouter = express.Router();

deviceRouter.post(
  "/:deviceID/datapoint", 
  deviceIDParameterValid, 
  deviceSecretAuthenticationMiddleware, 
  async function (request, response){addDatapoint(request, response, addDatapointLogic, sqlConnectionPool);}
);

deviceRouter.post(
  "/", 
  async (request, response) => {registerDevice(request, response, sqlConnectionPool, registerDeviceLogic);}
);

deviceRouter.get(
  '/:deviceID/auth',
  deviceIDParameterValid,
  deviceSecretAuthenticationMiddleware,
  async (request, response) => {response.send({deviceID: request.deviceIDInt});}
);

/*
deviceRouter.post(
  "/compositeDevice",
  checkCachedLoginMiddleware,
  async (request, response) => {registerCompositeDevice(request, response, sqlConnectionPool, registerDeviceLogic);}
);
*/

deviceRouter.get(
  "/:deviceID/latest",
  deviceIDParameterValid,
  async (request, response) => {getLatestDatapoint(request, response);}
);

/*
deviceRouter.get(
  "/:deviceID",
  deviceIDParameterValid,
  checkAuthForDeviceQueryMiddleware,
  async (request, response) => {getDevice(request, response);}
);

deviceRouter.delete(
  "/:deviceID", 
  deviceIDParameterValid,
  checkCachedLoginIsDeviceOwnerMiddleware, 
  async (request, response) => {deleteDevice(request, response);}
);
*/
