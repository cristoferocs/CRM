import "dotenv/config";
import { initSentry, sentry } from "./lib/sentry.js";
initSentry();
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import { serializerCompiler, validatorCompiler } from "@fastify/type-provider-zod";
import Fastify from "fastify";
import type { HealthResponse } from "@crm-base/shared";
import { authRoutes } from "./modules/auth/module.routes.js";
import { automationsRoutes } from "./modules/automations/module.routes.js";
import { whiteLabelPublicRoutes } from "./modules/organizations/white-label.routes.js";
import { contactsRoutes } from "./modules/contacts/module.routes.js";
import { departmentsRoutes } from "./modules/departments/module.routes.js";
import { inboxRoutes } from "./modules/inbox/module.routes.js";
import { marketingRoutes } from "./modules/marketing/module.routes.js";
import { organizationsRoutes } from "./modules/organizations/module.routes.js";
import { paymentsRoutes } from "./modules/payments/module.routes.js";
import { pipelineRoutes } from "./modules/pipeline/module.routes.js";
import { reportsRoutes } from "./modules/reports/module.routes.js";
import { usersRoutes } from "./modules/users/module.routes.js";
import { knowledgeRoutes } from "./modules/ai/knowledge/knowledge.routes.js";
import { agentRoutes } from "./modules/ai/agents/agent.routes.js";
import { insightsRoutes } from "./modules/ai/insights/insights.routes.js";
import { integrationsRoutes } from "./modules/integrations/integrations.routes.js";
import { channelIntegrationsRoutes } from "./modules/integrations/channel-integrations.routes.js";
import { uploadsRoutes } from "./modules/uploads/uploads.routes.js";
import { collaborationRoutes } from "./modules/collaboration/collaboration.routes.js";
import { documentsRoutes } from "./modules/documents/documents.routes.js";
import { gamificationRoutes } from "./modules/gamification/gamification.routes.js";
import { authPlugin } from "./plugins/auth.plugin.js";
import { corsPlugin } from "./plugins/cors.plugin.js";
import { rateLimitPlugin } from "./plugins/rate-limit.plugin.js";
import { swaggerPlugin } from "./plugins/swagger.plugin.js";
import { closeQueues } from "./queue/queues.js";
import { createAutomationWorker } from "./queue/workers/automation.worker.js";
import {
  createAutomationSchedulerWorker,
  ensureAutomationScheduler,
} from "./queue/workers/automation-scheduler.worker.js";
import { createInboxWorker } from "./queue/workers/inbox.worker.js";
import { createKnowledgeWorker } from "./queue/workers/knowledge.worker.js";
import { createFlowLearningWorker } from "./modules/ai/agents/learning/learning.worker.js";
import { createAgentProactiveWorker } from "./queue/workers/agent-proactive.worker.js";
import {
  createSessionCleanupWorker,
  ensureSessionCleanupSchedule,
} from "./queue/workers/session-cleanup.worker.js";
import { initializeSocket } from "./websocket/socket.js";

import { randomUUID } from "node:crypto";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
  // Generate a stable request ID for every request and trust an upstream
  // x-request-id when present (so traces survive the front -> API -> worker hop).
  genReqId: (req) => {
    const existing =
      (req.headers["x-request-id"] as string | undefined) ??
      (req.headers["x-correlation-id"] as string | undefined);
    return existing && existing.length <= 128 ? existing : randomUUID();
  },
  requestIdHeader: "x-request-id",
  requestIdLogLabel: "reqId",
  disableRequestLogging: false,
});

// Echo the request id back so the front-end can surface it in error toasts /
// support requests, and so anything downstream can correlate.
app.addHook("onSend", async (request, reply) => {
  reply.header("x-request-id", request.id);
});

// Bind reqId / authenticated user to AsyncLocalStorage so logs, queue
// helpers, and provider wrappers can read it without explicit threading.
import { requestContext } from "./lib/request-context.js";
app.addHook("onRequest", (request, _reply, done) => {
  requestContext.run(
    { reqId: request.id, orgId: request.user?.orgId, userId: request.user?.id, role: request.user?.role },
    () => done(),
  );
});
// JWT hooks populate request.user after onRequest, so refresh the store
// once authentication has run and the user is known.
app.addHook("preHandler", async (request) => {
  const ctx = requestContext.getStore();
  if (ctx && request.user) {
    ctx.orgId = request.user.orgId;
    ctx.userId = request.user.id;
    ctx.role = request.user.role;
  }
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Send 5xx exceptions and unexpected throws to Sentry with full request context.
// 4xx / validation errors are *not* reported — they are by definition expected.
app.setErrorHandler((error: import("fastify").FastifyError, request, reply) => {
  const statusCode = error.statusCode ?? 500;
  if (statusCode >= 500) {
    sentry.withScope((scope) => {
      scope.setTag("reqId", request.id);
      scope.setTag("route", request.routeOptions?.url ?? request.url);
      scope.setTag("method", request.method);
      if (request.user?.orgId) scope.setTag("orgId", request.user.orgId);
      if (request.user?.id) scope.setUser({ id: request.user.id });
      sentry.captureException(error);
    });
    request.log.error({ err: error, reqId: request.id }, "unhandled error");
  }
  reply.code(statusCode).send({
    statusCode,
    error: error.name ?? "Error",
    message: statusCode >= 500 ? "Internal Server Error" : error.message,
    reqId: request.id,
  });
});

await app.register(corsPlugin);
await app.register(helmet, {
  // The API serves JSON to first-party clients only and the Swagger UI we ship
  // from `/docs`. Deny everything else by default and explicitly allow inline
  // assets the Swagger UI requires.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Swagger UI
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  strictTransportSecurity:
    process.env.NODE_ENV === "production"
      ? { maxAge: 63072000, includeSubDomains: true, preload: true }
      : false,
});
await app.register(multipart, {
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_SIZE_BYTES ?? 10 * 1024 * 1024)
  }
});
await app.register(rateLimitPlugin);
await app.register(authPlugin);
await app.register(swaggerPlugin);

app.get<{ Reply: HealthResponse }>("/health", async () => ({
  status: "ok",
  service: "crm-base-api",
  timestamp: new Date().toISOString()
}));

await app.register(authRoutes, { prefix: "/auth" });
await app.register(whiteLabelPublicRoutes, { prefix: "/public" });
await app.register(organizationsRoutes, { prefix: "/organizations" });
await app.register(usersRoutes, { prefix: "/users" });
await app.register(departmentsRoutes, { prefix: "/departments" });
await app.register(contactsRoutes, { prefix: "/contacts" });
await app.register(pipelineRoutes, { prefix: "/pipeline" });
await app.register(inboxRoutes, { prefix: "/inbox" });
await app.register(paymentsRoutes, { prefix: "/payments" });
await app.register(marketingRoutes, { prefix: "/marketing" });
await app.register(automationsRoutes, { prefix: "/automations" });
await app.register(reportsRoutes, { prefix: "/reports" });
await app.register(knowledgeRoutes, { prefix: "/knowledge-bases" });
await app.register(agentRoutes, { prefix: "/agents" });
await app.register(insightsRoutes, { prefix: "/insights" });
await app.register(integrationsRoutes, { prefix: "/integrations" });
await app.register(channelIntegrationsRoutes, { prefix: "/integrations" });
await app.register(uploadsRoutes, { prefix: "/uploads" });
await app.register(collaborationRoutes, { prefix: "/collaboration" });
await app.register(documentsRoutes, { prefix: "/documents" });
await app.register(gamificationRoutes, { prefix: "/gamification" });

const socket = initializeSocket(app.server, app);
const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "0.0.0.0";

// Start background workers
const automationWorker = createAutomationWorker();
const automationSchedulerWorker = createAutomationSchedulerWorker();
await ensureAutomationScheduler();
const inboxWorker = createInboxWorker();
const knowledgeWorker = createKnowledgeWorker();
const learningWorker = createFlowLearningWorker();
const agentProactiveWorker = createAgentProactiveWorker();
const sessionCleanupWorker = createSessionCleanupWorker();
await ensureSessionCleanupSchedule();

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "shutting down api");

  try {
    socket.close();
    await automationWorker.close();
    await automationSchedulerWorker.close();
    await inboxWorker.close();
    await knowledgeWorker.close();
    await learningWorker.close();
    await agentProactiveWorker.close();
    await sessionCleanupWorker.close();
    await closeQueues();
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ error }, "failed to shutdown cleanly");
    process.exit(1);
  }
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}