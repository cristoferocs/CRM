import type { FastifyInstance } from "fastify";
import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getRedis } from "../lib/redis.js";

let io: SocketServer | null = null;

/**
 * Returns the Socket.io server instance.
 * Returns null if called before `initializeSocket`.
 */
export function getIO(): SocketServer | null {
    return io;
}

export function initializeSocket(server: HttpServer, fastify: FastifyInstance) {
    io = new SocketServer(server, {
        cors: {
            origin: process.env.APP_URL ?? true,
            credentials: true,
        },
    });

    // Redis adapter — required for horizontal scaling so room broadcasts
    // are propagated across all API instances.
    try {
        const pubClient = getRedis().duplicate();
        const subClient = getRedis().duplicate();
        io.adapter(createAdapter(pubClient, subClient));
        fastify.log.info("socket.io redis adapter enabled");
    } catch (error) {
        fastify.log.error({ error }, "failed to enable socket.io redis adapter");
    }

    io.on("connection", (socket) => {
        fastify.log.info({ socketId: socket.id }, "websocket connected");

        // -----------------------------------------------------------------
        // Room join helpers
        // -----------------------------------------------------------------

        socket.on("join:org", (orgId: string) => {
            socket.join(`org:${orgId}`);
            fastify.log.debug({ socketId: socket.id, orgId }, "socket joined org room");
        });

        socket.on("join:conversation", (conversationId: string) => {
            socket.join(`conversation:${conversationId}`);
            fastify.log.debug(
                { socketId: socket.id, conversationId },
                "socket joined conversation room",
            );
        });

        socket.on("leave:conversation", (conversationId: string) => {
            socket.leave(`conversation:${conversationId}`);
        });

        // -----------------------------------------------------------------
        // Typing indicator — forwarded to room peers
        // -----------------------------------------------------------------

        socket.on(
            "user:typing",
            (data: { conversationId: string; userId: string; isTyping: boolean }) => {
                socket
                    .to(`conversation:${data.conversationId}`)
                    .emit("user:typing", data);
            },
        );

        // -----------------------------------------------------------------
        // Disconnect
        // -----------------------------------------------------------------

        socket.on("disconnect", (reason) => {
            fastify.log.info({ socketId: socket.id, reason }, "websocket disconnected");
        });
    });

    return io;
}
