import type { FastifyInstance } from "fastify";
import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";

export function initializeSocket(server: HttpServer, fastify: FastifyInstance) {
    const io = new SocketServer(server, {
        cors: {
            origin: process.env.APP_URL ?? true,
            credentials: true
        }
    });

    io.on("connection", (socket) => {
        fastify.log.info({ socketId: socket.id }, "websocket connected");

        socket.on("disconnect", (reason) => {
            fastify.log.info({ socketId: socket.id, reason }, "websocket disconnected");
        });
    });

    return io;
}