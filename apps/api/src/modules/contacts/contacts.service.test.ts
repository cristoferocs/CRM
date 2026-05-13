import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContactsService } from "./module.service.js";
import { ContactsRepository } from "./module.repository.js";

// ---------------------------------------------------------------------------
// Mock the repository so we never touch the database
// ---------------------------------------------------------------------------
vi.mock("./module.repository.js");

const mockRepo = vi.mocked(new ContactsRepository()) as unknown as {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByPhone: ReturnType<typeof vi.fn>;
    findByEmail: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
    createTimelineEvent: ReturnType<typeof vi.fn>;
};

// Captured constructor call returns the same mock object
vi.mocked(ContactsRepository).mockImplementation(() => mockRepo as unknown as ContactsRepository);

const ORG_A = "org-a";
const ORG_B = "org-b";

type ContactFixture = ReturnType<typeof _makeContactBase>;
function _makeContactBase() {
    return {
        id: "contact-1",
        name: "Test User",
        email: "test@example.com",
        phone: "+5511999990001",
        document: null,
        avatar: null,
        type: "LEAD",
        source: "MANUAL",
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmContent: null,
        utmTerm: null,
        adId: null,
        adsetId: null,
        campaignId: null,
        pixelSessionId: null,
        tags: [] as string[],
        customFields: {} as Record<string, unknown>,
        orgId: ORG_A,
        companyId: null,
        branchId: null,
        isActive: true,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
    };
}
const makeContact = (overrides: Partial<ContactFixture> = {}): ContactFixture => ({
    ..._makeContactBase(),
    ...overrides,
});

// ---------------------------------------------------------------------------

describe("ContactsService", () => {
    let service: ContactsService;

    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock implementations
        mockRepo.list = vi.fn().mockResolvedValue({ data: [], total: 0 });
        mockRepo.findById = vi.fn().mockResolvedValue(null);
        mockRepo.findByPhone = vi.fn().mockResolvedValue(null);
        mockRepo.findByEmail = vi.fn().mockResolvedValue(null);
        mockRepo.create = vi.fn().mockImplementation((data) => Promise.resolve(makeContact(data)));
        mockRepo.update = vi.fn().mockImplementation((_id, _orgId, data) =>
            Promise.resolve(makeContact(data)),
        );
        mockRepo.softDelete = vi.fn().mockResolvedValue(undefined);
        mockRepo.createTimelineEvent = vi.fn().mockResolvedValue(undefined);

        service = new ContactsService();
    });

    // -------------------------------------------------------------------------
    // create
    // -------------------------------------------------------------------------

    describe("create", () => {
        it("creates a contact with valid data", async () => {
            mockRepo.findByPhone.mockResolvedValue(null);
            mockRepo.findByEmail.mockResolvedValue(null);

            const input = {
                name: "Ana Rodrigues",
                phone: "+5511999990001",
                email: "ana@test.com",
                type: "LEAD" as const,
                source: "WHATSAPP" as const,
                tags: [],
                customFields: {},
            };

            const contact = await service.create(input, ORG_A);

            expect(mockRepo.create).toHaveBeenCalledOnce();
            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: "Ana Rodrigues", orgId: ORG_A }),
            );
            expect(contact.name).toBe("Ana Rodrigues");
        });

        it("throws 409 when phone is already taken", async () => {
            mockRepo.findByPhone.mockResolvedValue(makeContact());

            await expect(
                service.create(
                    { name: "Dup", phone: "+5511999990001", type: "LEAD", source: "MANUAL", tags: [], customFields: {} },
                    ORG_A,
                ),
            ).rejects.toMatchObject({ statusCode: 409 });

            expect(mockRepo.create).not.toHaveBeenCalled();
        });

        it("throws 409 when email is already taken", async () => {
            mockRepo.findByPhone.mockResolvedValue(null);
            mockRepo.findByEmail.mockResolvedValue(makeContact({ email: "dup@test.com" }));

            await expect(
                service.create(
                    { name: "Dup", email: "dup@test.com", type: "LEAD", source: "MANUAL", tags: [], customFields: {} },
                    ORG_A,
                ),
            ).rejects.toMatchObject({ statusCode: 409 });
        });
    });

    // -------------------------------------------------------------------------
    // findOrCreateByPhone — deduplication
    // -------------------------------------------------------------------------

    describe("findOrCreateByPhone", () => {
        it("returns existing contact without creating a new one", async () => {
            const existing = makeContact();
            mockRepo.findByPhone.mockResolvedValue(existing);

            const result = await service.findOrCreateByPhone("+5511999990001", ORG_A);

            expect(result.created).toBe(false);
            expect(result.contact.id).toBe(existing.id);
            expect(mockRepo.create).not.toHaveBeenCalled();
        });

        it("creates a new contact when none is found by phone", async () => {
            mockRepo.findByPhone.mockResolvedValue(null);
            mockRepo.findByEmail.mockResolvedValue(null);
            mockRepo.create.mockResolvedValue(makeContact({ phone: "+5511999990099" }));

            const result = await service.findOrCreateByPhone("+5511999990099", ORG_A, {
                name: "New User",
            });

            expect(result.created).toBe(true);
            expect(mockRepo.create).toHaveBeenCalledOnce();
        });

        it("maps channel to the correct source on creation", async () => {
            mockRepo.findByPhone.mockResolvedValue(null);
            mockRepo.findByEmail.mockResolvedValue(null);
            mockRepo.create.mockResolvedValue(makeContact());

            await service.findOrCreateByPhone("+5511999990001", ORG_A, {
                channel: "INSTAGRAM",
            });

            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ source: "INSTAGRAM" }),
            );
        });
    });

    // -------------------------------------------------------------------------
    // list — filters
    // -------------------------------------------------------------------------

    describe("list", () => {
        it("returns paginated contacts", async () => {
            const contacts = [makeContact(), makeContact({ id: "contact-2" })];
            mockRepo.list.mockResolvedValue({ data: contacts, total: 2 });

            const result = await service.list(ORG_A, {
                page: 1,
                limit: 20,
            });

            expect(result.total).toBe(2);
            expect(result.data).toHaveLength(2);
            expect(result.totalPages).toBe(1);
        });

        it("passes search filter to repository", async () => {
            mockRepo.list.mockResolvedValue({ data: [], total: 0 });

            await service.list(ORG_A, { search: "Ana", page: 1, limit: 20 });

            expect(mockRepo.list).toHaveBeenCalledWith(
                ORG_A,
                expect.objectContaining({ search: "Ana" }),
            );
        });

        it("passes source filter to repository", async () => {
            mockRepo.list.mockResolvedValue({ data: [], total: 0 });

            await service.list(ORG_A, { source: "WHATSAPP", page: 1, limit: 20 });

            expect(mockRepo.list).toHaveBeenCalledWith(
                ORG_A,
                expect.objectContaining({ source: "WHATSAPP" }),
            );
        });
    });

    // -------------------------------------------------------------------------
    // Org isolation
    // -------------------------------------------------------------------------

    describe("org isolation", () => {
        it("findById from org A is not visible in org B", async () => {
            // Contact belongs to ORG_A — findById scoped to ORG_B returns null
            mockRepo.findById.mockImplementation((id: string, orgId: string) =>
                orgId === ORG_A ? Promise.resolve(makeContact()) : Promise.resolve(null),
            );

            const fromOrgA = await service.findById("contact-1", ORG_A);
            expect(fromOrgA.id).toBe("contact-1");

            await expect(service.findById("contact-1", ORG_B)).rejects.toMatchObject({
                statusCode: 404,
            });
        });

        it("list for org B returns empty when contacts belong to org A", async () => {
            mockRepo.list.mockImplementation((_orgId: string) =>
                Promise.resolve({ data: [], total: 0 }),
            );

            const result = await service.list(ORG_B, { page: 1, limit: 20 });

            expect(result.total).toBe(0);
            expect(mockRepo.list).toHaveBeenCalledWith(ORG_B, expect.anything());
        });
    });
});
