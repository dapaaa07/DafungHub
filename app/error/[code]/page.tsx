import { connection } from 'next/server';
import type { Metadata } from 'next';
import HttpErrorView from '@/components/HttpErrorView';
import { getHttpError } from '@/lib/http-errors';

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const numericCode = Number.parseInt(code, 10);
  const def = getHttpError(Number.isFinite(numericCode) ? numericCode : 500);

  return {
    title: `${def.code} ${def.label} — Dafung Hub`,
    description: def.description,
    robots: { index: false, follow: false },
  };
}

export default async function DynamicHttpErrorPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await connection();
  const { code } = await params;
  const numericCode = Number.parseInt(code, 10);
  const validCode =
    Number.isFinite(numericCode) && numericCode >= 400 && numericCode < 600
      ? numericCode
      : 404;

  return <HttpErrorView statusCode={validCode} />;
}
