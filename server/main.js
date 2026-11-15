import {userRouter} from './apiv1/user.js';

import express from "express";
import cors from "cors";

import http from 'node:http';

const app = express();
app.use(express.json({limit: "1kb"}));
app.use(cors());
const apiRouter = express.Router();

//apiRouter.use("/device", deviceRouter);
apiRouter.use("/user", userRouter);
//apiRouter.use("/dashboard", dashboardRouter);
app.use("/apiv1", apiRouter);

const httpServer = http.createServer();
//should validate authentication per request with auth but periodically
httpServer.on('request', async (request, response) => {
  const headers = request.headers;
  const userAuthAttempt = (typeof headers.authorization) === "string";  
  
  if(userAuthAttempt){
    //check cache policy, timeout
    try {
      const userAuthResponse = await fetch(
        "http://localhost:5100/apiv1/user", 
        {
          headers: {'Authorization': headers.authorization},
          keepalive: true,
        }
      );
      if(userAuthResponse.ok){
        request.cachedLogin = await userAuthResponse.json();
      }
    }catch(error){
      if(error instanceof TypeError){
        response.writeHead(502, {'content-type': 'application/json'});
        return response.end(JSON.stringify({error: error.message}));
      }
      throw error;
    }
  }
  app(request, response);
});

httpServer.listen(5000, async () => {
  console.log(`Honeycomb server running on port ${5000}.`)
})
