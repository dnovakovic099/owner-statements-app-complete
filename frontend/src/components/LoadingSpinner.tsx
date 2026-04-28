import React from 'react';
import { RefreshCw } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  subMessage?: string;
  onCancel?: () => void;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message, subMessage, onCancel }) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {message ?? 'Loading Dashboard'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {subMessage ?? 'Please wait while we fetch your data...'}
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-4 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default LoadingSpinner;
