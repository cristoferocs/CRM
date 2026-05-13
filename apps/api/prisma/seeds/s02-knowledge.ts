/**
 * S02 — Knowledge
 * Popula: KnowledgeBase, KnowledgeDocument, KnowledgeChunk (com embeddings simulados)
 * Idempotente: usa findFirst antes de criar
 * Depende: apps/api/prisma/seeds/.seed-ids.json (gerado pelo S01)
 */

import {
    PrismaClient,
    KnowledgeBaseType,
    KnowledgeDocumentSourceType,
    KnowledgeDocumentStatus,
} from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_IDS_PATH = path.join(__dirname, ".seed-ids.json");

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readSeedIds(): Record<string, unknown> {
    try {
        return JSON.parse(fs.readFileSync(SEED_IDS_PATH, "utf-8"));
    } catch {
        throw new Error("❌ .seed-ids.json não encontrado. Execute S01 primeiro.");
    }
}

function writeSeedIds(data: Record<string, unknown>): void {
    const existing = readSeedIds();
    fs.writeFileSync(
        SEED_IDS_PATH,
        JSON.stringify({ ...existing, ...data }, null, 2)
    );
}

function randomVector(): string {
    const values = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
    return `[${values.join(",")}]`;
}

/** Cria um KnowledgeChunk e insere o embedding via raw SQL */
async function createChunk(opts: {
    content: string;
    chunkIndex: number;
    documentId: string;
    orgId: string;
}): Promise<string> {
    const chunk = await prisma.knowledgeChunk.create({
        data: {
            content: opts.content,
            chunkIndex: opts.chunkIndex,
            documentId: opts.documentId,
            orgId: opts.orgId,
        },
    });

    await prisma.$executeRawUnsafe(
        `UPDATE knowledge_chunks SET "embeddingVector" = $1::vector WHERE id = $2`,
        randomVector(),
        chunk.id
    );

    return chunk.id;
}

/** Cria KB se não existir; retorna id */
async function upsertKB(opts: {
    name: string;
    description: string;
    type: KnowledgeBaseType;
    orgId: string;
}): Promise<string> {
    const existing = await prisma.knowledgeBase.findFirst({
        where: { orgId: opts.orgId, name: opts.name },
        select: { id: true },
    });
    if (existing) return existing.id;

    const kb = await prisma.knowledgeBase.create({
        data: {
            name: opts.name,
            description: opts.description,
            type: opts.type,
            orgId: opts.orgId,
            isActive: true,
        },
    });
    return kb.id;
}

/** Cria KnowledgeDocument se não existir; retorna id */
async function upsertDocument(opts: {
    title: string;
    content: string;
    sourceType: KnowledgeDocumentSourceType;
    status: KnowledgeDocumentStatus;
    knowledgeBaseId: string;
    orgId: string;
}): Promise<string> {
    const existing = await prisma.knowledgeDocument.findFirst({
        where: { knowledgeBaseId: opts.knowledgeBaseId, title: opts.title },
        select: { id: true },
    });
    if (existing) return existing.id;

    const doc = await prisma.knowledgeDocument.create({
        data: {
            title: opts.title,
            content: opts.content,
            sourceType: opts.sourceType,
            status: opts.status,
            knowledgeBaseId: opts.knowledgeBaseId,
            orgId: opts.orgId,
        },
    });
    return doc.id;
}

/** Cria chunks apenas se o documento ainda não tiver nenhum */
async function upsertChunks(
    documentId: string,
    orgId: string,
    chunks: string[]
): Promise<void> {
    const count = await prisma.knowledgeChunk.count({ where: { documentId } });
    if (count > 0) return;

    for (let i = 0; i < chunks.length; i++) {
        await createChunk({ content: chunks[i], chunkIndex: i, documentId, orgId });
    }

    await prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { chunkCount: chunks.length },
    });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
    const ids = readSeedIds() as { orgId: string };
    const { orgId } = ids;

    // =========================================================================
    // KB 1 — Produtos e Serviços
    // =========================================================================
    const kb1Id = await upsertKB({
        name: "Produtos e Serviços",
        description: "Descrições completas dos planos e FAQ de preços",
        type: KnowledgeBaseType.PRODUCT,
        orgId,
    });

    // --- Documento 1: Plano Starter
    const doc1Id = await upsertDocument({
        title: "Plano Starter — Descrição Completa",
        content: `
O Plano Starter é a porta de entrada para empresas que estão começando sua jornada com CRM inteligente.

Preço: R$997/mês (sem taxa de setup)
Usuários incluídos: até 3 usuários ativos
Base de contatos: até 500 contatos
Canais disponíveis: WhatsApp Business (1 número)
Pipeline: 1 funil de vendas básico com até 7 etapas
Suporte: por e-mail em até 24 horas úteis
Onboarding: assistido em até 24h após a contratação
Garantia: 30 dias — se não gostar, devolvemos 100%

Benefícios principais:
- Sem custo de implementação ou migração
- Treinamento inicial incluído (2 horas)
- Acesso ao painel de relatórios básico
- Histórico de conversas ilimitado
- Backup diário automático

Ideal para: pequenas empresas, profissionais autônomos e startups em fase inicial que precisam organizar o atendimento e não perder leads.
    `.trim(),
        sourceType: KnowledgeDocumentSourceType.TEXT,
        status: KnowledgeDocumentStatus.INDEXED,
        knowledgeBaseId: kb1Id,
        orgId,
    });

    await upsertChunks(doc1Id, orgId, [
        "O Plano Starter custa R$997/mês, inclui até 3 usuários ativos e até 500 contatos na base. Não há taxa de setup e o onboarding assistido acontece em até 24 horas após a contratação.",
        "O Starter inclui 1 número de WhatsApp Business, 1 funil de vendas com até 7 etapas e suporte por e-mail com resposta em até 24 horas úteis. Treinamento inicial de 2 horas está incluído no plano.",
        "O Plano Starter oferece 30 dias de garantia completa: se não gostar da solução, o valor é devolvido integralmente. Ideal para pequenas empresas e startups que querem organizar leads sem custo de entrada elevado.",
    ]);

    // --- Documento 2: Plano Growth
    const doc2Id = await upsertDocument({
        title: "Plano Growth — Descrição Completa",
        content: `
O Plano Growth é a solução completa para equipes de vendas em expansão.

Preço: R$2.497/mês
Usuários incluídos: até 15 usuários ativos
Base de contatos: até 10.000 contatos
Canais: WhatsApp Business, Instagram DM, Facebook Messenger, E-mail
Pipelines: ilimitados
Agentes de IA: 1 Super Agente incluído (configuração assistida)
Integração: Google Workspace (Gmail, Drive, Calendar)
Relatórios: avançados com exportação e dashboards personalizados
Suporte: prioritário via chat em até 4 horas úteis, emergências em 2h

Benefícios adicionais sobre o Starter:
- Multi-canal: centralize todos os atendimentos em um único lugar
- 1 Agente de IA configurado para seu processo de vendas
- Automações de follow-up e nutrição de leads
- API disponível para integrações customizadas
- Gerente de sucesso dedicado no primeiro mês

Ideal para: empresas com equipe comercial estruturada que buscam escalar vendas com automação inteligente.
    `.trim(),
        sourceType: KnowledgeDocumentSourceType.TEXT,
        status: KnowledgeDocumentStatus.INDEXED,
        knowledgeBaseId: kb1Id,
        orgId,
    });

    await upsertChunks(doc2Id, orgId, [
        "O Plano Growth custa R$2.497/mês e suporta até 15 usuários e 10.000 contatos. Inclui todos os canais de mensagem: WhatsApp Business, Instagram DM, Facebook Messenger e E-mail.",
        "O Growth vem com 1 Super Agente de IA já incluído, pipelines ilimitados, integração com Google Workspace e relatórios avançados com dashboards personalizados.",
        "O suporte do plano Growth é prioritário: chat com resposta em até 4 horas úteis e emergências resolvidas em até 2 horas. O primeiro mês conta com um gerente de sucesso dedicado.",
    ]);

    // --- Documento 3: FAQ Planos e Preços
    const doc3Id = await upsertDocument({
        title: "FAQ — Planos e Preços",
        content: `
Perguntas Frequentes sobre Planos e Preços

1. Como funciona o cancelamento?
O cancelamento deve ser solicitado com 30 dias de antecedência. Não há multa após os primeiros 12 meses.

2. A migração de dados é gratuita?
Sim. Nossa equipe realiza a migração de planilhas, outros CRMs e exportações de WhatsApp sem custo adicional.

3. Tem período de teste?
Sim, 14 dias grátis com acesso completo ao plano Growth. Sem cartão de crédito necessário.

4. Quais são as formas de pagamento?
Cartão de crédito (parcelado em até 12x), boleto bancário mensal e PIX com 5% de desconto à vista.

5. E se eu precisar de mais usuários do que o plano permite?
Usuários adicionais podem ser adicionados a qualquer momento. Starter: R$150/usuário extra. Growth: R$120/usuário extra.

6. Posso fazer upgrade de plano a qualquer hora?
Sim, o upgrade é imediato e o valor é calculado proporcionalmente ao período restante do mês.

7. Como funciona o reembolso?
Reembolso proporcional aos dias não utilizados, solicitado em até 30 dias após a cobrança.

8. O suporte está disponível em qual horário?
Starter: dias úteis das 9h às 18h (horário de Brasília). Growth: dias úteis das 8h às 20h. Enterprise: 24/7.

9. Há desconto para pagamento anual?
Sim, 20% de desconto no pagamento anual antecipado em qualquer plano.

10. Posso ter mais de um número de WhatsApp?
Growth e Enterprise suportam múltiplos números. Starter é limitado a 1 número.
    `.trim(),
        sourceType: KnowledgeDocumentSourceType.TEXT,
        status: KnowledgeDocumentStatus.INDEXED,
        knowledgeBaseId: kb1Id,
        orgId,
    });

    await upsertChunks(doc3Id, orgId, [
        "O cancelamento deve ser solicitado com 30 dias de antecedência, sem multa após os primeiros 12 meses. A migração de dados de outros sistemas é sempre gratuita.",
        "O período de teste é de 14 dias grátis com acesso completo ao plano Growth, sem necessidade de cartão de crédito. O upgrade de plano é imediato com cobrança proporcional.",
        "As formas de pagamento aceitas são: cartão de crédito em até 12x, boleto bancário mensal e PIX com 5% de desconto. Pagamento anual tem 20% de desconto.",
        "Reembolso é proporcional aos dias não utilizados. Suporte varia por plano: Starter (dias úteis 9h-18h), Growth (dias úteis 8h-20h), Enterprise (24/7).",
    ]);

    // =========================================================================
    // KB 2 — Objeções e Respostas
    // =========================================================================
    const kb2Id = await upsertKB({
        name: "Objeções e Respostas",
        description: "Respostas validadas para as principais objeções de venda",
        type: KnowledgeBaseType.OBJECTION,
        orgId,
    });

    // --- Documento 1: Objeções de Preço
    const doc4Id = await upsertDocument({
        title: "Objeções de Preço — Respostas Validadas",
        content: `
Objeções de Preço e Respostas Validadas pelo Time Comercial

OBJEÇÃO 1: "É muito caro"
RESPOSTA: "Entendo sua preocupação! Deixa eu te mostrar o outro lado: nossos clientes recuperam o investimento em média em 60 dias só com a redução de leads perdidos. Uma equipe de 5 vendedores perde em média 30% dos leads por falta de organização — com o nosso sistema isso vai para menos de 5%. Quer fazer uma simulação com os números da sua empresa?"

OBJEÇÃO 2: "Não tenho orçamento agora"
RESPOSTA: "Faz sentido! O que você está gastando hoje com leads que não viram clientes? A maioria das empresas gasta mais 'não tendo sistema' do que teria com o sistema. Posso parcelar em até 12x no cartão — fica R$83/mês no Starter. Qual seria o impacto de fechar 2 vendas a mais por mês?"

OBJEÇÃO 3: "O concorrente é mais barato"
RESPOSTA: "Ótima pergunta! Qual concorrente você está comparando? Muitos cobram menos na mensalidade mas têm custos ocultos: por contato, por mensagem enviada, por usuário extra. Nosso preço é flat. Além disso, somos o único com Agente de IA nativo que funciona no seu processo de vendas. Posso fazer uma comparação lado a lado?"

OBJEÇÃO 4: "Preciso pensar melhor"
RESPOSTA: "Claro, faz sentido! O que você precisaria ver para ter mais clareza? É sobre o preço, sobre como funciona tecnicamente ou sobre os resultados que outros tiveram? Enquanto pensa, que tal começar os 14 dias grátis? Você usa o sistema real e decide com mais informação."

OBJEÇÃO 5: "Vou esperar mais um pouco"
RESPOSTA: "Entendo! Curiosidade: o que você estima que perde em vendas por mês por não ter um sistema organizado agora? A maioria das empresas que esperaram 3 meses depois nos disseram que perderam em média 15 oportunidades nesse período. Não estou querendo pressionar — só quero garantir que você está fazendo a conta certa."
    `.trim(),
        sourceType: KnowledgeDocumentSourceType.TEXT,
        status: KnowledgeDocumentStatus.INDEXED,
        knowledgeBaseId: kb2Id,
        orgId,
    });

    await upsertChunks(doc4Id, orgId, [
        "Objeção 'É caro': Nossos clientes recuperam o investimento em 60 dias com redução de leads perdidos. Uma equipe de 5 vendedores perde ~30% dos leads sem sistema organizado. Oferecer simulação de ROI personalizada.",
        "Objeção 'Sem orçamento': Apresentar custo real da desorganização + parcelamento em 12x (Starter = R$83/mês). Reforçar impacto de 2 vendas a mais por mês para justificar o investimento.",
        "Objeção 'Concorrente mais barato': Comparar custo total (TCO) incluindo taxas por contato/mensagem/usuário. Destacar diferencial do Agente de IA nativo. Objeção 'Preciso pensar': Identificar bloqueio específico + oferecer trial de 14 dias para decidir com mais informação.",
    ]);

    // --- Documento 2: Objeções de Timing e Decisão
    const doc5Id = await upsertDocument({
        title: "Objeções de Timing e Decisão",
        content: `
Objeções Relacionadas a Timing e Processo de Decisão

OBJEÇÃO 1: "Preciso consultar meu sócio antes de decidir"
RESPOSTA: "Totalmente faz sentido envolver seu sócio! O que ele vai querer saber principalmente — é mais sobre o custo, sobre como funciona, ou sobre os resultados que outros tiveram? Posso preparar um resumo executivo de 1 página com os pontos que mais costumam importar para quem decide. E se quiser, podemos agendar uma call rápida com os dois juntos para tirar as dúvidas dele diretamente."

OBJEÇÃO 2: "Não é o momento certo agora"
RESPOSTA: "Entendo. Quando seria o momento certo pra você? O que precisa acontecer antes? Pergunto porque a maioria das empresas que disseram isso voltou 3-6 meses depois — e nos disseram que o custo de esperar foi alto. Se for questão de timing interno, posso garantir o preço atual por 30 dias enquanto você resolve o que precisa resolver."

OBJEÇÃO 3: "Deixa eu ver com o financeiro primeiro"
RESPOSTA: "Ótima ideia! Para facilitar a aprovação, posso te mandar: (1) proposta formal com CNPJ para nota fiscal, (2) comparativo de ROI para o financeiro, (3) referências de empresas do mesmo segmento que já aprovaram. O financeiro costuma aprovar mais rápido quando vê o custo de não ter o sistema. O que seria mais útil?"

OBJEÇÃO 4: "Estamos em período de férias / viagem"
RESPOSTA: "Sem problema! Nesses casos, o que funciona melhor é: agendamos para a semana que você volta, eu reservo o seu acesso e o preço atual fica garantido. Qual é a data prevista de retorno? Já coloco no calendário e mando um lembrete para você."
    `.trim(),
        sourceType: KnowledgeDocumentSourceType.TEXT,
        status: KnowledgeDocumentStatus.INDEXED,
        knowledgeBaseId: kb2Id,
        orgId,
    });

    await upsertChunks(doc5Id, orgId, [
        "Objeção 'Preciso consultar sócio': Preparar resumo executivo de 1 página + oferecer call com ambos os sócios. Identificar o que o sócio precisa saber (custo, funcionamento ou resultados).",
        "Objeção 'Não é o momento' / 'Financeiro precisa aprovar': Garantir preço atual por 30 dias. Enviar proposta formal, comparativo de ROI e referências do segmento para facilitar aprovação interna.",
    ]);

    // =========================================================================
    // KB 3 — Processos Internos
    // =========================================================================
    const kb3Id = await upsertKB({
        name: "Processos Internos",
        description: "Fluxos operacionais, onboarding e SLAs de atendimento",
        type: KnowledgeBaseType.FAQ,
        orgId,
    });

    // --- Documento 1: Fluxo de Onboarding
    const doc6Id = await upsertDocument({
        title: "Fluxo de Onboarding de Clientes",
        content: `
Fluxo de Onboarding — Primeiros 30 Dias

DIA 1 — Acesso e Configuração Básica
- Envio dos dados de acesso ao administrador principal
- Configuração do perfil da empresa (nome, logo, cores)
- Criação dos usuários principais da equipe
- Visão geral de 30 minutos com o gerente de sucesso

DIA 2-3 — Importação de Dados e WhatsApp
- Importação da base de contatos (planilha ou outro CRM)
- Configuração do número de WhatsApp Business
- Conexão com outros canais contratados (Instagram, email)
- Revisão da qualidade dos dados importados

DIA 4-5 — Treinamento da Equipe
- Sessão de treinamento de 2 horas com toda a equipe
- Apresentação do pipeline de vendas
- Demonstração de como usar as conversas
- Primeiras atividades de teste pelo time

DIA 7 — Primeira Automação
- Configuração da automação de boas-vindas para novos leads
- Primeiro funil de vendas personalizado para o processo da empresa
- Revisão com o gerente de sucesso

DIA 14 — Revisão e Ajustes
- Check-in com o time para identificar dúvidas
- Ajustes no pipeline conforme aprendizados da primeira semana
- Relatório de uso e métricas iniciais
- Configuração de relatórios automáticos

DIA 30 — Check-in de Sucesso
- Revisão completa dos resultados do primeiro mês
- Comparativo: antes vs depois da implementação
- Planejamento dos próximos 60 dias
- Avaliação de upgrade de plano se necessário
    `.trim(),
        sourceType: KnowledgeDocumentSourceType.TEXT,
        status: KnowledgeDocumentStatus.INDEXED,
        knowledgeBaseId: kb3Id,
        orgId,
    });

    await upsertChunks(doc6Id, orgId, [
        "No Dia 1 do onboarding: envio de credenciais, configuração do perfil da empresa e visão geral de 30 min com o gerente de sucesso. Nos Dias 2-3: importação de contatos e configuração do WhatsApp Business.",
        "Nos Dias 4-5: treinamento de 2 horas com a equipe cobrindo pipeline, conversas e atividades de teste. No Dia 7: primeira automação de boas-vindas e funil personalizado para o processo da empresa.",
    ]);

    // --- Documento 2: SLAs de Atendimento
    const doc7Id = await upsertDocument({
        title: "SLAs e Tempos de Atendimento",
        content: `
SLAs de Atendimento por Plano

PLANO STARTER
- Canal de suporte: E-mail
- Tempo de primeira resposta: até 24 horas úteis
- Horário de atendimento: dias úteis das 9h às 18h (Brasília)
- Emergências: não aplicável (encaminhado para próxima janela)

PLANO GROWTH
- Canais de suporte: Chat e E-mail
- Tempo de primeira resposta: até 4 horas úteis
- Emergências (sistema fora do ar): até 2 horas úteis
- Horário de atendimento: dias úteis das 8h às 20h (Brasília)
- Gerente de sucesso dedicado no primeiro mês

PLANO ENTERPRISE
- Canais de suporte: Chat, Telefone, E-mail, WhatsApp dedicado
- Tempo de primeira resposta: até 1 hora (qualquer dia/hora)
- Emergências (sistema fora do ar): até 30 minutos, 24/7
- Atendimento: 24 horas por dia, 7 dias por semana
- SLA de uptime: 99,95% garantido em contrato
- Gerente de sucesso dedicado permanente

Definição de Emergência:
Incidentes classificados como emergência são aqueles que impossibilitam totalmente o uso do sistema por toda a equipe ou que causam perda de dados em produção.
    `.trim(),
        sourceType: KnowledgeDocumentSourceType.TEXT,
        status: KnowledgeDocumentStatus.INDEXED,
        knowledgeBaseId: kb3Id,
        orgId,
    });

    await upsertChunks(doc7Id, orgId, [
        "SLA Starter: suporte por e-mail, resposta em até 24h úteis, dias úteis 9h-18h. SLA Growth: chat e e-mail, resposta em 4h úteis, emergências em 2h, horário 8h-20h nos dias úteis.",
        "SLA Enterprise: todos os canais (chat, telefone, e-mail, WhatsApp dedicado), resposta em 1h, emergências em 30 minutos, atendimento 24/7 com SLA de uptime de 99,95% garantido em contrato.",
    ]);

    // =========================================================================
    // PERSIST IDs
    // =========================================================================
    writeSeedIds({
        knowledgeBases: {
            kb1: kb1Id,
            kb2: kb2Id,
            kb3: kb3Id,
        },
    });

    console.log("✅ S02 — Knowledge: 3 KBs, 7 docs, ~22 chunks");
}

main()
    .catch((e) => {
        console.error("❌ S02 failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
