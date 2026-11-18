import HttpErrorView from '@/components/HttpErrorView';

export default function NotFound() {
  return <HttpErrorView statusCode={404} />;
}
