import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
        <div className="mb-6">
          <WifiOff className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            You're Offline
          </h1>
          <p className="text-gray-600">
            No internet connection detected. The POS system is running in offline mode.
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-center mb-2">
              <Wifi className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-blue-800 font-medium">Offline Features Available</span>
            </div>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Browse cached products</li>
              <li>• Process sales (will sync when online)</li>
              <li>• View dashboard data</li>
              <li>• Access offline inventory</li>
            </ul>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </button>

          <button
            onClick={() => window.history.back()}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>

        <div className="mt-6 text-xs text-gray-500">
          <p>Your data will be automatically synced when connection is restored.</p>
        </div>
      </div>
    </div>
  );
}