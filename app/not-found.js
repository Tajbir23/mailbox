import Link from "next/link";

export const metadata = {
  title: "Page Not Found",
};

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="text-6xl font-bold text-gray-200">404</div>
        <h1 className="text-xl font-bold text-gray-800">Page Not Found</h1>
        <p className="text-sm text-gray-500">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
