import {userRouter} from './apiv1/user.js';
import {dashboardRouter} from './apiv1/dashboard.js';
import {sqlConnectionPool} from './sqlConnectionPool.js'
import {HTTP_STATUS_INTERNAL_SERVER_ERROR, SERVICE_MAX_REQUEST_BODY_BYTES} from '../../constraints.js';

import express from "express";
import cors from "cors";
import {env, loadEnvFile} from 'node:process';
loadEnvFile();

const app = express();
app.use(express.json({limit: SERVICE_MAX_REQUEST_BODY_BYTES}));
app.use(cors());
const apiRouter = express.Router();

apiRouter.use("/user", userRouter);
apiRouter.use("/dashboard", dashboardRouter);
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

app.listen(env.SERVICE_PORT, async () => {
  await sqlConnectionPool.execute("SELECT MAX(id) FROM Honeycomb.UserObject");
  console.log(`Honeycomb server running on port ${env.SERVICE_PORT}.`)
});