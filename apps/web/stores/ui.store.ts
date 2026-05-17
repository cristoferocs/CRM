import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Notification {
    id: string;
    title: string;
    message: string;
    type: "info" | "success" | "warning" | "error";
    read: boolean;
    createdAt: string;
}

interface UIState {
    sidebarOpen: boolean;
    theme: "dark" | "light" | "system";
    adminMode: boolean;
    notifications: Notification[];
    unreadCount: number;

    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
    setTheme: (theme: "dark" | "light" | "system") => void;
    setAdminMode: (on: boolean) => void;
    toggleAdminMode: () => void;
    addNotification: (notif: Omit<Notification, "id" | "read" | "createdAt">) => void;
    markNotificationRead: (id: string) => void;
    markAllRead: () => void;
    clearNotifications: () => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set, get) => ({
            sidebarOpen: true,
            theme: "dark",
            adminMode: false,
            notifications: [],
            unreadCount: 0,

            setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
            toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

            setTheme: (theme) => set({ theme }),

            setAdminMode: (adminMode) => set({ adminMode }),
            toggleAdminMode: () => set((s) => ({ adminMode: !s.adminMode })),

            addNotification: (notif) => {
                const notification: Notification = {
                    ...notif,
                    id: crypto.randomUUID(),
                    read: false,
                    createdAt: new Date().toISOString(),
                };
                set((s) => ({
                    notifications: [notification, ...s.notifications].slice(0, 50),
                    unreadCount: s.unreadCount + 1,
                }));
            },

            markNotificationRead: (id) => {
                set((s) => {
                    const notifications = s.notifications.map((n) =>
                        n.id === id ? { ...n, read: true } : n,
                    );
                    return {
                        notifications,
                        unreadCount: notifications.filter((n) => !n.read).length,
                    };
                });
            },

            markAllRead: () =>
                set((s) => ({
                    notifications: s.notifications.map((n) => ({ ...n, read: true })),
                    unreadCount: 0,
                })),

            clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
        }),
        {
            name: "crm:ui",
            partialize: (state) => ({
                sidebarOpen: state.sidebarOpen,
                theme: state.theme,
                adminMode: state.adminMode,
            }),
        },
    ),
);
