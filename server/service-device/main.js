import {deviceRouter} from './apiv1/device.js';
//import {dashboardRouter} from './apiv1/dashboard.js';
import {sqlConnectionPool} from './sqlConnectionPool.js'

import express from "express";
import cors from "cors";

const app = express();
app.use(express.json({limit: "1kb"}));
app.use(cors());
const apiRouter = express.Router();

apiRouter.use("/device", deviceRouter);
//apiRouter.use("/dashboard", dashboardRouter);
app.use("/apiv1", apiRouter);

app.listen(5200, async () => {
  await sqlConnectionPool.execute("SELECT MAX(deviceID) FROM Honeycomb.Device");
  console.log(`Honeycomb server running on port ${5200}.`)
});