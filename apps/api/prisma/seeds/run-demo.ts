/**
 * run-demo.ts — Orquestrador do seed de demonstração
 * Executa S01-S09 em sequência e imprime resumo final.
 * Remove .seed-ids.json ao final.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_IDS_PATH = path.join(__dirname, ".seed-ids.json");

const seeds = [
    "s01-foundation",
    "s02-knowledge",
    "s03-agents",
    "s04-pipelines",
    "s05-contacts",
    "s06-deals",
    "s07-conversations",
    "s08-payments-insights",
    "s09-activities-audit",
    "s10-automations-docs",
];

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║         🚀  NEXUS CRM — DEMO SEED RUNNER                    ║");
console.log("║         Organização: Nexus Soluções Digitais                ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

const start = Date.now();

for (const seed of seeds) {
    console.log(`\n▶  Executando ${seed}...`);
    try {
        execSync(`npx tsx prisma/seeds/${seed}.ts`, { stdio: "inherit" });
    } catch (err) {
        console.error(`\n❌ Falha em ${seed}. Abortando.`);
        process.exit(1);
    }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log("\n");
console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║                    ✅  DEMO SEED CONCLUÍDO                  ║");
console.log("╠══════════════════════════════════════════════════════════════╣");
console.log("║  S01 — Fundação      1 org · 3 filiais · 4 depts · 10 users ║");
console.log("║  S02 — Knowledge     3 KBs · 7 docs · ~22 chunks vetoriais  ║");
console.log("║  S03 — Agentes       3 agentes (Sofia · Max · Luna)         ║");
console.log("║  S04 — Pipelines     3 pipelines · 18 stages                ║");
console.log("║  S05 — Contatos      30 contatos (leads + clientes)         ║");
console.log("║  S06 — Deals         25 deals · ~65 movimentos de stage     ║");
console.log("║  S07 — Conversas     10 convs · ~45 msgs · 2 sessions       ║");
console.log("║  S08 — Pagamentos    12 pgtos · 8 insights · 6 trainings    ║");
console.log("║  S09 — Atividades    20 ativs · 13 timeline · 15 audits     ║");
console.log("║  S10 — Automações    6 automações · 8 documentos           ║");
console.log("╠══════════════════════════════════════════════════════════════╣");
console.log(`║  ⏱  Tempo total: ${elapsed}s`.padEnd(63) + "║");
console.log("╠══════════════════════════════════════════════════════════════╣");
const loginEmail = process.env.DEFAULT_SUPER_ADMIN_EMAIL ?? "cristofer.odair@skynns.com";
const loginPass = process.env.DEFAULT_SUPER_ADMIN_PASSWORD ?? "@dmin$777";
console.log(("║  🔑  Login:  " + loginEmail).padEnd(63) + "║");
console.log(("║  🔐  Senha:  " + loginPass).padEnd(63) + "║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

// Limpar arquivo de IDs temporário
if (fs.existsSync(SEED_IDS_PATH)) {
    fs.unlinkSync(SEED_IDS_PATH);
    console.log("🧹 .seed-ids.json removido.\n");
}
