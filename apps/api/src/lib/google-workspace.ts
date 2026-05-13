/**
 * Google Workspace integration client.
 * Handles OAuth2 token lifecycle + Calendar, Drive, and Gmail API calls.
 * Tokens are stored encrypted in the OrgIntegration table.
 */
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "./prisma.js";
import { encrypt, decrypt } from "./crypto.js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3333/integrations/google/callback";
const PROVIDER = "google_workspace";

const SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
];

export interface TimeSlot {
    start: string; // ISO 8601
    end: string;
}

export interface CalendarEvent {
    id: string;
    summary: string;
    start: string;
    end: string;
    link?: string;
    attendees: string[];
}

export interface CreateEventData {
    title: string;
    description?: string;
    startDatetime: string; // ISO 8601
    durationMinutes: number;
    attendeeEmail?: string;
    timezone?: string;
}

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
    thumbnailLink?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOAuth2Client(): OAuth2Client {
    return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

// ---------------------------------------------------------------------------
// Main client class
// ---------------------------------------------------------------------------

export class GoogleWorkspaceClient {
    private readonly orgId: string;
    private oauth2: OAuth2Client;

    constructor(orgId: string) {
        this.orgId = orgId;
        this.oauth2 = makeOAuth2Client();
    }

    // -------------------------------------------------------------------------
    // Auth
    // -------------------------------------------------------------------------

    getAuthUrl(state?: string): string {
        return this.oauth2.generateAuthUrl({
            access_type: "offline",
            prompt: "consent",
            scope: SCOPES,
            state: state ?? this.orgId,
        });
    }

    async exchangeCode(code: string): Promise<{ email: string }> {
        const { tokens } = await this.oauth2.getToken(code);
        this.oauth2.setCredentials(tokens);

        // Get user email
        const oauth2Api = google.oauth2({ version: "v2", auth: this.oauth2 });
        const userInfo = await oauth2Api.userinfo.get();
        const email = userInfo.data.email ?? "";

        await prisma.orgIntegration.upsert({
            where: { orgId_provider: { orgId: this.orgId, provider: PROVIDER } },
            update: {
                accessToken: encrypt(tokens.access_token ?? ""),
                refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
                expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
                scopes: SCOPES,
                metadata: { email },
                isActive: true,
            },
            create: {
                orgId: this.orgId,
                provider: PROVIDER,
                accessToken: encrypt(tokens.access_token ?? ""),
                refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
                expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
                scopes: SCOPES,
                metadata: { email },
            },
        });

        return { email };
    }

    async refreshTokenIfNeeded(): Promise<void> {
        const integration = await prisma.orgIntegration.findUnique({
            where: { orgId_provider: { orgId: this.orgId, provider: PROVIDER } },
        });
        if (!integration) throw new Error("Google Workspace não conectado para esta org");

        const expiresAt = integration.expiresAt?.getTime() ?? 0;
        const BUFFER_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry

        const accessToken = decrypt(integration.accessToken);
        const refreshToken = integration.refreshToken ? decrypt(integration.refreshToken) : undefined;

        this.oauth2.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
            expiry_date: integration.expiresAt ? expiresAt : undefined,
        });

        if (Date.now() >= expiresAt - BUFFER_MS && refreshToken) {
            const { credentials } = await this.oauth2.refreshAccessToken();
            this.oauth2.setCredentials(credentials);

            await prisma.orgIntegration.update({
                where: { orgId_provider: { orgId: this.orgId, provider: PROVIDER } },
                data: {
                    accessToken: encrypt(credentials.access_token ?? ""),
                    expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
                },
            });
        }
    }

    async getStatus(): Promise<{ connected: boolean; email?: string; scopes: string[] }> {
        const integration = await prisma.orgIntegration.findUnique({
            where: { orgId_provider: { orgId: this.orgId, provider: PROVIDER } },
        });
        if (!integration || !integration.isActive) {
            return { connected: false, scopes: [] };
        }
        const meta = integration.metadata as Record<string, string>;
        return { connected: true, email: meta.email, scopes: integration.scopes };
    }

    async revoke(): Promise<void> {
        await prisma.orgIntegration.updateMany({
            where: { orgId: this.orgId, provider: PROVIDER },
            data: { isActive: false },
        });
    }

    // -------------------------------------------------------------------------
    // Google Calendar
    // -------------------------------------------------------------------------

    async getAvailableSlots(date: Date, durationMinutes: number): Promise<TimeSlot[]> {
        await this.refreshTokenIfNeeded();
        const calendar = google.calendar({ version: "v3", auth: this.oauth2 });

        const dayStart = new Date(date);
        dayStart.setHours(8, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(18, 0, 0, 0);

        const events = await calendar.events.list({
            calendarId: "primary",
            timeMin: dayStart.toISOString(),
            timeMax: dayEnd.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
        });

        const busy: Array<{ start: Date; end: Date }> =
            (events.data.items ?? [])
                .filter((e) => e.start?.dateTime && e.end?.dateTime)
                .map((e) => ({
                    start: new Date(e.start!.dateTime!),
                    end: new Date(e.end!.dateTime!),
                }));

        const slots: TimeSlot[] = [];
        const slotMs = durationMinutes * 60 * 1000;
        let cursor = dayStart.getTime();

        while (cursor + slotMs <= dayEnd.getTime()) {
            const slotStart = new Date(cursor);
            const slotEnd = new Date(cursor + slotMs);
            const overlap = busy.some(
                (b) => slotStart < b.end && slotEnd > b.start,
            );
            if (!overlap) {
                slots.push({
                    start: slotStart.toISOString(),
                    end: slotEnd.toISOString(),
                });
            }
            cursor += 30 * 60 * 1000; // 30-minute step
        }

        return slots;
    }

    async createEvent(data: CreateEventData): Promise<string> {
        await this.refreshTokenIfNeeded();
        const calendar = google.calendar({ version: "v3", auth: this.oauth2 });

        const startDt = new Date(data.startDatetime);
        const endDt = new Date(startDt.getTime() + data.durationMinutes * 60 * 1000);

        const event = await calendar.events.insert({
            calendarId: "primary",
            requestBody: {
                summary: data.title,
                description: data.description,
                start: {
                    dateTime: startDt.toISOString(),
                    timeZone: data.timezone ?? "America/Sao_Paulo",
                },
                end: {
                    dateTime: endDt.toISOString(),
                    timeZone: data.timezone ?? "America/Sao_Paulo",
                },
                attendees: data.attendeeEmail ? [{ email: data.attendeeEmail }] : [],
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: "email", minutes: 60 },
                        { method: "popup", minutes: 15 },
                    ],
                },
            },
        });

        return event.data.htmlLink ?? event.data.id ?? "";
    }

    async updateEvent(
        eventId: string,
        data: Partial<CreateEventData>,
    ): Promise<void> {
        await this.refreshTokenIfNeeded();
        const calendar = google.calendar({ version: "v3", auth: this.oauth2 });

        const patch: Record<string, unknown> = {};
        if (data.title) patch.summary = data.title;
        if (data.description) patch.description = data.description;
        if (data.startDatetime) {
            const startDt = new Date(data.startDatetime);
            patch.start = { dateTime: startDt.toISOString() };
            if (data.durationMinutes) {
                const endDt = new Date(startDt.getTime() + data.durationMinutes * 60 * 1000);
                patch.end = { dateTime: endDt.toISOString() };
            }
        }

        await calendar.events.patch({ calendarId: "primary", eventId, requestBody: patch });
    }

    async deleteEvent(eventId: string): Promise<void> {
        await this.refreshTokenIfNeeded();
        const calendar = google.calendar({ version: "v3", auth: this.oauth2 });
        await calendar.events.delete({ calendarId: "primary", eventId });
    }

    async listUpcomingEvents(contactEmail: string): Promise<CalendarEvent[]> {
        await this.refreshTokenIfNeeded();
        const calendar = google.calendar({ version: "v3", auth: this.oauth2 });

        const res = await calendar.events.list({
            calendarId: "primary",
            timeMin: new Date().toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: "startTime",
            q: contactEmail,
        });

        return (res.data.items ?? []).map((e) => ({
            id: e.id ?? "",
            summary: e.summary ?? "",
            start: e.start?.dateTime ?? e.start?.date ?? "",
            end: e.end?.dateTime ?? e.end?.date ?? "",
            link: e.htmlLink ?? undefined,
            attendees: (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
        }));
    }

    // -------------------------------------------------------------------------
    // Google Drive
    // -------------------------------------------------------------------------

    async searchFiles(query: string): Promise<DriveFile[]> {
        await this.refreshTokenIfNeeded();
        const drive = google.drive({ version: "v3", auth: this.oauth2 });

        const res = await drive.files.list({
            q: `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
            fields: "files(id,name,mimeType,webViewLink,thumbnailLink)",
            pageSize: 10,
        });

        return (res.data.files ?? []).map((f) => ({
            id: f.id ?? "",
            name: f.name ?? "",
            mimeType: f.mimeType ?? "",
            webViewLink: f.webViewLink ?? "",
            thumbnailLink: f.thumbnailLink ?? undefined,
        }));
    }

    async getFileContent(fileId: string): Promise<string> {
        await this.refreshTokenIfNeeded();
        const drive = google.drive({ version: "v3", auth: this.oauth2 });

        // Get file metadata to determine MIME type
        const meta = await drive.files.get({ fileId, fields: "mimeType,name" });
        const mimeType = meta.data.mimeType ?? "";

        if (mimeType === "application/vnd.google-apps.document") {
            // Export Google Doc as plain text
            const res = await drive.files.export(
                { fileId, mimeType: "text/plain" },
                { responseType: "text" },
            );
            return String(res.data);
        }

        if (mimeType === "application/pdf") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pdfParse = (await import("pdf-parse" as any).catch(() => null))?.default ?? null;
            const res = await drive.files.get(
                { fileId, alt: "media" },
                { responseType: "arraybuffer" },
            );
            const buffer = Buffer.from(res.data as ArrayBuffer);
            const parsed = await pdfParse(buffer);
            return parsed.text;
        }

        // Fallback: try text export
        const res = await drive.files.export(
            { fileId, mimeType: "text/plain" },
            { responseType: "text" },
        ).catch(() => ({ data: "" }));
        return String(res.data);
    }

    async indexDriveFolder(
        folderId: string,
        knowledgeBaseId: string,
        orgId: string,
    ): Promise<{ queued: number }> {
        await this.refreshTokenIfNeeded();
        const drive = google.drive({ version: "v3", auth: this.oauth2 });

        const INDEXABLE_MIMES = [
            "application/vnd.google-apps.document",
            "application/pdf",
            "text/plain",
        ];

        const listFilesInFolder = async (id: string): Promise<DriveFile[]> => {
            const res = await drive.files.list({
                q: `'${id}' in parents and trashed = false`,
                fields: "files(id,name,mimeType,webViewLink)",
            });
            const files: DriveFile[] = [];
            for (const f of res.data.files ?? []) {
                if (f.mimeType === "application/vnd.google-apps.folder") {
                    const nested = await listFilesInFolder(f.id!);
                    files.push(...nested);
                } else if (INDEXABLE_MIMES.includes(f.mimeType ?? "")) {
                    files.push({
                        id: f.id ?? "",
                        name: f.name ?? "",
                        mimeType: f.mimeType ?? "",
                        webViewLink: f.webViewLink ?? "",
                    });
                }
            }
            return files;
        };

        const files = await listFilesInFolder(folderId);

        // Dynamically import to avoid circular deps
        const { KnowledgeService } = await import(
            "../modules/ai/knowledge/knowledge.service.js"
        );
        const ks = new KnowledgeService();

        for (const file of files) {
            await ks.addDocument(knowledgeBaseId, {
                title: file.name,
                source: file.id,
                type: "DRIVE",
                metadata: { driveId: file.id, mimeType: file.mimeType, link: file.webViewLink },
            }, orgId);
        }

        return { queued: files.length };
    }
}
