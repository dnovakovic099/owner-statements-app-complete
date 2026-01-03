import React, { useState } from 'react';
import InsightsFeed, { Insight } from './InsightsFeed';

/**
 * Example usage of the InsightsFeed component
 *
 * This demonstrates how to use the InsightsFeed component with various
 * insight types and interaction handlers.
 */
const InsightsFeedExample: React.FC = () => {
  // Sample insights data
  const [insights] = useState<Insight[]>([
    {
      id: '1',
      type: 'warning',
      message: 'High cleaning fees detected for Sunset Villa. Consider reviewing vendor contracts.',
      timestamp: '2 hours ago',
      link: '/properties/sunset-villa/expenses',
    },
    {
      id: '2',
      type: 'trend-up',
      message: 'Revenue increased 15% this month compared to last month across all PM properties.',
      timestamp: '3 hours ago',
    },
    {
      id: '3',
      type: 'tip',
      message: 'You can reduce maintenance costs by scheduling preventive maintenance during low season.',
      timestamp: '5 hours ago',
    },
    {
      id: '4',
      type: 'success',
      message: 'All statements for December have been successfully processed and approved.',
      timestamp: '1 day ago',
    },
    {
      id: '5',
      type: 'info',
      message: 'Q4 tax documents are now available for download in the Reports section.',
      timestamp: '2 days ago',
      link: '/reports/tax-documents',
    },
    {
      id: '6',
      type: 'trend-down',
      message: 'Occupancy rate decreased by 8% for Arbitrage properties this week.',
      timestamp: '2 days ago',
      link: '/analytics/occupancy',
    },
  ]);

  // Handler for insight clicks
  const handleInsightClick = (insight: Insight) => {
    console.log('Insight clicked:', insight);

    // Navigate to the link if available
    if (insight.link) {
      console.log('Navigating to:', insight.link);
      // In a real app: router.push(insight.link)
    }

    // Or perform other actions based on insight type
    switch (insight.type) {
      case 'warning':
        console.log('Warning insight clicked - showing detailed alert');
        break;
      case 'trend-up':
      case 'trend-down':
        console.log('Trend insight clicked - showing trend details');
        break;
      case 'tip':
        console.log('Tip clicked - showing detailed recommendation');
        break;
      default:
        console.log('General insight clicked');
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          InsightsFeed Component Examples
        </h1>

        {/* Example 1: Full insights feed with click handler */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            With Click Handler
          </h2>
          <InsightsFeed
            insights={insights}
            onInsightClick={handleInsightClick}
          />
        </div>

        {/* Example 2: Limited insights */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Limited Insights (3 items)
          </h2>
          <InsightsFeed
            insights={insights.slice(0, 3)}
            onInsightClick={handleInsightClick}
          />
        </div>

        {/* Example 3: Empty state */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Empty State
          </h2>
          <InsightsFeed
            insights={[]}
            onInsightClick={handleInsightClick}
          />
        </div>

        {/* Example 4: Read-only (no click handler) */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Read-only Mode (No Click Handler)
          </h2>
          <InsightsFeed insights={insights.slice(0, 4)} />
        </div>

        {/* Usage guide */}
        <div className="mt-12 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Usage Guide
          </h2>
          <div className="space-y-4 text-sm text-gray-700">
            <div>
              <h3 className="font-semibold mb-2">Props:</h3>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><code className="bg-gray-100 px-2 py-1 rounded">insights</code>: Array of insight objects</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">onInsightClick</code>: Optional callback function when an insight is clicked</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Insight Types:</h3>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><code className="bg-gray-100 px-2 py-1 rounded">warning</code>: Amber AlertTriangle icon</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">tip</code>: Blue Lightbulb icon</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">info</code>: Gray Info icon</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">success</code>: Green CheckCircle icon</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">trend-up</code>: Green TrendingUp icon</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">trend-down</code>: Red TrendingDown icon</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Features:</h3>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Scrollable container with max-height of 400px</li>
                <li>Smooth animations using Framer Motion</li>
                <li>Hover effects on clickable items</li>
                <li>Type-based color coding and icons</li>
                <li>Empty state handling</li>
                <li>QuickBooks-style white card design with shadow-sm</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightsFeedExample;
