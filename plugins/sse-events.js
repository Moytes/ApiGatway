"use strict";

const fp = require("fastify-plugin");
const http = require("http");

module.exports = fp(async function (fastify, opts) {
  const { USERS_SERVICE_URL, API_PREFIX } = process.env;

  if (!USERS_SERVICE_URL) {
    throw new Error("USERS_SERVICE_URL is required in .env");
  }

  const prefix = `/${API_PREFIX || "api"}/auth/events`;

  fastify.get(prefix, async (req, reply) => {
    // Hijack la respuesta para tener control total
    reply.hijack();
    
    const token = req.query.token;
    const url = token 
      ? `${USERS_SERVICE_URL}/auth/events?token=${token}`
      : `${USERS_SERVICE_URL}/auth/events`;
    
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Cookie': req.headers.cookie || '',
        'Authorization': req.headers.authorization || '',
        'Origin': req.headers.origin || 'http://localhost:4200',
      },
    };

    // Escribir headers inmediatamente
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:4200',
      'Access-Control-Allow-Credentials': 'true',
    });

    const proxyReq = http.request(options, (proxyRes) => {
      proxyRes.pipe(reply.raw);
    });

    proxyReq.on('error', (err) => {
      console.error('[SSE] Proxy error:', err.message);
      reply.raw.end();
    });

    proxyReq.on('close', () => {
      console.log('[SSE] Proxy connection closed');
    });

    reply.raw.on('close', () => {
      console.log('[SSE] Client connection closed');
      proxyReq.destroy();
    });

    proxyReq.end();
  });
});
