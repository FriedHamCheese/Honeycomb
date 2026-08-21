import {MAX_WEBSOCKET_TO_SERVER_BYTES, PORT_NUMBER} from '../constraints.js';
import express from 'express';
import cors from 'cors';

import {WebSocketServer} from 'ws';
import readline from 'node:readline/promises';
import {stdin, stdout} from 'node:process';
import http from 'node:http';
import {setTimeout} from 'node:timers/promises';

const terminal = readline.createInterface({input: stdin, output: stdout});
let httpServer = http.createServer();
const MS_FOR_TERMINAL_SYNC = 500;
const MS_FOR_SENDING_MESSAGE = 2000;

await setTimeout(MS_FOR_TERMINAL_SYNC, 'result');
console.log("Mock server script for Arduino-end testing.");

async function testWebSocketConnectionHandling(){
  await terminal.question("> Validate WebSocket connection handling?");
  await terminal.question("  > The Arduino is powered on and is failing to initialise its Client instance?");
  
  const server = new WebSocketServer({path: "/toDevice", server: httpServer});
  server.on('connection', async function (clientWebSocket){
    server.close();
    clientWebSocket.on('error', function (errorEvent){
      console.error(errorEvent);
    });  
    clientWebSocket.close();
    clientWebSocket.terminate();
  });
  httpServer.listen(PORT_NUMBER);
  await terminal.question("  > Serial from Arduino reports connection and disconnection within 1 minute?");
  httpServer.close();
}

async function testSuccessfulAuth(){
  await terminal.question("> Validate successful authentication attempt?");  
  const server = new WebSocketServer({path: "/toDevice", server: httpServer});
  
  server.on('connection', async function (clientWebSocket){
    server.close();
    
    clientWebSocket.on('message', async function (data, isBinary){
      if(!(data instanceof Buffer)){
        console.error("testSuccessfulAuth(): Fatal Error: Expected data from API to be Buffer type.");
        clientWebSocket.close();
        clientWebSocket.terminate();
        return;
      }
      if(isBinary){
        console.error("testSuccessfulAuth(): Failed: Message from Arduino must be text.");
        clientWebSocket.close();
        clientWebSocket.terminate();
        return;
      }
      if(data.length > MAX_WEBSOCKET_TO_SERVER_BYTES){
        console.error(`testSuccessfulAuth(): Failed: Message from Arduino exceeded ${MAX_WEBSOCKET_TO_SERVER_BYTES} bytes.`);
        clientWebSocket.close();
        clientWebSocket.terminate();
        return;        
      }
      try{
        const objectFromMessage = JSON.parse(data.toString('utf-8'));
        if((typeof objectFromMessage) !== "object"){
          console.error(`testSuccessfulAuth(): Failed: Received JSON not an object type.`);
          clientWebSocket.close();
          clientWebSocket.terminate();
          return;                
        }
        if(objectFromMessage.__messageType === "ping")
          return;
        
        const isCorrectMessage = (
          (objectFromMessage.__messageType === 'auth')
          && (objectFromMessage.deviceID === 3) 
          && (objectFromMessage.deviceSecret === "AkJir9WCYsd%zrHyJPr4xr8m")
        );
        if(!isCorrectMessage){
          console.error(`testSuccessfulAuth(): Failed: Message is not correct.`);
          console.log("testSuccessfulAuth(): Message: ", objectFromMessage);
          clientWebSocket.send(JSON.stringify({__messageType: "auth", error: "Message is incorrect."}));
          clientWebSocket.close();
          clientWebSocket.terminate();
          return;
        }
        
        console.log("\n  > Auth attempt ok. Wait 1.0 second for underlying net.socket to write...");
        clientWebSocket.send(JSON.stringify({__messageType: "auth", success: true}));
        await setTimeout(MS_FOR_SENDING_MESSAGE, 'result');
        clientWebSocket.close();
        clientWebSocket.terminate();
      }catch(error){
        if(error instanceof SyntaxError)
          console.error("testSuccessfulAuth(): Failed: Message from Arduino is not JSON.");
        else console.error("testSuccessfulAuth(): Failed: ", String(error));
        clientWebSocket.close();
        clientWebSocket.terminate();
      }
    });
    clientWebSocket.on('error', function (errorEvent){
      console.error(errorEvent);
    });
  });
  
  httpServer.listen(PORT_NUMBER);
  await terminal.question("  > Terminal reported successful auth attempt?");
  httpServer.close();
}

async function testAuthDeviceIDCollision(){
  await terminal.question("> Validate successful read error from another device holding the same device ID?");  
  const server = new WebSocketServer({path: "/toDevice", server: httpServer});
 
  server.on('connection', async function (clientWebSocket){
    server.close();
    
    clientWebSocket.on('message', async function (data){
      if(!(data instanceof Buffer)){
        console.error("testAuthDeviceIDCollision(): Fatal Error: Expected data from API to be Buffer type.");
        clientWebSocket.close();
        clientWebSocket.terminate();
        return;
      }
      try{
        const objectFromMessage = JSON.parse(data.toString('utf-8'));
        if((typeof objectFromMessage) !== "object"){
          console.error(`testAuthDeviceIDCollision(): Failed: Received JSON not an object type.`);
          clientWebSocket.close();
          clientWebSocket.terminate();
          return;                
        }
        if(objectFromMessage.__messageType === "ping")
          return;
        if(objectFromMessage.__messageType !== "auth"){
          console.error(`testAuthDeviceIDCollision(): Failed: Message type not auth type.`);
          clientWebSocket.close();
          clientWebSocket.terminate();   
          exitFunction = true;
          return;
        }

        console.log("\n  > Auth attempt received.");
        clientWebSocket.send(JSON.stringify({__messageType: "auth", success: false}));
        await setTimeout(MS_FOR_SENDING_MESSAGE, 'result');
        clientWebSocket.close();
        clientWebSocket.terminate();
      }catch(error){
        if(error instanceof SyntaxError)
          console.error("testAuthDeviceIDCollision(): Failed: Message from Arduino is not JSON.");
        else console.error("testAuthDeviceIDCollision(): Failed: ", String(error));
        clientWebSocket.close();
        clientWebSocket.terminate();
      }
    });
    clientWebSocket.on('error', function (errorEvent){
      console.error(errorEvent);
    });
  });
  httpServer.listen(PORT_NUMBER);
  await terminal.question("  > Serial reports failed read error from having same device ID?");
  httpServer.close();
}

async function testSendDataToMCU(){
  await terminal.question("> Validate data receiving and parsing?");  
  const server = new WebSocketServer({path: "/toDevice", server: httpServer});
  server.on('connection', async function (clientWebSocket){
    server.close();

    clientWebSocket.on('message', async function (data){
      if(!(data instanceof Buffer)){
        console.error("testSendDataToMCU(): Fatal Error: Expected data from API to be Buffer type.");
        clientWebSocket.close();
        clientWebSocket.terminate();
        return;
      }
      try{
        const objectFromMessage = JSON.parse(data.toString('utf-8'));
        if((typeof objectFromMessage) !== "object"){
          console.error(`testSendDataToMCU(): Failed: Received JSON not an object type.`);
          clientWebSocket.close();
          clientWebSocket.terminate();
          return;                
        }
        if(objectFromMessage.__messageType === "ping") return;
        
        console.log("\n  > Sent auth acceptance and data.");
        clientWebSocket.send(JSON.stringify({__messageType: "auth", success: true}));
        clientWebSocket.send(JSON.stringify({
          __messageType: "patch", temperature_celsius: 25.0, relative_humidity_percent: 75.0
        }));
        await setTimeout(MS_FOR_SENDING_MESSAGE, 'result');
        clientWebSocket.close();
        clientWebSocket.terminate();
      }catch(err){
        if(error instanceof SyntaxError)
          console.error("testSendDataToMCU(): Failed: Message from Arduino is not JSON.");
        else console.error("testSendDataToMCU(): Failed: ", String(error));
        clientWebSocket.close();
        clientWebSocket.terminate();        
      }
    });
    clientWebSocket.on('error', function (errorEvent){
      console.error(errorEvent);
    });
  });
  
  httpServer.listen(PORT_NUMBER);
  await terminal.question("  > Serial reports temperature as 25.0 and humidity as 75.0?");
  httpServer.close();   
}

async function testPatchMessage(){
  await terminal.question("> Validate HTTP patch message?");  
  
  const httpRouter = express();
  httpRouter.use(cors());
  httpRouter.use(express.json());
  httpRouter.post("/apiv1/device/:deviceID/datapoint", function (request, response){
    const deviceIDInt = Number.parseInt(request.params.deviceID);
    if(deviceIDInt !== 3){
      console.error("  > HTTP router: deviceID URL part is not 3.");
      response.status(400).send({});
      return;
    }
    if(request.get('Authorization') !== "AkJir9WCYsd%zrHyJPr4xr8m"){
      console.error("  > HTTP router: invalid authorization header for device 3.");
      response.status(401).send({});
      return;
    }
    if((typeof request.body) !== "object"){
      console.error("  > HTTP router: request body not JSON.");
      response.status(400).send({});
      return;
    }
    const isCorrectJSON = (
      (request.body.temperature_celsius === 27.0) 
      && (request.body.relative_humidity_percent === 80.0) 
      && (request.body.notes === "Ice cream")
    );
    if(isCorrectJSON){
      console.log("  > HTTP router: patch request message ok.");
      return response.status(201).send({});
    }
    console.error("  > HTTP router: patch request incorrect.");
    return response.status(201).send({});
  });
  
  httpServer = http.createServer(httpRouter);
  const server = new WebSocketServer({path: "/toDevice", server: httpServer});
  let clientSocket;
  
  server.on('connection', async function (clientWebSocket){
    server.close();
    clientSocket = clientWebSocket;

    clientWebSocket.on('message', async function (data){
      clientWebSocket.send(JSON.stringify({__messageType: "auth", success: true}));
      await setTimeout(MS_FOR_SENDING_MESSAGE, 'result');
    });
    clientWebSocket.on('error', function (errorEvent){
      console.error(errorEvent);
    });  
  });
  httpServer.listen(PORT_NUMBER);
  await terminal.question("  > Terminal received expected message?");
  if(clientSocket) clientSocket.close();
  httpServer.close();
}


await testWebSocketConnectionHandling();
await testSuccessfulAuth();
await testAuthDeviceIDCollision();
await testSendDataToMCU();
await testPatchMessage();

await setTimeout(MS_FOR_TERMINAL_SYNC, 'result');
terminal.close();