import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineService } from "./module.service.js";
import { PipelineRepository } from "./module.repository.js";

// ---------------------------------------------------------------------------
// Mock the repository
// ---------------------------------------------------------------------------
vi.mock("./module.repository.js");

const mockRepo = vi.mocked(new PipelineRepository()) as unknown as {
    listPipelines: ReturnType<typeof vi.fn>;
    findPipelineById: ReturnType<typeof vi.fn>;
    createPipeline: ReturnType<typeof vi.fn>;
    updatePipelineName: ReturnType<typeof vi.fn>;
    updateStages: ReturnType<typeof vi.fn>;
    getKanbanView: ReturnType<typeof vi.fn>;
    listDeals: ReturnType<typeof vi.fn>;
    findDealById: ReturnType<typeof vi.fn>;
    createDeal: ReturnType<typeof vi.fn>;
    updateDeal: ReturnType<typeof vi.fn>;
    moveDeal: ReturnType<typeof vi.fn>;
    deleteDeal: ReturnType<typeof vi.fn>;
    findStageById: ReturnType<typeof vi.fn>;
    createTimelineEvent: ReturnType<typeof vi.fn>;
    createSystemActivity: ReturnType<typeof vi.fn>;
    createActivity: ReturnType<typeof vi.fn>;
    listDealActivities: ReturnType<typeof vi.fn>;
    getForecast: ReturnType<typeof vi.fn>;
    getDealStats: ReturnType<typeof vi.fn>;
    findUser: ReturnType<typeof vi.fn>;
    findUsersInDept: ReturnType<typeof vi.fn>;
};

vi.mocked(PipelineRepository).mockImplementation(
    () => mockRepo as unknown as PipelineRepository,
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = "org-demo";
const USER_ADMIN = "user-admin";
const USER_SELLER_A = "user-seller-a";
const USER_SELLER_B = "user-seller-b";

const makeStage = (overrides: Record<string, unknown> = {}) => ({
    id: "stage-1",
    name: "Novo Lead",
    order: 1,
    color: "#6366f1",
    probability: 10,
    isWon: false,
    isLost: false,
    pipelineId: "pipeline-1",
    ...overrides,
});

const makeDeal = (overrides: Record<string, unknown> = {}) => ({
    id: "deal-1",
    title: "Test Deal",
    value: 1000,
    currency: "BRL",
    probability: 10,
    stageId: "stage-1",
    pipelineId: "pipeline-1",
    contactId: "contact-1",
    ownerId: USER_SELLER_A,
    orgId: ORG,
    branchId: null,
    expectedCloseAt: null,
    closedAt: null,
    closedReason: null,
    customFields: {},
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    stage: makeStage(),
    contact: { id: "contact-1", name: "Test Contact", email: null, phone: null, avatar: null },
    owner: { id: USER_SELLER_A, name: "Seller A", avatar: null, email: "sellera@test.com" },
    ...overrides,
});

// ---------------------------------------------------------------------------

describe("PipelineService", () => {
    let service: PipelineService;

    beforeEach(() => {
        vi.clearAllMocks();

        mockRepo.listPipelines = vi.fn().mockResolvedValue([]);
        mockRepo.findPipelineById = vi.fn().mockResolvedValue(null);
        mockRepo.createPipeline = vi.fn();
        mockRepo.updatePipelineName = vi.fn();
        mockRepo.updateStages = vi.fn();
        mockRepo.getKanbanView = vi.fn();
        mockRepo.listDeals = vi.fn().mockResolvedValue({ data: [], total: 0 });
        mockRepo.findDealById = vi.fn().mockResolvedValue(null);
        mockRepo.createDeal = vi.fn().mockImplementation((data) => Promise.resolve(makeDeal(data)));
        mockRepo.updateDeal = vi.fn().mockImplementation((_id, data) => Promise.resolve(makeDeal(data)));
        mockRepo.moveDeal = vi.fn().mockImplementation((id, stageId) =>
            Promise.resolve(makeDeal({ id, stageId })),
        );
        mockRepo.deleteDeal = vi.fn().mockResolvedValue(undefined);
        mockRepo.findStageById = vi.fn().mockResolvedValue(null);
        mockRepo.createTimelineEvent = vi.fn().mockResolvedValue(undefined);
        mockRepo.createSystemActivity = vi.fn().mockResolvedValue(undefined);
        mockRepo.createActivity = vi.fn();
        mockRepo.listDealActivities = vi.fn().mockResolvedValue([]);
        mockRepo.getForecast = vi.fn();
        mockRepo.getDealStats = vi.fn();
        mockRepo.findUser = vi.fn().mockResolvedValue({ id: USER_SELLER_A, departmentId: null });
        mockRepo.findUsersInDept = vi.fn().mockResolvedValue([]);

        service = new PipelineService();
    });

    // -------------------------------------------------------------------------
    // createDeal
    // -------------------------------------------------------------------------

    describe("createDeal", () => {
        it("creates a deal in the correct stage", async () => {
            const input = {
                title: "My Deal",
                value: 0,
                probability: 0,
                stageId: "stage-1",
                pipelineId: "pipeline-1",
                contactId: "contact-1",
                currency: "BRL",
                customFields: {},
            };

            const deal = await service.createDeal(input, ORG, USER_SELLER_A);

            expect(mockRepo.createDeal).toHaveBeenCalledWith(
                expect.objectContaining({
                    stageId: "stage-1",
                    pipelineId: "pipeline-1",
                    ownerId: USER_SELLER_A,
                    orgId: ORG,
                }),
            );
            expect(deal.stageId).toBe("stage-1");
        });

        it("uses provided ownerId when set in input", async () => {
            const input = {
                title: "Delegated Deal",
                value: 0,
                probability: 0,
                stageId: "stage-1",
                pipelineId: "pipeline-1",
                contactId: "contact-1",
                ownerId: USER_SELLER_B,
                currency: "BRL",
                customFields: {},
            };

            await service.createDeal(input, ORG, USER_SELLER_A);

            expect(mockRepo.createDeal).toHaveBeenCalledWith(
                expect.objectContaining({ ownerId: USER_SELLER_B }),
            );
        });

        it("creates timeline event and system activity after deal creation", async () => {
            const deal = makeDeal();
            mockRepo.createDeal.mockResolvedValue(deal);

            await service.createDeal(
                { title: "New Deal", value: 0, probability: 0, stageId: "stage-1", pipelineId: "pipeline-1", contactId: "contact-1", currency: "BRL", customFields: {} },
                ORG,
                USER_SELLER_A,
            );

            expect(mockRepo.createTimelineEvent).toHaveBeenCalledOnce();
            expect(mockRepo.createSystemActivity).toHaveBeenCalledOnce();
        });
    });

    // -------------------------------------------------------------------------
    // moveDeal
    // -------------------------------------------------------------------------

    describe("moveDeal", () => {
        it("moves a deal between stages", async () => {
            const deal = makeDeal({ ownerId: USER_SELLER_A });
            const targetStage = makeStage({ id: "stage-2", name: "Qualificado" });

            mockRepo.findDealById.mockResolvedValue(deal);
            mockRepo.findStageById.mockResolvedValue(targetStage);
            mockRepo.moveDeal.mockResolvedValue(makeDeal({ stageId: "stage-2" }));

            const result = await service.moveDeal(
                "deal-1",
                { toStageId: "stage-2", movedBy: "HUMAN" },
                ORG,
                USER_SELLER_A,
                "SELLER",
            );

            expect(mockRepo.moveDeal).toHaveBeenCalledWith(
                "deal-1",
                "stage-2",
                ORG,
                expect.any(Object),
            );
            expect(result!.deal!.stageId).toBe("stage-2");
        });

        it("sets closedAt and records timeline event when deal is marked as won", async () => {
            const deal = makeDeal({ ownerId: USER_SELLER_A });
            const wonStage = makeStage({ id: "stage-5", isWon: true, probability: 100 });

            mockRepo.findDealById.mockResolvedValue(deal);
            mockRepo.findStageById.mockResolvedValue(wonStage);
            mockRepo.moveDeal.mockResolvedValue(
                makeDeal({ stageId: "stage-5", closedAt: new Date() }),
            );

            const result = await service.moveDeal(
                "deal-1",
                { toStageId: "stage-5", movedBy: "HUMAN" },
                ORG,
                USER_SELLER_A,
                "SELLER",
            );

            expect(mockRepo.moveDeal).toHaveBeenCalledWith(
                "deal-1",
                "stage-5",
                ORG,
                expect.objectContaining({ isWon: true }),
            );
            expect(result!.deal!.closedAt).toBeDefined();
            expect(mockRepo.createTimelineEvent).toHaveBeenCalledWith(
                expect.objectContaining({ type: "DEAL_WON" }),
            );
        });

        it("requires reason when moving deal to a lost stage", async () => {
            const deal = makeDeal({ ownerId: USER_SELLER_A });
            const lostStage = makeStage({ id: "stage-6", isLost: true, probability: 0 });

            mockRepo.findDealById.mockResolvedValue(deal);
            mockRepo.findStageById.mockResolvedValue(lostStage);

            await expect(
                service.moveDeal("deal-1", { toStageId: "stage-6", movedBy: "HUMAN" }, ORG, USER_SELLER_A, "SELLER"),
            ).rejects.toMatchObject({ statusCode: 422 });
        });

        it("throws 404 when deal does not exist", async () => {
            mockRepo.findDealById.mockResolvedValue(null);

            await expect(
                service.moveDeal("nonexistent", { toStageId: "stage-2", movedBy: "HUMAN" }, ORG, USER_SELLER_A, "SELLER"),
            ).rejects.toMatchObject({ statusCode: 404 });
        });
    });

    // -------------------------------------------------------------------------
    // Access control — seller isolation
    // -------------------------------------------------------------------------

    describe("seller cannot see other seller's deals", () => {
        it("throws 403 when seller B tries to update deal owned by seller A", async () => {
            // Deal is owned by SELLER_A
            const deal = makeDeal({ ownerId: USER_SELLER_A });
            mockRepo.findDealById.mockResolvedValue(deal);
            // SELLER_B has no department
            mockRepo.findUser.mockResolvedValue({ id: USER_SELLER_B, departmentId: null });

            await expect(
                service.updateDeal("deal-1", { title: "Hacked" }, ORG, USER_SELLER_B, "SELLER"),
            ).rejects.toMatchObject({ statusCode: 403 });
        });

        it("admin can update any deal regardless of owner", async () => {
            const deal = makeDeal({ ownerId: USER_SELLER_A });
            mockRepo.findDealById.mockResolvedValue(deal);
            mockRepo.updateDeal.mockResolvedValue(makeDeal({ title: "Updated by Admin" }));

            const result = await service.updateDeal(
                "deal-1",
                { title: "Updated by Admin" },
                ORG,
                USER_ADMIN,
                "ADMIN",
            );

            expect(result!.title).toBe("Updated by Admin");
        });
    });
});
