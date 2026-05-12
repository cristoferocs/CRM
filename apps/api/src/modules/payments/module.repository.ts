import type { PaymentsHealthResponse } from "./module.schema.js";

export class PaymentsRepository {
    async health(): Promise<PaymentsHealthResponse> {
        return {
            module: "payments",
            status: "ok"
        };
    }
}