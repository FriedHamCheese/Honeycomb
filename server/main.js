import express from "express";
import cors from "cors";

import http from 'node:http';

const httpServer = http.createServer();
httpServer.on('request', async (request, response) => {
  let urlToServiceEndpoint;
  if(request.url.startsWith("/apiv1/user") || request.url.startsWith("/apiv1/dashboard"))
    urlToServiceEndpoint = "http://localhost:5100" + request.url;  
  
  else if(request.url.startsWith("/apiv1/device"))
    urlToServiceEndpoint = "http://localhost:5200" + request.url;
  
  else{
    response.writeHead(404);
    response.end();
    return;
  }

  try {
    const requestBodyChunks = [];
    let bytesRead = 0;
    for await (const chunk of request) {
      bytesRead += chunk.length;
      if(bytesRead > 1024){
        response.writeHead(413, {'content-type': 'application/json'});
        return response.end(JSON.stringify({error: "Request body exceeds 1KB."}));
      }
      requestBodyChunks.push(chunk);
    }

    const fetchOptions = {
      method: request.method,
      headers: request.headers,
    };
    if(requestBodyChunks.length)
      fetchOptions.body = Buffer.concat(requestBodyChunks);

    const responseFromService = await fetch(urlToServiceEndpoint, fetchOptions);
    const responseHeaders = {};
    responseFromService.headers.forEach((value, key) => {
      if(key !== 'connection' && key !== 'transfer-encoding')
        responseHeaders[key] = value;
    });
    response.writeHead(responseFromService.status, responseHeaders);
    return response.end(Buffer.from(await responseFromService.arrayBuffer()));
  } catch(error) {
    if(response.headersSent)
      return response.destroy(error);
    response.writeHead(502, {'content-type': 'application/json'});
    return response.end(JSON.stringify({error: error.message}));
  }
});

httpServer.listen(5000, async () => {
  console.log(`Honeycomb server running on port ${5000}.`)
})
