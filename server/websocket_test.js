import {HTTP_STATUS_FOR_OK} from '../constraints.js'

function testWebSocketRouterToMCU(){
  const ENDPOINT_URL = "http://localhost:5001/toDevice";
  const MAX_TIMEOUT_MS = 1000;

  function testConnect(){
    const socket = new WebSocket(ENDPOINT_URL);
    const timerID = setTimeout(function (){
      socket.close();
      console.log("testWebSocketRouterToMCU(): testConnect(): Failed: connection was not made in time.");
    }, MAX_TIMEOUT_MS); 
    
    socket.addEventListener('open', function(){
      clearTimeout(timerID);
      socket.close();  
      console.log("testWebSocketRouterToMCU(): testConnect(): OK");      
    });
    socket.addEventListener('error', function (errorEvent){
      clearTimeout(timerID);
      socket.close();
      console.log("testWebSocketRouterToMCU(): testConnect()", "\n\tFailed: ", errorEvent);
    });
  }
  
  function testAuth(){    
    const socket = new WebSocket(ENDPOINT_URL);
    const timerID = setTimeout(function (){
      socket.close();
      console.log("testWebSocketRouterToMCU(): testAuth(): Failed: connection was not made in time.");
    }, MAX_TIMEOUT_MS); 

    try{
      socket.addEventListener('open', function (){
        socket.send(JSON.stringify({deviceID: 6, deviceSecret: "cookies"}));
      });
      socket.addEventListener('error', function (errorEvent){
        clearTimeout(timerID);
        socket.close();
        console.log("testWebSocketRouterToMCU(): testAuth()", "\n\tFailed: ", errorEvent);
      });  

      socket.addEventListener('message', function(event){
        if((typeof event.data) !== "string"){
          clearTimeout(timerID);
          socket.close();
          console.log("testWebSocketRouterToMCU(): testAuth(): Failed: Received event.data should be string type.");
          return;
        }
        
        const objectFromMessage = JSON.parse(event.data);
        clearTimeout(timerID);
        socket.close();
        console.log(objectFromMessage.success ? 
          "testWebSocketRouterToMCU(): testAuth(): OK" 
          : "testWebSocketRouterToMCU(): testAuth(): Failed: .success is not true.");
      });

    }catch(err){
      clearTimeout(timerID);
      socket.close();
      console.log("testWebSocketRouterToMCU(): testAuth()", "\n\tFailed: ", String(err));
    }
  }
  
  testConnect();
  testAuth();
}

testWebSocketRouterToMCU();
