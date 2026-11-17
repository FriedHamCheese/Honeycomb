import {deviceRouter} from './apiv1/device.js';
import {WebSocketRouterToMCU} from './apiv1/websockets.js';
import {sqlConnectionPool} from './sqlConnectionPool.js'

import http from 'node:http';

process.loadEnvFile(new URL('./.env', import.meta.url));

import express from "express";
import cors from "cors";

const app = express();
app.use(express.json({limit: "1kb"}));
app.use(cors());
const apiRouter = express.Router();

apiRouter.use("/device", deviceRouter);
app.use("/apiv1", apiRouter);

const httpServer = http.createServer({}, app);

const webSocketRouter = new WebSocketRouterToMCU();
webSocketRouter.createSocket(httpServer, "/websocketapiv1");
webSocketRouter.begin();

httpServer.listen(5200, async () => {
  await sqlConnectionPool.execute("SELECT MAX(deviceID) FROM Honeycomb.Device");
  console.log(`Honeycomb server running on port ${5200}.`)
});
