import {  
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
  async function(request, response){
    const deviceSecret = request.headers.devicesecret;
    if(typeof deviceSecret !== "string")
      return response.status(HTTP_STATUS_FOR_UNAUTHORIZED).send({error: "devicesecret header not string type."});

    try {
      const datapointResponse = await fetch(
        `http://localhost:5200/apiv1/device/${request.params.deviceID}/datapoint`,
        {
          headers: {
            devicesecret: deviceSecret,
            'content-type': 'application/json',
          },
          method: 'POST',
          'keep-alive': true,
          body: JSON.stringify(request.body),
        }
      );
      try {
        return response.status(datapointResponse.status).send(await datapointResponse.json());
      } catch {
        return response.status(datapointResponse.status).send();
      }
    } catch(error){
      if(error instanceof TypeError){
        console.log(error.message);
        return response.status(502).send({error: error.message});
      }
      throw error;
    }
  }
);

deviceRouter.post(
  "/", 
  async (request, response) => {
    let stringifiedBody;
    try{
      stringifiedBody = JSON.stringify(request.body);
    }catch(err){
      stringifiedBody = "{}";
    }

    try {
      const deviceResponse = await fetch(
        `http://localhost:5200/apiv1/device`,
        {
          headers: {
            'user-id': request.headers['user-id'],
            'content-type': 'application/json',
          },
          method: 'post',
          'keep-alive': true,
          body: stringifiedBody,
        }
      );
      try {
        return response.status(deviceResponse.status).send(await deviceResponse.json());
      } catch {
        return response.status(deviceResponse.status).send();
      }
    } catch(error){
      if(error instanceof TypeError){
        console.log(error.message);
        return response.status(502).send({error: error.message});
      }
      throw error;
    }    
  }
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
  async (request, response) => {
    try {
      const deviceResponse = await fetch(
        `http://localhost:5200/apiv1/device/${request.params.deviceID}/latest`,
        {
          headers: {'user-id': String(request.cachedLogin.userID)},
          'keep-alive': true,
        }
      );
      try {
        return response.status(deviceResponse.status).send(await deviceResponse.json());
      } catch {
        return response.status(deviceResponse.status).send();
      }
    } catch(error){
      if(error instanceof TypeError){
        console.log(error.message);
        return response.status(502).send({error: error.message});
      }
      throw error;
    }
  }
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
