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
    //optimise to allocate until certain size, delete by setting as null
    this.#connections = []
  }
  
  createSocket(httpServer, relativePath, minConnectionStaleMs, maxAuthenticatedConnections){
    this.#webSocketServer = new WebSocketServer({server: httpServer, path: relativePath});
    this.minConnectionStaleMs = minConnectionStaleMs;
    this.maxAuthenticatedConnections = maxAuthenticatedConnections;
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
          removeStaleConnections: this.removeStaleConnections.bind(this),
        });
      });
      clientWebSocket.on("close", () => {onClose(this.removeConnection.bind(this), clientWebSocket)});
      clientWebSocket.on("error", onError);
    }.bind(this));
  }
 
  addConnection(connection){
    const indexOfDeviceWithID = this.#connections.findIndex(function (element){
      if(!element) return false;
      return element.deviceID === connection.deviceID;
    });
    if(indexOfDeviceWithID !== -1) return false;
    
    if(this.#connections.length < this.maxAuthenticatedConnections){
      this.#connections.push(connection); 
      return true;
    }
    const emptyConnectionSlot = this.#connections.findIndex(function (element){return element === null});
    if(emptyConnectionSlot !== -1) return false;    
    this.#connections[emptyConnectionSlot] = connection;
    return true;
  }
  removeConnection(clientWebSocket){
    const indexOfConnection = this.#connections.findIndex((element) => {
      if(!element) return false;
      return element.getClientWebSocket() === clientWebSocket;
    });
    if(indexOfConnection === -1) return false;
    
    const REMOVE_ELEMENT_AT_INDEX = 1;
    this.#connections[indexOfConnection].getClientWebSocket().close();
    this.#connections[indexOfConnection] = null;
    return true;
  }
  getConnection(clientWebSocket){
    return this.#connections.find((element) => {return element.getClientWebSocket() === clientWebSocket;});
  }  
  removeStaleConnections(){
    const currentMsSinceEpoch = Date.now();
    while(this.#connections.length !== 0){      
      const staleConnectionIndex = this.#connections.findIndex(
        (element) => {
          if(!element) return false;
          return (currentMsSinceEpoch - element.lastResponseTime) >= this.minConnectionStaleMs;
        }
      );
      const DELETE_AT_INDEX = 1;
      if(staleConnectionIndex === -1)
        break;
      this.#connections[staleConnectionIndex].getClientWebSocket().close();
      this.#connections[staleConnectionIndex] = null;
    }
  }
  
  putToDevice(stringifiedObject, deviceID){
    const connection = this.#connections.find((element) => {return element.getDeviceID() === deviceID;});
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
    this.lastResponseTime = Date.now();
  }
  
  getDeviceID(){
    return this.#deviceID;
  }
  getClientWebSocket(){
    return this.#clientWebSocket;
  }
};


export async function toMCUOnMessage(
  {data, isBinaryData, getConnection, addConnection, clientWebSocket, maxRequestBodyBytes, removeStaleConnections}
){  
  /*
  Dispatches message handling to appropriate types and conditions.
  The device must first authenticate, 
  then send (ping) any message to the server every 60 seconds to not consider the connection as stale and to be removed.
  If no valid message is available for pinging, 
  use {__messageType: "ping"} to not cause JSON parse errors or message type errors.
  
  The message format uses JSON in the format of:{
    __messageType: string,
    (...type-specific attributes)
  } which could be:
    - {
      __messageType: "auth",
      deviceID: int,
      deviceSecret: str[0-MAX_DEVICE_SECRET_CHARACTERS]
    } for marking a connection as authenticated
    - {
      __messageType: "ping"
    } to not mark the connection as stale for removal
  
  Returns:
  - {__messageType: "error", error: string} for type-generic errors when:
    - received message is detected as binary instead of text
    - length of message exceeds server-set amount of bytes
    - couldn't parse message as JSON. Note: make sure C null terminator is not in the message.
  - {__messageType: "auth", success: true|false}
    - .success is true if no other connection occupies the same device ID
  - {__messageType: "auth", error: str}: invalid attribute for auth type message.
  - {__messageType: "pingerr"}: the device is not authenticated
  */
  const connection = getConnection(clientWebSocket);
  if(connection) connection.lastResponseTime = Date.now();
  
  try{
    if(isBinaryData)
      return clientWebSocket.send({__messageType: "error", error: "only text data is accepted."});
    if(!(data instanceof Buffer)){
      return clientWebSocket.send(JSON.stringify({
        __messageType: "error", error: `Unsupported data container ${typeof data}, sorry!`
      }));
    }
    if(data.length > maxRequestBodyBytes){
      return clientWebSocket.send(JSON.stringify({
        __messageType: "error", error: `Body of request exceeded ${maxRequestBodyBytes} bytes.`
      }));
    }
    
    const textFromData = data.toString('utf8');
    let objectFromRequest;
    try{
      objectFromRequest = JSON.parse(textFromData);
    }catch(err){
      if(err instanceof SyntaxError)
        return clientWebSocket.send(JSON.stringify({
          __messageType: "error", error: "Could not parse sent JSON."
        }));
      clientWebSocket.send(JSON.stringify({
        __messageType: "error", error: String(err)
      }));
      console.log("WebSocket server to MCU: toMCUOnMessage:");
      console.log(err);
      return;
    }
    const noHaveMessageType = (typeof objectFromRequest.__messageType) !== "string";
    if(noHaveMessageType) return clientWebSocket.send(JSON.stringify({
      __messageType: "error", error: "Message does not have .__messageType as string."
    }));
    
    switch(objectFromRequest.__messageType){
      case("auth"):{
        await handleAuthMessage(objectFromRequest, connection, clientWebSocket, removeStaleConnections, addConnection);
        break;
      }
      case("ping"): break;
      default:
      clientWebSocket.send(JSON.stringify({
        __messageType: "error", error: `Unrecognised __messageType ${objectFromRequest.__messageType}`
      }));
    }
  }catch(err){
    console.log("WebSocket server to MCU: toMCUOnMessage:");
    console.log(String(err));
  }
};

export function toMCUOnClose(removeConnection, clientWebSocket){
  removeConnection(clientWebSocket);
}

export function toMCUOnError(error){
  console.log("WebSocket server to MCU: toMCUOnError:");
  console.log(String(error));
}

async function handleAuthMessage(objectFromRequest, connection, clientWebSocket, removeStaleConnections, addConnection){
  if((typeof objectFromRequest.deviceSecret) !== "string")
    return clientWebSocket.send(JSON.stringify({
      __messageType: "auth", error: ".deviceSecret must be an string."
    })); 

  if(connection)
    if(connection.authenticated) return clientWebSocket.send(JSON.stringify({
      __messageType: "auth", success: true
    }));
  
  if(!Number.isInteger(objectFromRequest.deviceID))
    return clientWebSocket.send(JSON.stringify({
      __messageType: "auth", error: ".deviceID must be an integer."
    }));
  
  const authenticationError = await deviceSecretAuthentication(objectFromRequest.deviceSecret, objectFromRequest.deviceID);
  if(authenticationError === secretAuthenticationError.DEVICEID)
    return clientWebSocket.send(JSON.stringify({
      __messageType: "auth", error: "Invalid device ID."
    })); 
  if(authenticationError === secretAuthenticationError.SECRET)
    return clientWebSocket.send(JSON.stringify({
      __messageType: "auth", error: "Invalid device secret in .deviceSecret."
    }));
    
  removeStaleConnections();
  const acceptedAuth = addConnection(new ConnectionToMCU(clientWebSocket, objectFromRequest.deviceID, true));
  return clientWebSocket.send(JSON.stringify({
    __messageType: "auth", success: acceptedAuth
  }));   
}