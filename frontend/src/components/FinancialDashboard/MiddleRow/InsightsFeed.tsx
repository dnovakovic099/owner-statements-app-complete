import React from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Lightbulb,
  Info,
  CheckCircle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

export type InsightType = 'warning' | 'tip' | 'info' | 'success' | 'trend-up' | 'trend-down';

export interface Insight {
  id: string;
  type: InsightType;
  message: string;
  timestamp: string;
  link?: string;
}

export interface InsightsFeedProps {
  insights: Insight[];
  onInsightClick?: (insight: Insight) => void;
}

const InsightsFeed: React.FC<InsightsFeedProps> = ({
  insights,
  onInsightClick,
}) => {
  const getInsightIcon = (type: InsightType) => {
    const iconClass = "w-5 h-5";

    switch (type) {
      case 'warning':
        return <AlertTriangle className={iconClass} />;
      case 'tip':
        return <Lightbulb className={iconClass} />;
      case 'info':
        return <Info className={iconClass} />;
      case 'success':
        return <CheckCircle className={iconClass} />;
      case 'trend-up':
        return <TrendingUp className={iconClass} />;
      case 'trend-down':
        return <TrendingDown className={iconClass} />;
      default:
        return <Info className={iconClass} />;
    }
  };

  const getInsightColors = (type: InsightType) => {
    switch (type) {
      case 'warning':
        return {
          iconBg: 'bg-amber-50',
          iconColor: 'text-amber-600',
          borderColor: 'border-amber-200',
          hoverBg: 'hover:bg-amber-50',
        };
      case 'tip':
        return {
          iconBg: 'bg-blue-50',
          iconColor: 'text-blue-600',
          borderColor: 'border-blue-200',
          hoverBg: 'hover:bg-blue-50',
        };
      case 'info':
        return {
          iconBg: 'bg-gray-50',
          iconColor: 'text-gray-600',
          borderColor: 'border-gray-200',
          hoverBg: 'hover:bg-gray-50',
        };
      case 'success':
        return {
          iconBg: 'bg-green-50',
          iconColor: 'text-green-600',
          borderColor: 'border-green-200',
          hoverBg: 'hover:bg-green-50',
        };
      case 'trend-up':
        return {
          iconBg: 'bg-green-50',
          iconColor: 'text-green-600',
          borderColor: 'border-green-200',
          hoverBg: 'hover:bg-green-50',
        };
      case 'trend-down':
        return {
          iconBg: 'bg-red-50',
          iconColor: 'text-red-600',
          borderColor: 'border-red-200',
          hoverBg: 'hover:bg-red-50',
        };
      default:
        return {
          iconBg: 'bg-gray-50',
          iconColor: 'text-gray-600',
          borderColor: 'border-gray-200',
          hoverBg: 'hover:bg-gray-50',
        };
    }
  };

  const handleInsightClick = (insight: Insight) => {
    if (onInsightClick) {
      onInsightClick(insight);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Insights & Alerts</h3>
      </div>

      {/* Scrollable Insights List */}
      <div className="max-h-[280px] overflow-y-auto">
        {insights.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 mb-2">
              <Info className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">No insights available</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {insights.map((insight, index) => {
              const colors = getInsightColors(insight.type);
              const isClickable = onInsightClick || insight.link;

              return (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  onClick={() => handleInsightClick(insight)}
                  className={`
                    px-5 py-3 transition-all duration-200
                    ${isClickable ? `${colors.hoverBg} cursor-pointer` : ''}
                    group
                  `}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`
                      flex-shrink-0 p-2 rounded-lg
                      ${colors.iconBg} ${colors.iconColor}
                      transition-transform duration-200
                      ${isClickable ? 'group-hover:scale-110' : ''}
                    `}>
                      {getInsightIcon(insight.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 leading-snug">
                        {insight.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {insight.timestamp}
                      </p>
                    </div>

                    {/* Optional link indicator */}
                    {isClickable && (
                      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <svg
                          className="w-4 h-4 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default InsightsFeed;
