process.loadEnvFile(new URL('./.env', import.meta.url));

import {deviceRouter} from './apiv1/device.js';
import {WebSocketRouterToMCU} from './apiv1/websockets.js';

//sql parameters into .env
import {sqlConnectionPool} from './sqlConnectionPool.js'

import http from 'node:http';
const DEVICE_SERVICE_PORT = Number(process.env.DEVICE_SERVICE_PORT);
import {SERVICE_MAX_REQUEST_BODY_BYTES} from '../../constraints.js';

import express from "express";
import cors from "cors";

const app = express();
app.use(express.json({limit: SERVICE_MAX_REQUEST_BODY_BYTES}));
app.use(cors({origin: process.env.DEVICE_SERVICE_CORS_ORIGINS.split(',')}));

const apiRouter = express.Router();

apiRouter.use("/device", deviceRouter);
app.use("/apiv1", apiRouter);

//Copy config.js from gateway
const httpServer = http.createServer({}, app);

const webSocketRouter = new WebSocketRouterToMCU();
webSocketRouter.createSocket(httpServer, "/websocketapiv1");
webSocketRouter.begin();

httpServer.listen(DEVICE_SERVICE_PORT, async () => {
  await sqlConnectionPool.execute("SELECT MAX(deviceID) FROM Honeycomb.Device");
  console.log(`Honeycomb Device-WebSocket service running on port ${DEVICE_SERVICE_PORT}.`)
});
