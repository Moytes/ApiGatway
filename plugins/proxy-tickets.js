"use strict";

const fp = require("fastify-plugin");

// Rutas cacheables con TTL en segundos
const CACHEABLE_PATHS = new Set([
  "/api/tickets",
  "/api/tickets/estados",
  "/api/tickets/prioridades"
]);

const CACHE_TTL = {
  '/api/tickets': 15000,              // 15s
  '/api/tickets/estados': 60000,       // 60s - casi estático
  '/api/tickets/prioridades': 60000    // 60s - casi estático
};

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

    // Si hay cookie pero no hay authHeader, extraer el token de la cookie
    if (!authHeader) {
      authHeader = extractAuthFromCookie(cookies) || "";
    }

    return {
      ...headers,
      cookie: "",
      authorization: authHeader,
      host: new URL(TICKETS_SERVICE_URL).host,
    };
  };

  // Función辅助 para obtener respuesta cacheada
  const getCachedResponse = (urlPath, authHeader, reply) => {
    const ttl = CACHE_TTL[urlPath];
    if (!ttl) return null;

    const cacheKey = `${urlPath}:${authHeader || ''}`;
    const entry = fastify.cache.memoryCache?.get(cacheKey);

    if (entry && Date.now() <= entry.expiresAt) {
      reply
        .code(200)
        .header('Content-Type', 'application/json')
        .header('X-Cache', 'HIT')
        .send(entry.data);
      return true;
    }
    return false;
  };

  // Función para guardar en cache
  const setCachedResponse = (urlPath, authHeader, data, ttl) => {
    const cacheKey = `${urlPath}:${authHeader || ''}`;
    if (fastify.cache?.memoryCache) {
      fastify.cache.memoryCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + ttl
      });
    }
  };

  // Proxy para /api/tickets/estados -> /api/v1/estados (cacheable)
  fastify.register(require("@fastify/http-proxy"), {
    upstream: TICKETS_SERVICE_URL,
    prefix: `/${API_PREFIX || "api"}/tickets/estados`,
    rewritePrefix: "/api/v1/estados",
    http2: false,
    acceptExposedHeaders: ["Set-Cookie", "Authorization"],
    disableCache: true,
    replyOptions: {
      rewriteRequestHeaders: rewriteHeaders,
      onResponse: (request, reply, res) => {
        const urlPath = request.url?.split("?")[0] || "";
        const statusCode = res.statusCode;
        
        if (request.method === "GET" && statusCode === 200 && CACHEABLE_PATHS.has(urlPath)) {
          const chunks = [];
          res.stream.on("data", (chunk) => chunks.push(chunk));
          res.stream.on("end", () => {
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              const ttl = CACHE_TTL[urlPath] || 15000;
              const authHeader = request.headers.authorization || "";
              if (fastify.cache?.memoryCache) {
                const cacheKey = `${urlPath}:${authHeader}`;
                fastify.cache.memoryCache.set(cacheKey, {
                  data: body,
                  expiresAt: Date.now() + ttl
                });
              }
              reply.header("X-Cache", "MISS").code(statusCode).send(body);
            } catch (e) {
              reply.code(statusCode).send("");
            }
          });
          res.stream.on("error", () => reply.code(statusCode).send(""));
          return;
        }
        reply.send(res.stream);
      }
    },
  });

  // Proxy para /api/tickets/prioridades -> /api/v1/prioridades (cacheable)
  fastify.register(require("@fastify/http-proxy"), {
    upstream: TICKETS_SERVICE_URL,
    prefix: `/${API_PREFIX || "api"}/tickets/prioridades`,
    rewritePrefix: "/api/v1/prioridades",
    http2: false,
    acceptExposedHeaders: ["Set-Cookie", "Authorization"],
    disableCache: true,
    replyOptions: {
      rewriteRequestHeaders: rewriteHeaders,
      onResponse: (request, reply, res) => {
        const urlPath = request.url?.split("?")[0] || "";
        const statusCode = res.statusCode;
        
        if (request.method === "GET" && statusCode === 200 && CACHEABLE_PATHS.has(urlPath)) {
          const chunks = [];
          res.stream.on("data", (chunk) => chunks.push(chunk));
          res.stream.on("end", () => {
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              const ttl = CACHE_TTL[urlPath] || 15000;
              const authHeader = request.headers.authorization || "";
              if (fastify.cache?.memoryCache) {
                const cacheKey = `${urlPath}:${authHeader}`;
                fastify.cache.memoryCache.set(cacheKey, {
                  data: body,
                  expiresAt: Date.now() + ttl
                });
              }
              reply.header("X-Cache", "MISS").code(statusCode).send(body);
            } catch (e) {
              reply.code(statusCode).send("");
            }
          });
          res.stream.on("error", () => reply.code(statusCode).send(""));
          return;
        }
        reply.send(res.stream);
      }
    },
  });

  // Proxy principal para /api/tickets/* (tickets CRUD) - con cache
  fastify.register(require("@fastify/http-proxy"), {
    upstream: TICKETS_SERVICE_URL,
    prefix: `/${API_PREFIX || "api"}/tickets`,
    rewritePrefix: "/api/v1/tickets",
    http2: false,
    acceptExposedHeaders: ["Set-Cookie", "Authorization"],
    disableCache: true,
    replyOptions: {
      rewriteRequestHeaders: rewriteHeaders,
      onResponse: (request, reply, res) => {
        const urlPath = request.url?.split("?")[0] || "";
        const statusCode = res.statusCode;

        // Cache para GET
        if (request.method === "GET" && statusCode === 200 && CACHEABLE_PATHS.has(urlPath)) {
          const chunks = [];
          res.stream.on("data", (chunk) => chunks.push(chunk));
          res.stream.on("end", () => {
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              const ttl = CACHE_TTL[urlPath] || 15000;
              const authHeader = request.headers.authorization || "";
              if (fastify.cache?.memoryCache) {
                const cacheKey = `${urlPath}:${authHeader}`;
                fastify.cache.memoryCache.set(cacheKey, {
                  data: body,
                  expiresAt: Date.now() + ttl
                });
              }
              reply.header("X-Cache", "MISS").code(statusCode).send(body);
            } catch (e) {
              reply.code(statusCode).send("");
            }
          });
          res.stream.on("error", () => reply.code(statusCode).send(""));
          return;
        }

        // Invalidar cache para WRITE
        if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method) && statusCode < 400) {
          const urlToInvalidate = "/api/tickets";
          if (fastify.cache?.memoryCache) {
            for (const key of fastify.cache.memoryCache.keys()) {
              if (key.startsWith(urlToInvalidate)) {
                fastify.cache.memoryCache.delete(key);
              }
            }
          }
        }

        reply.send(res.stream);
      }
    },
  });

  // Proxy para /api/comentarios -> /api/v1/comentarios
  fastify.register(require("@fastify/http-proxy"), {
    upstream: TICKETS_SERVICE_URL,
    prefix: `/${API_PREFIX || "api"}/comentarios`,
    rewritePrefix: "/api/v1/comentarios",
    http2: false,
    acceptExposedHeaders: ["Set-Cookie", "Authorization"],
    disableCache: true,
    replyOptions: {
      rewriteRequestHeaders: rewriteHeaders,
    },
  });
});