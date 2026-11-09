import type { Metadata } from "next";
import { Suspense } from "react";
import { adminConfigured } from "@/server/admin-auth";

export const metadata: Metadata = { title: "Equipe · Entrar", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  wrong: "Nome ou senha incorretos.",
  not_configured: "O acesso da equipe ainda não foi configurado (falta ADMIN_ACCOUNTS).",
};

async function ErrorMessage({ searchParams }: { searchParams: PageProps<"/admin/login">["searchParams"] }) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : null;
  return message ? (
    <p role="alert" className="border-sale/30 bg-sale/5 text-sale rounded-lg border px-3 py-2.5 text-sm">
      {message}
    </p>
  ) : null;
}

export default function AdminLoginPage(props: PageProps<"/admin/login">) {
  const field = "border-line mt-1.5 block w-full rounded-lg border bg-white px-3.5 py-3";
  return (
    <div lang="pt-BR" className="shell max-w-sm py-16">
      <p className="eyebrow">Equipe</p>
      <h1 className="display mt-2 text-4xl">Entrar</h1>
      {!adminConfigured() ? (
        <p className="text-muted mt-5 text-sm">{ERRORS.not_configured}</p>
      ) : (
        <form method="post" action="/api/admin/login" className="mt-8 space-y-5">
          <Suspense fallback={null}>
            <ErrorMessage searchParams={props.searchParams} />
          </Suspense>
          <label className="block text-sm">
            <span className="font-medium">Nome</span>
            <input name="name" required autoComplete="username" className={field} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Senha</span>
            <input name="password" type="password" required autoComplete="current-password" className={field} />
          </label>
          <button className="btn btn-dark w-full py-4">Entrar</button>
        </form>
      )}
    </div>
  );
}
