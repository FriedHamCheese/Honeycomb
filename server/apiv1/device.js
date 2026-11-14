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
  checkCachedLoginMiddleware,
  checkAuthForDeviceQueryMiddleware,
  checkCachedLoginIsDeviceOwnerMiddleware,
} from '../auth.js';

import {
  FIRST_CHARACTER,
  MAX_DEVICE_SECRET_CHARACTERS,
  MIN_DEVICE_NAME_CHARACTERS,
  MAX_DEVICE_NAME_CHARACTERS,
  MAX_DEVICE_VIEWING_SECRET_CHARACTERS,
  
  HTTP_STATUS_FOR_OK,
  HTTP_STATUS_FOR_CREATED,
  HTTP_STATUS_FOR_BAD_REQUEST,
  HTTP_STATUS_FOR_UNAUTHORIZED,
  HTTP_STATUS_FOR_SERVER_ERROR,
} from '../../constraints.js';

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
