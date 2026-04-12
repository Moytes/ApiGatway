"use strict";

const fp = require("fastify-plugin");

function extractAuthFromCookie(cookies) {
  if (!cookies) return null;
  const cookieParts = cookies.split(';').map(c => c.trim());
  const authCookie = cookieParts.find(c => c.startsWith('Authentication='));
  if (authCookie) {
    const token = authCookie.substring('Authentication='.length);
    return `Bearer ${decodeURIComponent(token)}`;
  }
  return null;
}

module.exports = fp(async function (fastify, opts) {
  const { TICKETS_SERVICE_URL, API_PREFIX } = process.env;

  if (!TICKETS_SERVICE_URL) {
    throw new Error("TICKETS_SERVICE_URL is required in .env");
  }

  // Helper para reescribir headers con extracción de token de cookie
  const rewriteHeaders = (originalReq, headers) => {
    const cookies = originalReq.headers.cookie || "";
    let authHeader = originalReq.headers.authorization || "";
    
    console.log("[PROXY-TICKETS] Request:", {
      method: originalReq.method,
      path: originalReq.url,
      hasCookie: !!cookies,
      hasAuthHeader: !!authHeader,
    });

    // Si hay cookie pero no hay authHeader, extraer el token de la cookie
    if (!authHeader) {
      authHeader = extractAuthFromCookie(cookies) || "";
      if (authHeader) {
        console.log("[PROXY-TICKETS] Token extracted from cookie:", {
          tokenLength: authHeader.length,
        });
      }
    }

    return {
      ...headers,
      cookie: "",  // No necesitamos la cookie
      authorization: authHeader,
      host: new URL(TICKETS_SERVICE_URL).host,
    };
  };

  // Proxy para /api/tickets/estados -> /api/v1/estados
  fastify.register(require("@fastify/http-proxy"), {
    upstream: TICKETS_SERVICE_URL,
    prefix: `/${API_PREFIX || "api"}/tickets/estados`,
    rewritePrefix: "/api/v1/estados",
    http2: false,
    acceptExposedHeaders: ["Set-Cookie", "Authorization"],
    disableCache: true,
    replyOptions: {
      rewriteRequestHeaders: rewriteHeaders,
    },
  });

  // Proxy para /api/tickets/prioridades -> /api/v1/prioridades
  fastify.register(require("@fastify/http-proxy"), {
    upstream: TICKETS_SERVICE_URL,
    prefix: `/${API_PREFIX || "api"}/tickets/prioridades`,
    rewritePrefix: "/api/v1/prioridades",
    http2: false,
    acceptExposedHeaders: ["Set-Cookie", "Authorization"],
    disableCache: true,
    replyOptions: {
      rewriteRequestHeaders: rewriteHeaders,
    },
  });

  // Proxy principal para /api/tickets/* (tickets CRUD)
  fastify.register(require("@fastify/http-proxy"), {
    upstream: TICKETS_SERVICE_URL,
    prefix: `/${API_PREFIX || "api"}/tickets`,
    rewritePrefix: "/api/v1/tickets",
    http2: false,
    acceptExposedHeaders: ["Set-Cookie", "Authorization"],
    disableCache: true,
    replyOptions: {
      rewriteRequestHeaders: rewriteHeaders,
    },
  });
});