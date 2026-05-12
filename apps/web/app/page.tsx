import { Button } from "@crm-base/ui";

const modules = ["Leads", "Atendimentos", "Agenda", "Pagamentos", "Knowledge Base", "IA"];

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-8">
      <section className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">crm-base</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">CRM white-label pronto para multi-cliente</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              Base operacional com Next.js, Fastify, design system compartilhado e infraestrutura preparada para tiers.
            </p>
          </div>
          <Button>Comecar setup</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => (
            <div key={module} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-950">{module}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Modulo base preparado para customizacao por cliente.</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}