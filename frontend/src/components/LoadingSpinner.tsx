import React from 'react';
import { RefreshCw } from 'lucide-react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Loading Dashboard</h2>
        <p className="text-gray-600 dark:text-gray-400">Please wait while we fetch your data...</p>
      </div>
    </div>
  );
};

export default LoadingSpinner;
