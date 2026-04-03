"use strict";

const fp = require("fastify-plugin");

module.exports = fp(async function (fastify, opts) {
  const { GROUPS_SERVICE_URL, API_PREFIX } = process.env;

  if (!GROUPS_SERVICE_URL) {
    throw new Error("GROUPS_SERVICE_URL is required in .env");
  }

  const prefix = `/${API_PREFIX || "api"}/groups`;

  fastify.register(require("@fastify/http-proxy"), {
    upstream: GROUPS_SERVICE_URL,
    prefix: prefix,
    rewritePrefix: "/groups",
    http2: false,
    acceptExposedHeaders: ["Set-Cookie", "Authorization"],
    disableCache: true,
    replyOptions: {
      rewriteRequestHeaders: (originalReq, headers) => {
        const cookies = originalReq.headers.cookie || "";
        const authHeader = originalReq.headers.authorization || "";

        return {
          ...headers,
          cookie: cookies,
          authorization: authHeader,
        };
      },
    },
  });
});
