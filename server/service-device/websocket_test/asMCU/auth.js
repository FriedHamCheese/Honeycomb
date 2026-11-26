import {setTimeout} from 'node:timers/promises';
import {HTTP_STATUS_FOR_OK, WEBSOCKET_MS_BEFORE_STALE} from '../../../../constraints.js';

export async function testAuth(webSocketURL){    
  const asyncTimerAbort = new AbortController();
  const socket = new WebSocket(webSocketURL);
  const MAX_TIMEOUT_MS = 5000;

  try{
    socket.addEventListener('open', function (){
      socket.send(JSON.stringify({__messageType: "auth", deviceID: 1, deviceSecret: "I!7T#'q3%uB]yP4U03llRw.1"}));
    }, {signal: asyncTimerAbort.signal});
    socket.addEventListener('error', function (errorEvent){
      asyncTimerAbort.abort();
      console.log("testWebSocketRouterToMCU(): testAuth()", "\n\tFailed: ", errorEvent);
    }, {signal: asyncTimerAbort.signal}); 
    socket.addEventListener('message', function(event){
      if((typeof event.data) !== "string"){
        asyncTimerAbort.abort();
        console.log("testWebSocketRouterToMCU(): testAuth(): Failed: Received event.data should be string type.");
        return;
      }
      
      const objectFromMessage = JSON.parse(event.data);
      if(objectFromMessage.__messageType !== "auth") return;
      asyncTimerAbort.abort();
      console.log(objectFromMessage.success ? 
        "testWebSocketRouterToMCU(): testAuth(): OK" 
        : "testWebSocketRouterToMCU(): testAuth(): Failed: .success is not true.");
    }, {signal: asyncTimerAbort.signal});
  }
  catch(err){
    asyncTimerAbort.abort();
    socket.close();
    console.log("testWebSocketRouterToMCU(): testAuth()", "\n\tFailed: ", String(err));
  }
  try{
    await setTimeout(MAX_TIMEOUT_MS, 'result', {signal: asyncTimerAbort.signal});
    console.log("testWebSocketRouterToMCU(): testAuth(): Failed: connection was not made in time.");      
  }catch(err){}
  socket.close();
}

export async function testIncorrectAuth(webSocketURL){    
  const asyncTimerAbort = new AbortController();
  const socket = new WebSocket(webSocketURL);
  const MAX_TIMEOUT_MS = 5000;
  try{
    socket.addEventListener('open', function (){
      socket.send(JSON.stringify({__messageType: "auth", deviceID: 1, deviceSecret: "xd"}));
    }, {signal: asyncTimerAbort.signal});
    socket.addEventListener('error', function (errorEvent){
      asyncTimerAbort.abort();
      console.log("testWebSocketRouterToMCU(): testIncorrectAuth()", "\n\tFailed: ", errorEvent);
    }, {signal: asyncTimerAbort.signal}); 
    socket.addEventListener('message', function(event){
      if((typeof event.data) !== "string"){
        asyncTimerAbort.abort();
        console.log("testWebSocketRouterToMCU(): testIncorrectAuth(): Failed: Received event.data should be string type.");
        return;
      }
      
      const objectFromMessage = JSON.parse(event.data);
      if(objectFromMessage.__messageType !== "auth") return;
      asyncTimerAbort.abort();
      console.log(!objectFromMessage.success ? 
        "testWebSocketRouterToMCU(): testIncorrectAuth(): OK" 
        : "testWebSocketRouterToMCU(): testIncorrectAuth(): Failed: .success is not true.");
    }, {signal: asyncTimerAbort.signal});
  }
  catch(err){
    asyncTimerAbort.abort();
    socket.close();
    console.log("testWebSocketRouterToMCU(): testIncorrectAuth()", "\n\tFailed: ", String(err));
  }
  try{
    await setTimeout(MAX_TIMEOUT_MS, 'result', {signal: asyncTimerAbort.signal});
    console.log("testWebSocketRouterToMCU(): testIncorrectAuth(): Failed: connection was not made in time.");      
  }catch(err){}
  socket.close();
}

export async function testCompetingForStaleAuths(webSocketURL){        
  try{
    const firstAuthSocket = new WebSocket(webSocketURL);
    if(!(await authenticateFirstSocket(firstAuthSocket))){
      firstAuthSocket.close();
      return;
    }
    const secondAuthSocket = new WebSocket(webSocketURL);
    if(!(await autenticateSecondSocketFirstTime(secondAuthSocket))){
      firstAuthSocket.close();
      secondAuthSocket.close();        
      return;        
    }
    
    console.log(
      `testWebSocketRouterToMCU(): testCompetingForStaleAuths(): Waiting ${WEBSOCKET_MS_BEFORE_STALE}ms for first connection to become stale.`
    );
    await setTimeout(WEBSOCKET_MS_BEFORE_STALE, 'result');
    if(await autenticateSecondSocketSecondTime(secondAuthSocket))
      console.log("testWebSocketRouterToMCU(): testCompetingForStaleAuths(): OK");
    else console.log(
      "testWebSocketRouterToMCU(): testCompetingForStaleAuths(): Failed: Second socket auth should overthrow stale connection of first socket."
    );
    
    firstAuthSocket.close();
    secondAuthSocket.close();
  }catch(err){
    console.log("testWebSocketRouterToMCU(): testCompetingForStaleAuths()", "\n\tFailed: ", String(err));
  }
  
  async function authenticateFirstSocket(firstAuthSocket){
    const abortAsync = new AbortController();
    let connectionOK = false;
    
    firstAuthSocket.addEventListener('open', function (){
      firstAuthSocket.send(JSON.stringify({__messageType: "auth", deviceID: 1, deviceSecret: "I!7T#'q3%uB]yP4U03llRw.1"}));
    });
    firstAuthSocket.addEventListener('error', 
      function (errorEvent){
        abortAsync.abort();
        console.log("testWebSocketRouterToMCU(): testCompetingForStaleAuths()", "\n\tFailed: ", errorEvent);
      }, 
      {signal: abortAsync.signal}
    );
    firstAuthSocket.addEventListener('message', function(event){
      const objectFromMessage = JSON.parse(event.data);
      if(objectFromMessage.__messageType === "auth")
        if(!objectFromMessage.success){
          firstAuthSocket.send(
            JSON.stringify({__messageType: "auth", deviceID: 1, deviceSecret: "I!7T#'q3%uB]yP4U03llRw.1"})
          );
        }else{
          connectionOK = true;
          abortAsync.abort();
        }
    }, {signal: abortAsync.signal}
    );

    try{
      const MS_AFTER_FIRST_CONNECTION = WEBSOCKET_MS_BEFORE_STALE;
      await setTimeout(MS_AFTER_FIRST_CONNECTION, 'result', {signal: abortAsync.signal});
    }catch(err){
    }
    return connectionOK;
  }
  async function autenticateSecondSocketFirstTime(secondAuthSocket){
    const abortAsync = new AbortController();
    let hasError = false;
    
    secondAuthSocket.addEventListener('open', function (){
      secondAuthSocket.send(JSON.stringify({__messageType: "auth", deviceID: 1, deviceSecret: "I!7T#'q3%uB]yP4U03llRw.1"}));
    });
    secondAuthSocket.addEventListener('error', 
      function (errorEvent){
        abortAsync.abort();
        hasError = true;
        console.log("testWebSocketRouterToMCU(): testCompetingForStaleAuths()", "\n\tFailed: ", errorEvent);
      }, 
      {signal: abortAsync.signal}
    );
    secondAuthSocket.addEventListener('message', 
      function(event){
        const objectFromMessage = JSON.parse(event.data);
        if(objectFromMessage.__messageType === "auth" && objectFromMessage.success){
          console.log(
            "testWebSocketRouterToMCU(): testCompetingForStaleAuths(): Failed: Unexpected second socket auth success."
          );
          hasError = true;
          abortAsync.abort();
        }
      }, {signal: abortAsync.signal}
    ); 
    try{
      const MS_FOR_SECOND_CONNECTION_AUTH = 5000;
      await setTimeout(MS_FOR_SECOND_CONNECTION_AUTH, 'result', {signal: abortAsync.signal});
      abortAsync.abort();
    }catch(err){
    }
    return !hasError;
  }
  async function autenticateSecondSocketSecondTime(secondAuthSocket){
    const abortAsync = new AbortController();
    let success = false;
    
    secondAuthSocket.addEventListener('message', function(event){
      abortAsync.abort();
      const objectFromMessage = JSON.parse(event.data);
      if(objectFromMessage.__messageType === "auth")
        success = objectFromMessage.success;
    }, {signal: abortAsync.signal}
    );

    secondAuthSocket.send(JSON.stringify({__messageType: "auth", deviceID: 1, deviceSecret: "I!7T#'q3%uB]yP4U03llRw.1"}));      
    const MS_FOR_THIRD_AUTH = 5000;
    try{
      await setTimeout(MS_FOR_THIRD_AUTH, 'result', {signal: abortAsync.signal});
      console.log(
        "testWebSocketRouterToMCU(): testCompetingForStaleAuths(): Failed: Third auth attempt took too much time."
      );        
    }catch(err){
    }
    return success;
  }
}//testCompetingForStaleAuths()
