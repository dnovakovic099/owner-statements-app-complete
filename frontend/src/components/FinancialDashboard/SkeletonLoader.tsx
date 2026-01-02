import React from 'react';

const SkeletonLoader: React.FC = () => {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Summary Bubbles Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow-md p-6 border border-gray-200/50"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-24 mb-3 animate-pulse"></div>
                <div className="h-8 bg-gray-300 rounded w-32 mb-2 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-20 animate-pulse"></div>
              </div>
              <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs Skeleton */}
      <div className="bg-gray-100/80 backdrop-blur-sm rounded-lg p-1.5 border border-gray-200/50">
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-10 bg-gray-200 rounded-md animate-pulse"
            ></div>
          ))}
        </div>
      </div>

      {/* Chart Cards Skeleton */}
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow-md p-6 border border-gray-200/50"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
              <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
            </div>
            <div className="h-80 bg-gray-100 rounded-lg animate-pulse relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-shimmer animate-shimmer"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SkeletonLoader;
