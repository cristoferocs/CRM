/**
 * S05 — Contacts
 * Popula: Contact (30 contatos em 3 grupos)
 * Idempotente: usa findFirst por email+orgId
 * Depende: .seed-ids.json (S01)
 */

import { PrismaClient, ContactType, ContactSource } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_IDS_PATH = path.join(__dirname, ".seed-ids.json");

function readSeedIds(): Record<string, unknown> {
    try {
        return JSON.parse(fs.readFileSync(SEED_IDS_PATH, "utf-8"));
    } catch {
        throw new Error("❌ .seed-ids.json não encontrado. Execute S01 primeiro.");
    }
}

function writeSeedIds(data: Record<string, unknown>): void {
    const existing = readSeedIds();
    fs.writeFileSync(SEED_IDS_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
}

async function upsertContact(opts: {
    key: string;
    name: string;
    email: string;
    phone: string;
    type: ContactType;
    source: ContactSource;
    orgId: string;
    branchId: string;
    tags: string[];
    customFields?: Record<string, unknown>;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    adId?: string;
}): Promise<string> {
    const existing = await prisma.contact.findFirst({
        where: { orgId: opts.orgId, email: opts.email },
        select: { id: true },
    });
    if (existing) return existing.id;

    const c = await prisma.contact.create({
        data: {
            name: opts.name,
            email: opts.email,
            phone: opts.phone,
            type: opts.type,
            source: opts.source,
            orgId: opts.orgId,
            branchId: opts.branchId,
            tags: opts.tags,
            customFields: opts.customFields ?? {},
            utmSource: opts.utmSource,
            utmMedium: opts.utmMedium,
            utmCampaign: opts.utmCampaign,
            adId: opts.adId,
            isActive: true,
        },
        select: { id: true },
    });
    return c.id;
}

async function main() {
    const ids = readSeedIds() as {
        orgId: string;
        branches: { sp: string; rj: string; bh: string };
    };
    const { orgId } = ids;
    const { sp, rj, bh } = ids.branches;

    const contacts: Record<string, string> = {};

    // =========================================================================
    // GRUPO A — 10 leads novos
    // =========================================================================
    contacts.camila = await upsertContact({
        key: "camila", name: "Camila Rodrigues", email: "camila@email.com",
        phone: "(11)99201-3344", type: ContactType.LEAD, source: ContactSource.ADS,
        orgId, branchId: sp, tags: ["novo", "meta-ads"],
        utmSource: "facebook", utmMedium: "cpc", utmCampaign: "campanha-meta-jan-2025",
        adId: "ad_001",
    });

    contacts.felipe = await upsertContact({
        key: "felipe", name: "Felipe Santos", email: "felipe@empresa.com",
        phone: "(21)98302-5511", type: ContactType.LEAD, source: ContactSource.ADS,
        orgId, branchId: rj, tags: ["novo", "meta-ads"],
        utmSource: "facebook", utmMedium: "cpc", utmCampaign: "campanha-meta-jan-2025",
        adId: "ad_002",
    });

    contacts.isabela = await upsertContact({
        key: "isabela", name: "Isabela Martins", email: "isa@startupx.com",
        phone: "(31)97403-7722", type: ContactType.LEAD, source: ContactSource.INSTAGRAM,
        orgId, branchId: bh, tags: ["novo", "instagram"],
        utmSource: "instagram", utmMedium: "organic",
    });

    contacts.gabriel = await upsertContact({
        key: "gabriel", name: "Gabriel Oliveira", email: "gabriel@gol.com",
        phone: "(11)96504-9933", type: ContactType.LEAD, source: ContactSource.ADS,
        orgId, branchId: sp, tags: ["novo", "meta-ads"],
        utmSource: "facebook", utmMedium: "cpc", utmCampaign: "campanha-meta-jan-2025",
        adId: "ad_003",
    });

    contacts.natalia = await upsertContact({
        key: "natalia", name: "Natália Costa", email: "natalia@nc.com",
        phone: "(21)95605-1144", type: ContactType.LEAD, source: ContactSource.INSTAGRAM,
        orgId, branchId: rj, tags: ["novo", "instagram"],
        utmSource: "instagram", utmMedium: "organic",
    });

    contacts.pedro = await upsertContact({
        key: "pedro", name: "Pedro Almeida", email: "pedro@palmeida.com",
        phone: "(31)94706-3355", type: ContactType.LEAD, source: ContactSource.WHATSAPP,
        orgId, branchId: bh, tags: ["novo", "whatsapp"],
    });

    contacts.leticia = await upsertContact({
        key: "leticia", name: "Letícia Ferreira", email: "le@leferreira.com",
        phone: "(11)93807-5566", type: ContactType.LEAD, source: ContactSource.ADS,
        orgId, branchId: sp, tags: ["novo", "meta-ads"],
        utmSource: "facebook", utmMedium: "cpc", utmCampaign: "campanha-meta-jan-2025",
        adId: "ad_004",
    });

    contacts.diego = await upsertContact({
        key: "diego", name: "Diego Lima", email: "diego@dlima.com",
        phone: "(21)92908-7777", type: ContactType.LEAD, source: ContactSource.INSTAGRAM,
        orgId, branchId: rj, tags: ["novo", "instagram"],
        utmSource: "instagram", utmMedium: "organic",
    });

    contacts.mariana = await upsertContact({
        key: "mariana", name: "Mariana Sousa", email: "mari@msousa.com",
        phone: "(31)91009-9988", type: ContactType.LEAD, source: ContactSource.WHATSAPP,
        orgId, branchId: bh, tags: ["novo", "whatsapp"],
    });

    contacts.rafael = await upsertContact({
        key: "rafael", name: "Rafael Carvalho", email: "rafael@rc.com",
        phone: "(11)90100-2299", type: ContactType.LEAD, source: ContactSource.LANDING_PAGE,
        orgId, branchId: sp, tags: ["novo", "google"],
        utmSource: "google", utmMedium: "cpc",
    });

    // =========================================================================
    // GRUPO B — 10 leads qualificados
    // =========================================================================
    contacts.luciana = await upsertContact({
        key: "luciana", name: "Luciana Mendes", email: "lu@lmendes.com",
        phone: "(11)99211-3340", type: ContactType.LEAD, source: ContactSource.ADS,
        orgId, branchId: sp, tags: ["qualificado", "meta-ads"],
        utmSource: "facebook", utmMedium: "cpc", utmCampaign: "campanha-meta-jan-2025",
        customFields: {
            company_size: "5-10", current_tool: "planilha",
            main_pain: "Perco leads por desorganização", decision_maker: true
        },
    });

    contacts.rodrigo = await upsertContact({
        key: "rodrigo", name: "Rodrigo Fonseca", email: "rod@rfonseca.com",
        phone: "(21)98312-5510", type: ContactType.LEAD, source: ContactSource.INSTAGRAM,
        orgId, branchId: rj, tags: ["qualificado", "instagram"],
        utmSource: "instagram", utmMedium: "organic",
        customFields: {
            company_size: "11-30", current_tool: "RD Station",
            main_pain: "Integração ruim com WhatsApp", decision_maker: false
        },
    });

    contacts.beatriz = await upsertContact({
        key: "beatriz", name: "Beatriz Cavalcante", email: "beat@bcav.com",
        phone: "(31)97413-7720", type: ContactType.LEAD, source: ContactSource.ADS,
        orgId, branchId: bh, tags: ["qualificado", "meta-ads", "quente"],
        utmSource: "facebook", utmMedium: "cpc", utmCampaign: "campanha-meta-jan-2025",
        customFields: {
            company_size: "31-100", current_tool: "Pipedrive",
            main_pain: "Falta IA e automação", decision_maker: true
        },
    });

    contacts.andre = await upsertContact({
        key: "andre", name: "André Teixeira", email: "andre@atx.com",
        phone: "(11)96514-9930", type: ContactType.LEAD, source: ContactSource.WHATSAPP,
        orgId, branchId: sp, tags: ["qualificado", "whatsapp"],
        customFields: {
            company_size: "2-4", current_tool: "nenhum",
            main_pain: "Tudo no WhatsApp, caótico", decision_maker: true
        },
    });

    contacts.priscila = await upsertContact({
        key: "priscila", name: "Priscila Barros", email: "pri@pbarros.com",
        phone: "(21)95615-1140", type: ContactType.LEAD, source: ContactSource.INSTAGRAM,
        orgId, branchId: rj, tags: ["qualificado", "instagram"],
        utmSource: "instagram", utmMedium: "organic",
        customFields: {
            company_size: "5-10", current_tool: "planilha",
            main_pain: "Sem visibilidade do funil", decision_maker: true
        },
    });

    contacts.marcos = await upsertContact({
        key: "marcos", name: "Marcos Vieira", email: "mv@mvieira.com",
        phone: "(31)94716-3350", type: ContactType.LEAD, source: ContactSource.ADS,
        orgId, branchId: bh, tags: ["qualificado", "meta-ads", "quente"],
        utmSource: "facebook", utmMedium: "cpc", utmCampaign: "campanha-meta-jan-2025",
        customFields: {
            company_size: "11-30", current_tool: "HubSpot gratuito",
            main_pain: "HubSpot caro para escalar", decision_maker: true
        },
    });

    contacts.tatiana = await upsertContact({
        key: "tatiana", name: "Tatiana Melo", email: "tati@tmelo.com",
        phone: "(11)93817-5560", type: ContactType.LEAD, source: ContactSource.WHATSAPP,
        orgId, branchId: sp, tags: ["qualificado", "whatsapp"],
        customFields: {
            company_size: "5-10", current_tool: "planilha",
            main_pain: "Equipe não segue o processo", decision_maker: false
        },
    });

    contacts.renato = await upsertContact({
        key: "renato", name: "Renato Assis", email: "renato@rassis.com",
        phone: "(21)92918-7770", type: ContactType.LEAD, source: ContactSource.INSTAGRAM,
        orgId, branchId: rj, tags: ["qualificado", "instagram"],
        utmSource: "instagram", utmMedium: "organic",
        customFields: {
            company_size: "2-4", current_tool: "nenhum",
            main_pain: "Preciso organizar antes de crescer", decision_maker: true
        },
    });

    contacts.claudia = await upsertContact({
        key: "claudia", name: "Claudia Ribeiro", email: "cla@cribeiro.com",
        phone: "(31)91019-9980", type: ContactType.LEAD, source: ContactSource.ADS,
        orgId, branchId: bh, tags: ["qualificado", "meta-ads"],
        utmSource: "facebook", utmMedium: "cpc", utmCampaign: "campanha-meta-jan-2025",
        customFields: {
            company_size: "31-100", current_tool: "Salesforce",
            main_pain: "Salesforce complexo demais para o time", decision_maker: false
        },
    });

    contacts.henrique = await upsertContact({
        key: "henrique", name: "Henrique Duarte", email: "hen@hduarte.com",
        phone: "(11)90120-2290", type: ContactType.LEAD, source: ContactSource.WHATSAPP,
        orgId, branchId: sp, tags: ["qualificado", "whatsapp", "quente"],
        customFields: {
            company_size: "11-30", current_tool: "planilha + CRM simples",
            main_pain: "Sem IA e sem WhatsApp integrado", decision_maker: true
        },
    });

    // =========================================================================
    // GRUPO C — 10 clientes ativos
    // =========================================================================
    contacts.clinica = await upsertContact({
        key: "clinica", name: "Clínica Saúde Plena", email: "admin@clinicasp.com",
        phone: "(11)3201-4455", type: ContactType.CUSTOMER, source: ContactSource.EMAIL,
        orgId, branchId: sp, tags: ["cliente", "ativo", "starter"],
        customFields: {
            company_size: "11-30", current_tool: "CRM anterior",
            main_pain: "resolvido", decision_maker: true,
            budget: "aprovado", plan: "starter", contract_start: "2024-11-15"
        },
    });

    contacts.agencia = await upsertContact({
        key: "agencia", name: "Agência Digital Vibe", email: "contato@advibe.com",
        phone: "(21)3302-6677", type: ContactType.CUSTOMER, source: ContactSource.WHATSAPP,
        orgId, branchId: rj, tags: ["cliente", "ativo", "growth"],
        customFields: { company_size: "5-10", plan: "growth", contract_start: "2024-12-01" },
    });

    contacts.tech = await upsertContact({
        key: "tech", name: "Tech Solutions BR", email: "tech@tsbr.com",
        phone: "(11)3403-8899", type: ContactType.CUSTOMER, source: ContactSource.EMAIL,
        orgId, branchId: sp, tags: ["cliente", "ativo", "growth"],
        customFields: { company_size: "31-100", plan: "growth", contract_start: "2024-10-20" },
    });

    contacts.apex = await upsertContact({
        key: "apex", name: "Consultoria Apex", email: "apex@capex.com",
        phone: "(31)3504-0011", type: ContactType.CUSTOMER, source: ContactSource.EMAIL,
        orgId, branchId: bh, tags: ["cliente", "ativo", "starter"],
        customFields: { company_size: "2-4", plan: "starter", contract_start: "2025-01-05" },
    });

    contacts.grupo = await upsertContact({
        key: "grupo", name: "Grupo Expansão RJ", email: "grupo@gerj.com",
        phone: "(21)3605-2233", type: ContactType.CUSTOMER, source: ContactSource.WHATSAPP,
        orgId, branchId: rj, tags: ["cliente", "ativo", "enterprise", "vip"],
        customFields: { company_size: "100+", plan: "enterprise", contract_start: "2024-09-01" },
    });

    contacts.loja = await upsertContact({
        key: "loja", name: "Loja Eletrônicos Max", email: "max@lemax.com",
        phone: "(11)3706-4455", type: ContactType.CUSTOMER, source: ContactSource.WHATSAPP,
        orgId, branchId: sp, tags: ["cliente", "ativo", "growth"],
        customFields: { company_size: "11-30", plan: "growth" },
    });

    contacts.imob = await upsertContact({
        key: "imob", name: "Imobiliária Vista Bela", email: "vista@ivb.com",
        phone: "(31)3807-6677", type: ContactType.CUSTOMER, source: ContactSource.EMAIL,
        orgId, branchId: bh, tags: ["cliente", "ativo", "growth"],
        customFields: { company_size: "11-30", plan: "growth" },
    });

    contacts.studio = await upsertContact({
        key: "studio", name: "Studio Fitness Pro", email: "studio@sfp.com",
        phone: "(11)3908-8899", type: ContactType.CUSTOMER, source: ContactSource.WHATSAPP,
        orgId, branchId: sp, tags: ["cliente", "ativo", "starter"],
        customFields: { company_size: "5-10", plan: "starter" },
    });

    contacts.escola = await upsertContact({
        key: "escola", name: "Escola Coding Kids", email: "kids@eck.com",
        phone: "(21)4009-0011", type: ContactType.CUSTOMER, source: ContactSource.EMAIL,
        orgId, branchId: rj, tags: ["cliente", "ativo", "starter"],
        customFields: { company_size: "5-10", plan: "starter" },
    });

    contacts.dent = await upsertContact({
        key: "dent", name: "Dentistas Associados", email: "da@dassoc.com",
        phone: "(31)4100-2233", type: ContactType.CUSTOMER, source: ContactSource.EMAIL,
        orgId, branchId: bh, tags: ["cliente", "ativo", "growth"],
        customFields: { company_size: "11-30", plan: "growth" },
    });

    // =========================================================================
    // PERSIST IDs
    // =========================================================================
    writeSeedIds({ contacts });

    console.log("✅ S05 — Contacts: 30 contatos (10 leads, 10 qualif, 10 clientes)");
}

main()
    .catch((e) => {
        console.error("❌ S05 failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
