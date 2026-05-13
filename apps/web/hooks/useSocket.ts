"use client";

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useSocketStore } from "@/stores/socket.store";
import { useAuthStore } from "@/stores/auth.store";

const WS_URL =
    process.env.NEXT_PUBLIC_WS_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3333";

export function useSocket() {
    const { socket, connected, setSocket, setConnected, setConnecting, disconnect } =
        useSocketStore();
    const { token } = useAuthStore();
    const mountedRef = useRef(false);

    useEffect(() => {
        if (!token || mountedRef.current) return;
        mountedRef.current = true;

        setConnecting(true);

        const newSocket = io(WS_URL, {
            auth: { token },
            transports: ["websocket"],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1_000,
        });

        newSocket.on("connect", () => {
            setConnected(true);
            setConnecting(false);
        });

        newSocket.on("disconnect", () => {
            setConnected(false);
        });

        newSocket.on("connect_error", () => {
            setConnecting(false);
        });

        setSocket(newSocket);

        return () => {
            mountedRef.current = false;
            disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    return { socket, connected };
}
