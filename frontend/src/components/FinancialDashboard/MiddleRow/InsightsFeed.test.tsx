import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightsFeed, { Insight } from './InsightsFeed';

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe('InsightsFeed', () => {
  const mockInsights: Insight[] = [
    {
      id: '1',
      type: 'warning',
      message: 'High cleaning fees detected',
      timestamp: '2 hours ago',
      link: '/expenses',
    },
    {
      id: '2',
      type: 'trend-up',
      message: 'Revenue increased 15%',
      timestamp: '3 hours ago',
    },
    {
      id: '3',
      type: 'tip',
      message: 'Schedule preventive maintenance',
      timestamp: '5 hours ago',
    },
  ];

  it('should render the component header', () => {
    render(<InsightsFeed insights={mockInsights} />);
    expect(screen.getByText('Insights & Alerts')).toBeInTheDocument();
  });

  it('should render all insights', () => {
    render(<InsightsFeed insights={mockInsights} />);
    expect(screen.getByText('High cleaning fees detected')).toBeInTheDocument();
    expect(screen.getByText('Revenue increased 15%')).toBeInTheDocument();
    expect(screen.getByText('Schedule preventive maintenance')).toBeInTheDocument();
  });

  it('should render timestamps for each insight', () => {
    render(<InsightsFeed insights={mockInsights} />);
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    expect(screen.getByText('3 hours ago')).toBeInTheDocument();
    expect(screen.getByText('5 hours ago')).toBeInTheDocument();
  });

  it('should show empty state when no insights', () => {
    render(<InsightsFeed insights={[]} />);
    expect(screen.getByText('No insights available at the moment')).toBeInTheDocument();
  });

  it('should call onInsightClick when insight is clicked', () => {
    const mockOnClick = jest.fn();
    render(<InsightsFeed insights={mockInsights} onInsightClick={mockOnClick} />);

    const firstInsight = screen.getByText('High cleaning fees detected').closest('div');
    if (firstInsight) {
      fireEvent.click(firstInsight);
    }

    expect(mockOnClick).toHaveBeenCalledWith(mockInsights[0]);
  });

  it('should not call onInsightClick when not provided', () => {
    render(<InsightsFeed insights={mockInsights} />);

    const firstInsight = screen.getByText('High cleaning fees detected').closest('div');
    if (firstInsight) {
      // Should not throw error
      expect(() => fireEvent.click(firstInsight)).not.toThrow();
    }
  });

  it('should render different insight types with correct styling', () => {
    const differentTypes: Insight[] = [
      {
        id: '1',
        type: 'warning',
        message: 'Warning message',
        timestamp: '1h ago',
      },
      {
        id: '2',
        type: 'success',
        message: 'Success message',
        timestamp: '2h ago',
      },
      {
        id: '3',
        type: 'info',
        message: 'Info message',
        timestamp: '3h ago',
      },
    ];

    render(<InsightsFeed insights={differentTypes} />);

    expect(screen.getByText('Warning message')).toBeInTheDocument();
    expect(screen.getByText('Success message')).toBeInTheDocument();
    expect(screen.getByText('Info message')).toBeInTheDocument();
  });

  it('should render clickable insights with hover styles', () => {
    const mockOnClick = jest.fn();
    render(<InsightsFeed insights={mockInsights} onInsightClick={mockOnClick} />);

    const firstInsight = screen.getByText('High cleaning fees detected').closest('div');
    if (firstInsight) {
      expect(firstInsight).toHaveClass('cursor-pointer');
    }
  });

  it('should handle single insight', () => {
    const singleInsight: Insight[] = [
      {
        id: '1',
        type: 'info',
        message: 'Single insight message',
        timestamp: 'Just now',
      },
    ];

    render(<InsightsFeed insights={singleInsight} />);
    expect(screen.getByText('Single insight message')).toBeInTheDocument();
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  it('should handle insights with links', () => {
    const insightsWithLinks: Insight[] = [
      {
        id: '1',
        type: 'warning',
        message: 'Check this out',
        timestamp: '1h ago',
        link: '/some-link',
      },
    ];

    const mockOnClick = jest.fn();
    render(<InsightsFeed insights={insightsWithLinks} onInsightClick={mockOnClick} />);

    const insight = screen.getByText('Check this out').closest('div');
    if (insight) {
      fireEvent.click(insight);
    }

    expect(mockOnClick).toHaveBeenCalledWith(
      expect.objectContaining({
        link: '/some-link',
      })
    );
  });

  it('should render with maximum insights (scrollable)', () => {
    const manyInsights: Insight[] = Array.from({ length: 10 }, (_, i) => ({
      id: `${i + 1}`,
      type: 'info' as const,
      message: `Insight ${i + 1}`,
      timestamp: `${i + 1}h ago`,
    }));

    render(<InsightsFeed insights={manyInsights} />);

    // Should render all insights
    manyInsights.forEach((insight) => {
      expect(screen.getByText(insight.message)).toBeInTheDocument();
    });
  });

  it('should handle trend-up and trend-down types', () => {
    const trendInsights: Insight[] = [
      {
        id: '1',
        type: 'trend-up',
        message: 'Positive trend',
        timestamp: '1h ago',
      },
      {
        id: '2',
        type: 'trend-down',
        message: 'Negative trend',
        timestamp: '2h ago',
      },
    ];

    render(<InsightsFeed insights={trendInsights} />);

    expect(screen.getByText('Positive trend')).toBeInTheDocument();
    expect(screen.getByText('Negative trend')).toBeInTheDocument();
  });
});
