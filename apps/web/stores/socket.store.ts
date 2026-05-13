import { create } from "zustand";
import type { Socket } from "socket.io-client";

interface SocketState {
    socket: Socket | null;
    connected: boolean;
    connecting: boolean;

    setSocket: (socket: Socket) => void;
    setConnected: (connected: boolean) => void;
    setConnecting: (connecting: boolean) => void;
    disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
    socket: null,
    connected: false,
    connecting: false,

    setSocket: (socket) => set({ socket }),
    setConnected: (connected) => set({ connected }),
    setConnecting: (connecting) => set({ connecting }),

    disconnect: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
        }
        set({ socket: null, connected: false, connecting: false });
    },
}));
