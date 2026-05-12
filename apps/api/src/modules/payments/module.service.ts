import { PaymentsRepository } from "./module.repository.js";
import type { PaymentsHealthResponse } from "./module.schema.js";

export class PaymentsService {
    constructor(private readonly paymentsRepository = new PaymentsRepository()) { }

    health(): Promise<PaymentsHealthResponse> {
        return this.paymentsRepository.health();
    }
}