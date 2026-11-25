process.loadEnvFile(new URL('./.env', import.meta.url));

import {deviceRouter} from './apiv1/device.js';
import {webSocketRouter} from './apiv1/webSockets.js';
import {sqlConnectionPool} from './sqlConnectionPool.js'
import {
  SERVICE_MAX_REQUEST_BODY_BYTES,
  GATEWAY_CONNECTIONS_CHECKING_INTERVAL_MS,
  GATEWAY_HEADERS_TIMEOUT_MS,
  GATEWAY_MAX_REQUEST_BODY_BYTES,
  GATEWAY_REQUEST_TIMEOUT_MS,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from '../../constraints.js';

import express from "express";
import cors from "cors";

import http from 'node:http';

const app = express();
app.use(express.json({limit: SERVICE_MAX_REQUEST_BODY_BYTES}));
app.use(cors());

const apiRouter = express.Router();

apiRouter.use("/device", deviceRouter);
app.use("/apiv1", apiRouter);

app.use(function uncaughtExceptionHandler(exception, request, response, next){
  console.log(exception);
  try{
    if(!response.headersSent)
      response.status(HTTP_STATUS_INTERNAL_SERVER_ERROR).send("Undocumented exception caught.");
  }catch{
    //Response failed, no output possible.
  }
});

const httpServer = http.createServer({
  connectionsCheckingInterval: GATEWAY_CONNECTIONS_CHECKING_INTERVAL_MS,
  headersTimeout: GATEWAY_HEADERS_TIMEOUT_MS,
  requestTimeout: GATEWAY_REQUEST_TIMEOUT_MS,
}, app);

webSocketRouter.createSocket(httpServer, "/websocketapiv1");
webSocketRouter.begin();

const DEVICE_SERVICE_PORT = Number(process.env.DEVICE_SERVICE_PORT);
httpServer.listen(DEVICE_SERVICE_PORT, async () => {
  await sqlConnectionPool.execute("SELECT MAX(deviceID) FROM Honeycomb.Device");
  console.log(`Honeycomb Device-WebSocket service running on port ${DEVICE_SERVICE_PORT}.`)
});
