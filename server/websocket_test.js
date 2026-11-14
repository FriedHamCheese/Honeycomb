import {HTTP_STATUS_FOR_OK, WEBSOCKET_MS_BEFORE_STALE} from '../constraints.js';
import {setTimeout} from 'node:timers/promises';

async function testWebSocketRouterToMCU(){
  const ENDPOINT_URL = "http://localhost:5001/websocketapiv1";
  const MAX_TIMEOUT_MS = 5000;

  function testConnect(){
    const asyncTimerAbort = new AbortController();
    const socket = new WebSocket(ENDPOINT_URL);
    
    setTimeout(MAX_TIMEOUT_MS, 'result', {signal: asyncTimerAbort.signal}).then(function (resolve){
      socket.close();
      console.log("testWebSocketRouterToMCU(): testConnect(): Failed: connection was not made in time.");      
    }, function (reject){});
    
    socket.addEventListener('open', function(){
      socket.close();  
      asyncTimerAbort.abort();
      console.log("testWebSocketRouterToMCU(): testConnect(): OK");      
    }, {signal: asyncTimerAbort.signal});
    socket.addEventListener('error', function (errorEvent){
      asyncTimerAbort.abort();
      socket.close();
      console.log("testWebSocketRouterToMCU(): testConnect()", "\n\tFailed: ", errorEvent);
    }, {signal: asyncTimerAbort.signal});   
  }
  
  function testAuth(){    
    const asyncTimerAbort = new AbortController();
    const socket = new WebSocket(ENDPOINT_URL);
    const MAX_TIMEOUT_MS = 5000;
    setTimeout(MAX_TIMEOUT_MS, 'result', {signal: asyncTimerAbort.signal}).then(function (resolve){
      socket.close();
      console.log("testWebSocketRouterToMCU(): testAuth(): Failed: connection was not made in time.");      
    }, function (reject){});

    try{
      socket.addEventListener('open', function (){
        socket.send(JSON.stringify({__messageType: "auth", deviceID: 1, deviceSecret: "I!7T#'q3%uB]yP4U03llRw.1"}));
      });
      socket.addEventListener('error', function (errorEvent){
        asyncTimerAbort.abort();
        socket.close();
        console.log("testWebSocketRouterToMCU(): testAuth()", "\n\tFailed: ", errorEvent);
      }); 
      socket.addEventListener('message', function(event){
        if((typeof event.data) !== "string"){
          asyncTimerAbort.abort();
          socket.close();
          console.log("testWebSocketRouterToMCU(): testAuth(): Failed: Received event.data should be string type.");
          return;
        }
        
        const objectFromMessage = JSON.parse(event.data);
        asyncTimerAbort.abort();
        socket.close();
        console.log(objectFromMessage.success ? 
          "testWebSocketRouterToMCU(): testAuth(): OK" 
          : "testWebSocketRouterToMCU(): testAuth(): Failed: .success is not true.");
      });
    }
    catch(err){
      asyncTimerAbort.abort();
      socket.close();
      console.log("testWebSocketRouterToMCU(): testAuth()", "\n\tFailed: ", String(err));
    }
  }

  async function testPatchRequiresAuthentication(){
    const socket = new WebSocket(ENDPOINT_URL);
    const abortAsync = new AbortController();
    let testPassed = false;

    socket.addEventListener('open', function(){
      socket.send(JSON.stringify({
        __messageType: "patch",
        temperature_celsius: 27.0,
        relative_humidity_percent: 80.0,
      }));
    }, {signal: abortAsync.signal});
    socket.addEventListener('message', function(event){
      const objectFromMessage = JSON.parse(event.data);
      testPassed = objectFromMessage.__messageType === "error"
        && objectFromMessage.error === "patch message requires authentication beforehand.";
      abortAsync.abort();
      socket.close();
    }, {signal: abortAsync.signal});
    socket.addEventListener('error', function(){
      abortAsync.abort();
      socket.close();
    }, {signal: abortAsync.signal});

    try{
      await setTimeout(MAX_TIMEOUT_MS, 'result', {signal: abortAsync.signal});
      console.log(
        "testWebSocketRouterToMCU(): testPatchRequiresAuthentication(): Failed: timed out."
      );
      return false;
    }catch(err){
      console.log(testPassed
        ? "testWebSocketRouterToMCU(): testPatchRequiresAuthentication(): OK"
        : "testWebSocketRouterToMCU(): testPatchRequiresAuthentication(): Failed: unexpected response."
      );
      return testPassed;
    }
  }

  async function testAuthenticatedPatch(){
    const socket = new WebSocket(ENDPOINT_URL);
    const abortAsync = new AbortController();
    let patchSent = false;
    let socketError = false;

    socket.addEventListener('open', function(){
      socket.send(JSON.stringify({
        __messageType: "auth",
        deviceID: 3,
        deviceSecret: "AkJir9WCYsd%zrHyJPr4xr8m"
      }));
      setTimeout(100, 'result', {signal: abortAsync.signal}).then(function(){
        socket.send(JSON.stringify({
          __messageType: "patch",
          temperature_celsius: 31.25,
          relative_humidity_percent: 83.75,
          epoch_seconds: 987654.0
        }));
        patchSent = true;
      }, function(){});
    }, {signal: abortAsync.signal});
    socket.addEventListener('message', function(event){
      if((typeof event.data) !== "string"){
        socketError = true;
        return;
      }
      const objectFromMessage = JSON.parse(event.data);
      socketError = socketError || objectFromMessage.__messageType === "error";
    }, {signal: abortAsync.signal});
    socket.addEventListener('error', function(){
      socketError = true;
      abortAsync.abort();
      socket.close();
    }, {signal: abortAsync.signal});

    try{
      await setTimeout(500, 'result', {signal: abortAsync.signal});
    }catch(err){
    }
    abortAsync.abort();
    socket.close();

    const testPassed = patchSent && !socketError;
    console.log(testPassed
      ? "testWebSocketRouterToMCU(): testAuthenticatedPatch(): OK"
      : "testWebSocketRouterToMCU(): testAuthenticatedPatch(): Failed: patch was rejected."
    );
    return testPassed;
  }

  async function testCompetingForStaleAuths(){        
    try{
      const firstAuthSocket = new WebSocket(ENDPOINT_URL);
      if(!(await authenticateFirstSocket(firstAuthSocket))){
        firstAuthSocket.close();
        return;
      }
      const secondAuthSocket = new WebSocket(ENDPOINT_URL);
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
      let connectionOK = true;
      
      firstAuthSocket.addEventListener('open', function (){
        firstAuthSocket.send(JSON.stringify({__messageType: "auth", deviceID: 1, deviceSecret: "I!7T#'q3%uB]yP4U03llRw.1"}));
      });
      firstAuthSocket.addEventListener('error', 
        function (errorEvent){
          abortAsync.abort();
          connectionOK = false;
          console.log("testWebSocketRouterToMCU(): testCompetingForStaleAuths()", "\n\tFailed: ", errorEvent);
        }, 
        {signal: abortAsync.signal}
      );
      firstAuthSocket.addEventListener('message', 
        function(event){
          const objectFromMessage = JSON.parse(event.data);
          abortAsync.abort();
          if(!objectFromMessage.success){
            console.log(
              "testWebSocketRouterToMCU(): testCompetingForStaleAuths(): Failed: First socket authentication not successful."
            );
            connectionOK = false;
          }
        }, 
        {signal: abortAsync.signal}
      );

      try{
        const MS_AFTER_FIRST_CONNECTION = 5000;
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
          abortAsync.abort();
          if(objectFromMessage.success){
            console.log(
              "testWebSocketRouterToMCU(): testCompetingForStaleAuths(): Failed: Unexpected second socket auth success."
            );
            hasError = true;
        }
        }, 
        {signal: abortAsync.signal}
      ); 
      try{
        const MS_FOR_SECOND_CONNECTION_AUTH = 5000;
        await setTimeout(MS_FOR_SECOND_CONNECTION_AUTH, 'result', {signal: abortAsync.signal});
        hasError = true;
        console.log(
          "testWebSocketRouterToMCU(): testCompetingForStaleAuths(): Failed: Second auth attempt took too much time."
        );
      }catch(err){
      }
      
      return !hasError;
    }
    async function autenticateSecondSocketSecondTime(secondAuthSocket){
      const abortAsync = new AbortController();
      let success = false;
      
      secondAuthSocket.onmessage = function(event){
        abortAsync.abort();
        const objectFromMessage = JSON.parse(event.data);
        success = objectFromMessage.success;
      };

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
  
  testConnect();
  testAuth();
  await testPatchRequiresAuthentication();
  await testAuthenticatedPatch();
  await testCompetingForStaleAuths();
}

testWebSocketRouterToMCU();
