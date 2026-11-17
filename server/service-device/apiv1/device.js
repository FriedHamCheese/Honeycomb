import {
  registerDeviceLogic,
  addDatapointLogic
} from './deviceLogic.js';

import {
  registerDevice,
  registerCompositeDevice,
  getUserDevicePreviews,
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
  checkCachedLoginMiddleware,
  checkAuthForDeviceQueryMiddleware,
  checkCachedLoginIsDeviceOwnerMiddleware,
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
  checkCachedLoginMiddleware,
  async (request, response) => {registerDevice(request, response, sqlConnectionPool, registerDeviceLogic);}
);

deviceRouter.post(
  "/compositeDevice",
  checkCachedLoginMiddleware,
  async (request, response) => {registerCompositeDevice(request, response, sqlConnectionPool, registerDeviceLogic);}
);

deviceRouter.get(
  "/userDeviceSummary", 
  checkCachedLoginMiddleware, 
  async function(request, response){getUserDevicePreviews(request, response, honeycombDBConnectionPool);}
);

deviceRouter.get(
  "/webSocketURL",
  async (request, response) => {
    response.send({
      domain: process.env.WEBSOCKET_DOMAIN,
      port: Number(process.env.WEBSOCKET_PORT),
      path: process.env.WEBSOCKET_PATH,
    });
  }
);

deviceRouter.get(
  "/:deviceID/latest",
  deviceIDParameterValid,
  checkCachedLoginMiddleware,
  async (request, response) => {getLatestDatapoint(request, response);}
);

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
