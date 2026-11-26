import http from 'node:http';
process.loadEnvFile(new URL('./.env', import.meta.url));
import {
  GATEWAY_CONNECTIONS_CHECKING_INTERVAL_MS,
  GATEWAY_HEADERS_TIMEOUT_MS,
  GATEWAY_MAX_REQUEST_BODY_BYTES,
  GATEWAY_REQUEST_TIMEOUT_MS,
  HTTP_STATUS_BAD_GATEWAY,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_REQUEST_ENTITY_TOO_LARGE,
  HTTP_STATUS_SERVICE_UNAVAILABLE,
} from '../../constraints.js';
import {
  DEVICE_ROUTE_PREFIX,
  GATEWAY_PORT,
  SERVICE_ENDPOINTS,
  USER_ROUTE_PREFIXES,
} from './config.js';

const JSON_CONTENT_TYPE = {'content-type': 'application/json'};
function sendResponse(response, statusCode, headers, body) {
  try {
    response.writeHead(statusCode, headers);
    return response.end(body);
  } catch (error) {
    if (!response.headersSent && !response.destroyed) {
      try {
        response.writeHead(HTTP_STATUS_INTERNAL_SERVER_ERROR, JSON_CONTENT_TYPE);
        return response.end(JSON.stringify({error: 'Unable to send response.'}));
      } catch { /* The response is no longer usable. */ }
    }
    response.destroy(error);
    console.log(error);
  }
}

function serviceEndpointFor(requestUrl) {
  if (USER_ROUTE_PREFIXES.some(prefix => requestUrl.startsWith(prefix)))
    return SERVICE_ENDPOINTS.user + requestUrl;
  if (requestUrl.startsWith(DEVICE_ROUTE_PREFIX))
    return SERVICE_ENDPOINTS.device + requestUrl;
}

const httpServer = http.createServer({
  connectionsCheckingInterval: GATEWAY_CONNECTIONS_CHECKING_INTERVAL_MS,
  headersTimeout: GATEWAY_HEADERS_TIMEOUT_MS,
  requestTimeout: GATEWAY_REQUEST_TIMEOUT_MS,
});

httpServer.on('request', async (request, response) => {
  response.on('error', error => {
    console.error('Gateway response error:', error);
  });

  const urlToServiceEndpoint = serviceEndpointFor(request.url);
  if (!urlToServiceEndpoint)
    return sendResponse(response, HTTP_STATUS_NOT_FOUND);

  let requestBody;
  try {
    const chunks = [];
    let bytesRead = 0;
    for await (const chunk of request) {
      bytesRead += chunk.length;
      if (bytesRead > GATEWAY_MAX_REQUEST_BODY_BYTES)
        return sendResponse(response, HTTP_STATUS_REQUEST_ENTITY_TOO_LARGE, JSON_CONTENT_TYPE, JSON.stringify({error: 'Request body exceeds 1KB.'}));
      chunks.push(chunk);
    }
    if (chunks.length)
      requestBody = Buffer.concat(chunks);
  } catch (error) {
    // The request stream can reject when the client aborts or the connection fails.
    console.log(error);
    return sendResponse(response, HTTP_STATUS_BAD_REQUEST, JSON_CONTENT_TYPE, JSON.stringify({error: error.message}));
  }

  let responseFromService;
  try {
    responseFromService = await fetch(urlToServiceEndpoint, {
      method: request.method,
      headers: request.headers,
      keepalive: true,
      body: requestBody,
    });
  } catch (error) {
    // fetch() rejects with TypeError for upstream network failures.
    console.log(error);
    return sendResponse(response, HTTP_STATUS_SERVICE_UNAVAILABLE, JSON_CONTENT_TYPE, JSON.stringify({error: error.message}));
  }

  const responseHeaders = {};
  responseFromService.headers.forEach((value, key) => {
    if (key !== 'connection' && key !== 'transfer-encoding')
      responseHeaders[key] = value;
  });

  let responseBody;
  try {
    responseBody = Buffer.from(await responseFromService.arrayBuffer());
  } catch (error) {
    console.log(error);
    return sendResponse(response, HTTP_STATUS_BAD_GATEWAY, JSON_CONTENT_TYPE, JSON.stringify({error: error.message}));
  }

  return sendResponse(response, responseFromService.status, responseHeaders, responseBody);
});

httpServer.listen(GATEWAY_PORT, () => {
  console.log(`Honeycomb API gateway running on port ${GATEWAY_PORT}.`);
});
