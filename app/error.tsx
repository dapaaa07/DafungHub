'use client';

import { useEffect } from 'react';
import HttpErrorView from '@/components/HttpErrorView';

interface ErrorPageProps {
  error: Error & { digest?: string; statusCode?: number };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[Dafung Hub Error Boundary]:', error);
  }, [error]);

  const code =
    typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500;

  return <HttpErrorView statusCode={code} digest={error?.digest} onRetry={reset} />;
}
