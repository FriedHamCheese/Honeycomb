import {deviceRouter} from './apiv1/device.js';
import {userRouter} from './apiv1/user.js';
import {
  webSocketRouterToMCU,
  toMCUOnMessage,
  toMCUOnClose,
  toMCUOnError,
} from './apiv1/webSockets.js';
import {honeycombDBConnectionPool} from './sqlConnectionPool.js'
import {PORT_NUMBER,} from '../constraints.js';

import express from "express";
import cors from "cors";

import http from 'node:http';


const app = express();
app.use(express.json({limit: "1kb"}));
app.use(cors());
const apiRouter = express.Router();

apiRouter.use("/device", deviceRouter);
apiRouter.use("/user", userRouter);
app.use("/apiv1", apiRouter);

const httpServer = http.createServer(app);

webSocketRouterToMCU.createSocket(httpServer, '/websocketapiv1');
webSocketRouterToMCU.begin();

httpServer.listen(PORT_NUMBER, async () => {
  await honeycombDBConnectionPool.execute("SELECT MAX(deviceID) FROM Device");
  console.log(`Honeycomb server running on port ${PORT_NUMBER}.`)
})