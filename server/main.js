import {userRouter} from './apiv1/user.js';
import {deviceRouter} from './apiv1/device.js';

import express from "express";
import cors from "cors";

import http from 'node:http';

const app = express();
app.use(express.json({limit: "1kb"}));
app.use(cors());
const apiRouter = express.Router();

apiRouter.use("/device", deviceRouter);
apiRouter.use("/user", userRouter);
//apiRouter.use("/dashboard", dashboardRouter);
app.use("/apiv1", apiRouter);

const httpServer = http.createServer();
//should validate authentication per request with auth but periodically
httpServer.on('request', async (request, response) => {
  const headers = request.headers;
  const userAuthAttempt = (typeof headers.authorization) === "string";  
  const deviceSecret = headers.devicesecret;
  const devicePathMatch = request.url.match(/^\/apiv1\/device\/([^/]+)(?:\/|$)/);

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
        const cachedLogin = await userAuthResponse.json();
        request.headers['user-id'] = cachedLogin.userID;     
      }
    }catch(error){
      if(error instanceof TypeError){
        response.writeHead(502, {'content-type': 'application/json'});
        return response.end(JSON.stringify({error: error.message}));
      }
      throw error;
    }
  }

  if(typeof deviceSecret === "string" && devicePathMatch){
    try {
      const deviceAuthResponse = await fetch(
        `http://localhost:5200/apiv1/device/${devicePathMatch[1]}/auth`,
        {
          headers: {devicesecret: deviceSecret},
          keepalive: true,
        }
      );
      if(!deviceAuthResponse.ok){
        const errorBody = await deviceAuthResponse.text();
        response.writeHead(deviceAuthResponse.status, {
          'content-type': deviceAuthResponse.headers.get('content-type') || 'text/plain',
        });
        return response.end(errorBody);
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
