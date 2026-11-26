import {testAuth, testIncorrectAuth, testCompetingForStaleAuths} from './auth.js';
import {
  HTTP_STATUS_FOR_OK,
  MAX_WEBSOCKET_FROM_SERVER_BYTES,
  WEBSOCKET_MS_BEFORE_STALE,
} from '../../../../constraints.js';
import {setTimeout} from 'node:timers/promises';

async function testWebSocketRouterToMCU(webSocketURL){
  const MAX_TIMEOUT_MS = 5000;

  async function testConnect(webSocketURL){
    const asyncTimerAbort = new AbortController();
    const socket = new WebSocket(webSocketURL);

    socket.addEventListener('open', function(){
      asyncTimerAbort.abort();
      console.log("testWebSocketRouterToMCU(): testConnect(): OK");      
    }, {signal: asyncTimerAbort.signal});
    socket.addEventListener('error', function (errorEvent){
      asyncTimerAbort.abort();
      console.log("testWebSocketRouterToMCU(): testConnect()", "\n\tFailed: ", errorEvent);
    }, {signal: asyncTimerAbort.signal});   
    try{
      await setTimeout(MAX_TIMEOUT_MS, 'result', {signal: asyncTimerAbort.signal});
      console.log("testWebSocketRouterToMCU(): testConnect(): Failed: connection was not made in time.");      
    }catch(err){}
    socket.close();
  }

  async function testInvalidMessageType(webSocketURL, testName, payload){
    const socket = new WebSocket(webSocketURL);
    const abortAsync = new AbortController();
    let testPassed = false;

    socket.addEventListener('open', () => socket.send(
      typeof payload === 'string' ? payload : JSON.stringify(payload)
    ), {signal: abortAsync.signal});
    socket.addEventListener('message', event => {
      try{
        testPassed = typeof event.data === 'string'
          && JSON.parse(event.data).__messageType === 'error';
      }catch{}
      abortAsync.abort();
      socket.close();
    }, {signal: abortAsync.signal});
    socket.addEventListener('error', () => {
      abortAsync.abort();
      socket.close();
    }, {signal: abortAsync.signal});

    try{
      await setTimeout(MAX_TIMEOUT_MS, 'result', {signal: abortAsync.signal});
    }catch{}
    console.log(testPassed
      ? `testWebSocketRouterToMCU(): ${testName}(): OK`
      : `testWebSocketRouterToMCU(): ${testName}(): Failed: expected an error response.`
    );
    return testPassed;
  }

  async function testPatchRequiresAuthentication(webSocketURL){
    const socket = new WebSocket(webSocketURL);
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
      testPassed = objectFromMessage.__messageType === "patcherr";
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

  async function testAuthenticatedPatch(webSocketURL){
    const socket = new WebSocket(webSocketURL);
    const abortAsync = new AbortController();
    let patchSent = false;
    let socketError = false;

    socket.addEventListener('open', function(){
      socket.send(JSON.stringify({
        __messageType: "auth",
        deviceID: 1,
        deviceSecret: "I!7T#'q3%uB]yP4U03llRw.1"
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
      socketError = socketError || objectFromMessage.__messageType === "patcherr";
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
  
  await testConnect(webSocketURL);
  await testInvalidMessageType(webSocketURL, 'testEmptyMessage', "");
  await testInvalidMessageType(webSocketURL, 'testAuthWithoutMessageType', {
    deviceID: 1,
    deviceSecret: "I!7T#'q3%uB]yP4U03llRw.1",
  });
  const oversizedPayload = {__messageType: 'ping', data: ''};
  const oversizedBase = JSON.stringify(oversizedPayload);
  oversizedPayload.data = 'x'.repeat(MAX_WEBSOCKET_FROM_SERVER_BYTES - Buffer.byteLength(oversizedBase) + 1);
  const oversizedJSON = JSON.stringify(oversizedPayload);
  await testInvalidMessageType(webSocketURL, 'testOversizedJSON', oversizedJSON);
  await testIncorrectAuth(webSocketURL);
  
  await testAuth(webSocketURL);
  console.log(`testWebSocketRouterToMCU(): waiting ${WEBSOCKET_MS_BEFORE_STALE}ms for device 1 Auth to become stale...`);
  await setTimeout(WEBSOCKET_MS_BEFORE_STALE);
  await testCompetingForStaleAuths(webSocketURL);

  await testPatchRequiresAuthentication(webSocketURL);
  await testAuthenticatedPatch(webSocketURL);
}

async function getWebSocketURL(){
  const response = await fetch("http://localhost:5000/apiv1/device/webSocketURL");
  if(!response.ok)
    throw new Error(`Device service returned HTTP ${response.status} while resolving websocket URL.`);

  const webSocketURL = await response.json();
  return `http://${webSocketURL.domain}:${webSocketURL.port}${webSocketURL.path}`;
}

getWebSocketURL()
  .then((webSocketURL) => testWebSocketRouterToMCU(webSocketURL))
  .catch((error) => console.error("Unable to run websocket tests:", error));
