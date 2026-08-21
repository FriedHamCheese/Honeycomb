import {
  HTTP_STATUS_FOR_BAD_REQUEST, 
  WEBSOCKET_MAX_AUTHENTICATED_CONNECTIONS, 
  MAX_DEVICE_SECRET_CHARACTERS,
  MAX_WEBSOCKET_TO_SERVER_BYTES,
  WEBSOCKET_MS_BEFORE_STALE,
  } from '../../constraints.js';
import {
  addDatapoint
} from '../api_methods.js';
import {
  deviceSecretAuthentication, secretAuthenticationError
} from '../auth.js';

import {WebSocketServer} from 'ws';

export class WebSocketRouterToMCU{
  #webSocketServer;
  #authenticatedConnections;
  
  constructor(){
    //array[AuthenticatedMCUConnection | null];
    this.#authenticatedConnections = []
  }
  
  createSocket(httpServer, relativePath){
    //May throw undocumented exceptions
    this.#webSocketServer = new WebSocketServer({server: httpServer, path: relativePath});
  }
 
  begin(){
    this.#webSocketServer.on('connection', function (clientWebSocket, httpRequest){
      clientWebSocket.on("message", (data, isBinary) => {
        toMCUOnMessage({
          data: data, 
          isBinaryData: isBinary, 
          getAuthenticatedConnection: this.getAuthenticatedConnection.bind(this), 
          addAuthenticatedConnection: this.addAuthenticatedConnection.bind(this), 
          clientWebSocket: clientWebSocket,
          removeStaleAuthenticatedConnections: this.removeStaleAuthenticatedConnections.bind(this),
        });
      });
      clientWebSocket.on("close", () => {toMCUOnClose(this.removeAuthenticatedSocket.bind(this), clientWebSocket)});
      clientWebSocket.on("error", toMCUOnError);
    }.bind(this));
  }
 
  addAuthenticatedConnection(connection){
    /*
      Adds an AuthenticatedMCUConnection to this.#authenticatedConnections.
      Does not raise exceptions.
      
      Returns:
      - true, if connection is able to be added.
      - false, if there is a live connection with the same device ID, or the container of live connections is full.
    */
    const indexOfDeviceWithID = this.#authenticatedConnections.findIndex(function (element){
      if(!element) return false;
      return element.deviceID === connection.deviceID;
    });
    const deviceIDClaimedByAnotherConnection = indexOfDeviceWithID !== -1;
    if(deviceIDClaimedByAnotherConnection) return false;
    
    if(this.#authenticatedConnections.length < WEBSOCKET_MAX_AUTHENTICATED_CONNECTIONS){
      this.#authenticatedConnections.push(connection); 
      return true;
    }
    const emptyConnectionSlot = this.#authenticatedConnections.findIndex(function (element){return element === null});
    const noEmptyConnectionSlot = emptyConnectionSlot === -1;
    if(noEmptyConnectionSlot) return false;    
    this.#authenticatedConnections[emptyConnectionSlot] = connection;
    return true;
  }
  removeAuthenticatedSocket(clientWebSocket){
    /*
      Removes an AuthenticatedMCUConnection containing the socket from this.#authenticatedConnections.
      May raise undocumented exceptions.
      
      Returns:
      - true, if the socket corresponds to an AuthenticatedMCUConnection, the socket is closed 
        and the AuthenticatedMCUConnection removed.
      - false, if the socket doesn't
    */
    const indexOfConnection = this.#authenticatedConnections.findIndex((element) => {
      if(!element) return false;
      return element.getClientWebSocket() === clientWebSocket;
    });
    const socketNotAuthenticated = indexOfConnection === -1;
    if(socketNotAuthenticated) return false;
    
    this.#authenticatedConnections[indexOfConnection].getClientWebSocket().close();
    this.#authenticatedConnections[indexOfConnection] = null;
    return true;
  }
  getAuthenticatedConnection(clientWebSocket){
    /*
      Returns an AuthenticatedMCUConnection corresponding to the socket.
      Does not raise exceptions.
      Returns: AuthenticatedMCUConnection, null if not found.
    */
    return this.#authenticatedConnections.find((element) => {
      if(!element) return false;
      return element.getClientWebSocket() === clientWebSocket;
    });
  }  
  removeStaleAuthenticatedConnections(){
    /*
      Iterates through this.#authenticatedConnections 
      and removes any AuthenticatedMCUConnection which hasn't pinged the server within WEBSOCKET_MS_BEFORE_STALE,
      closing the socket connection before removing.
      
      May raise undocumented exceptions.
      Returns nothing.
    */
    const currentMsSinceEpoch = Date.now();
    while(this.#authenticatedConnections.length !== 0){      
      const staleConnectionIndex = this.#authenticatedConnections.findIndex(
        (element) => {
          if(!element) return false;
          return (currentMsSinceEpoch - element.lastResponseEpochMs) >= WEBSOCKET_MS_BEFORE_STALE;
        }
      );
      const noStaleConnections = staleConnectionIndex === -1;
      if(noStaleConnections) break;
      this.#authenticatedConnections[staleConnectionIndex].getClientWebSocket().close();
      this.#authenticatedConnections[staleConnectionIndex] = null;
    }
  }

  putToDevice(stringifiedObject, deviceID){
    /*
    Finds the AuthenticatedMCUConnection corresponding to deviceID and sends stringifiedObject.
    stringifiedObject must be a stringified JSON.
    
    May raise undocumented exceptions.
    Returns true if the connection is found and the string is sent, false if not found.
    */
    const connection = this.#authenticatedConnections.find((element) => {
      if(!element) return false;
      return element.getDeviceID() === deviceID;
    });
    if(!connection) return false;
    connection.getClientWebSocket().send(stringifiedObject);
    return true;
  }
};

export const webSocketRouterToMCU = new WebSocketRouterToMCU();


class AuthenticatedMCUConnection{
  #clientWebSocket;
  #deviceID;
  
  constructor(clientWebSocket, deviceID, authenticated){
    //Does not raise exceptions.
    this.#clientWebSocket = clientWebSocket;
    this.#deviceID = deviceID;
    this.authenticated = authenticated;
    this.lastResponseEpochMs = Date.now();
  }
  
  getDeviceID(){
    //Does not raise exceptions.
    return this.#deviceID;
  }
  getClientWebSocket(){
    //Does not raise exceptions.
    return this.#clientWebSocket;
  }
};


export async function toMCUOnMessage(
  {data, isBinaryData, getAuthenticatedConnection, addAuthenticatedConnection, clientWebSocket, maxRequestBodyBytes, removeStaleAuthenticatedConnections}
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
  }
  See handleAuthMessage for __messageType: "auth" input and response.
  
  Returns:
  - {__messageType: "error", error: string} for type-generic errors when:
    - received message is detected as binary instead of text
    - length of message exceeds server-set amount of bytes
    - couldn't parse message as JSON. Note: make sure C null terminator is not in the message.
    - npm ws gives its data as other type than Buffer
  - {__messageType: "auth", ...} see handleAuthMessage.
  - {__messageType: "pingerr"}: the device is not authenticated
  
  Does not raise exceptions, outputs to clientWebSocket and console.
  */
  const connection = getAuthenticatedConnection(clientWebSocket);
  if(connection) connection.lastResponseEpochMs = Date.now();
  
  try{
    if(isBinaryData)
      return clientWebSocket.send(JSON.stringify({__messageType: "error", error: "only text data is accepted."}));
    if(!(data instanceof Buffer)){
      return clientWebSocket.send(JSON.stringify({
        __messageType: "error", error: `Unsupported data container ${typeof data}, sorry!`
      }));
    }
    if(data.length > MAX_WEBSOCKET_TO_SERVER_BYTES){
      return clientWebSocket.send(JSON.stringify({
        __messageType: "error", error: `Body of request exceeded ${MAX_WEBSOCKET_TO_SERVER_BYTES} bytes.`
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
      case("ping"):{
        clientWebSocket.send(JSON.stringify({__messageType: "pong"}));  
        break;
      };
      case("auth"):{
        await handleAuthMessage(objectFromRequest, connection, clientWebSocket, removeStaleAuthenticatedConnections, addAuthenticatedConnection);
        break;
      }
      case("patch"):{
        if(!connection)
          return client.send(JSON.stringify{
            __messageType: "error", error: "patch message requires authentication beforehand."
          });
        const isCompositeDevice = !(await addDatapoint(
          objectFromRequest, 
          `${connection.getDeviceID()}_0`, 
          sqlConnectionPool, 
          honeycombDBConnectionPool, 
          connection.getDeviceID())
        );
        if(isCompositeDevice)
          return clientWebSocket.send(JSON.stringify({
            __messageType: "error", error: "Cannot add datapoint to composite device."})
          );
        break;
      }
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

export function toMCUOnClose(removeAuthenticatedSocket, clientWebSocket){
  try{
    removeAuthenticatedSocket(clientWebSocket);
  }catch(err){
    console.log("WebSocket server to MCU: toMCUOnClose:");
    console.log(String(err));    
  }
}

export function toMCUOnError(error){
  console.log("WebSocket server to MCU: toMCUOnError:");
  console.log(String(error));
}

async function handleAuthMessage(
  objectFromRequest, connection, clientWebSocket, removeStaleAuthenticatedConnections, addAuthenticatedConnection
){
  /*
    Handles messages with __messageType: "auth".
    May raise undocumented exceptions.
    
    Input:{
      __messageType: "auth",
      deviceID: int,
      deviceSecret: str[0-MAX_DEVICE_SECRET_CHARACTERS]
    }
    
    Writes to connection with:
    - {__messageType: "auth", success: true|false}
      - .success is true if no other connection occupies the same device ID
    - {__messageType: "auth", error: str}: invalid attribute for auth type message.
    
    Returns nothing.
  */
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
    
  removeStaleAuthenticatedConnections();
  const acceptedAuth = addAuthenticatedConnection(new AuthenticatedMCUConnection(clientWebSocket, objectFromRequest.deviceID, true));
  return clientWebSocket.send(JSON.stringify({
    __messageType: "auth", success: acceptedAuth
  }));   
}