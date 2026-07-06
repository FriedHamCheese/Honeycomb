import {HTTP_STATUS_FOR_BAD_REQUEST} from '../../constraints.js';
import {
  deviceSecretAuthentication, secretAuthenticationError
} from '../auth.js';

import {WebSocketServer} from 'ws';

/*
Websockets for:
- server to mcu
- optional: server to dashboard
- optional: dashboard to server
- optional: mcu to server
*/

export class WebSocketRouterToMCU{
  #webSocketServer;
  #connections;
  
  constructor(){
    this.#connections = []
  }
  
  createSocket(httpServer, relativePath){
    this.#webSocketServer = new WebSocketServer({server: httpServer, path: relativePath});
  }
 
  begin({onMessage, onClose, onError, maxRequestBodyBytes}){
    this.#webSocketServer.on('connection', function (clientWebSocket, httpRequest){
      clientWebSocket.on("message", (data, isBinary) => {
        onMessage({
          data: data, 
          isBinaryData: isBinary, 
          getConnection: this.getConnection.bind(this), 
          addConnection: this.addConnection.bind(this), 
          clientWebSocket: clientWebSocket,
          maxRequestBodyBytes: maxRequestBodyBytes || 1024,
        });
      });
      clientWebSocket.on("close", () => {onClose(this.removeConnection.bind(this), clientWebSocket)});
      clientWebSocket.on("error", onError);
    }.bind(this));
  }
 
  addConnection(connection){
    const deviceAlreadyConnected = this.#connections.find((element) => {return element.deviceID === connection.deviceID;});
    if(deviceAlreadyConnected) return false;
    
    this.#connections.push(connection);
    return true;
  }
  removeConnection(clientWebSocket){
    const indexOfConnection = this.#connections.findIndex((element) => {
      return element.getClientWebSocket() === clientWebSocket;
    });
    if(indexOfConnection === -1) return false;
    
    const REMOVE_ELEMENT_AT_INDEX = 1;
    this.#connections.splice(indexOfConnection, REMOVE_ELEMENT_AT_INDEX);
    return true;
  }
  getConnection(clientWebSocket){
    return this.#connections.find((element) => {return element.getClientWebSocket() === clientWebSocket;});
  }
  
  putToDevice(stringifiedObject, deviceID){
    const connection = this.#connections.find((element) => {return element.deviceID === deviceID;});
    if(!connection) return;
    connection.getClientWebSocket().send(stringifiedObject);
  }
};

export const webSocketRouterToMCU = new WebSocketRouterToMCU();

class ConnectionToMCU{
  #clientWebSocket;
  #deviceID;
  
  constructor(clientWebSocket, deviceID, authenticated){
    this.#clientWebSocket = clientWebSocket;
    this.#deviceID = deviceID;
    this.authenticated = authenticated;
  }
  
  getDeviceID(){
    return this.#deviceID;
  }
  getClientWebSocket(){
    return this.#clientWebSocket;
  }
};


export async function toMCUOnMessage({data, isBinaryData, getConnection, addConnection, clientWebSocket, maxRequestBodyBytes}){
  const connection = getConnection(clientWebSocket);
  
  if(connection)
    if(connection.authenticated) return;
  if(isBinaryData) return clientWebSocket.send({error: "only text data is accepted."});
  
  let textFromData;
  if(data instanceof Buffer){
    if(data.length > maxRequestBodyBytes)
      return clientWebSocket.send({error: `Body of request exceeded ${maxRequestBodyBytes} bytes.`});
    textFromData = data.toString('utf8');
  }else
    return clientWebSocket.send(JSON.stringify({error: `Unsupported data container ${typeof data}, sorry!`}));
  
  let objectFromRequest;
  try{
    objectFromRequest = JSON.parse(textFromData);
  }catch(err){
    if(err instanceof SyntaxError)
      return clientWebSocket.send(JSON.stringify({error: "Could not parse sent JSON."}));
    clientWebSocket.send(JSON.stringify({error: String(err)}));
    return console.log(err);
  }
  
  const isAuthMessageType = ((typeof objectFromRequest.deviceSecret) === "string") && ((typeof objectFromRequest.deviceID) === "number");
  if(!isAuthMessageType)
    return clientWebSocket.send(JSON.stringify({
      error: "This socket connection accepts only {deviceSecret: device secret, deviceID: number} from microcontroller."
    }));
    
  if(!Number.isInteger(objectFromRequest.deviceID))
    return clientWebSocket.send(JSON.stringify({error: ".deviceID must be an integer."}));
  
  const authenticationError = await deviceSecretAuthentication(objectFromRequest.deviceSecret, objectFromRequest.deviceID);
  if(authenticationError === secretAuthenticationError.DEVICEID)
    return clientWebSocket.send(JSON.stringify({error: "Invalid device ID in URL."})); 
  if(authenticationError === secretAuthenticationError.SECRET)
    return clientWebSocket.send(JSON.stringify({error: "Invalid device secret in .deviceSecret."}));
  
  addConnection(new ConnectionToMCU(clientWebSocket, objectFromRequest.deviceID, true));
  return clientWebSocket.send(JSON.stringify({success: true}));
};

export function toMCUOnClose(removeConnection, clientWebSocket){
  console.log("removing connection");
  removeConnection(clientWebSocket);  
}

export function toMCUOnError(error){
  console.log(String(error));
}