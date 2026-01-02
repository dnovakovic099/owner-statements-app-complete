import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { PieChart, Info } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface PieChartData {
  category: string;
  amount: number;
  color?: string;
}

interface EnhancedPieChartProps {
  data: PieChartData[];
  title?: string;
  onCategoryClick?: (category: string) => void;
  showLegend?: boolean;
  showPercentages?: boolean;
  height?: number;
  className?: string;
}

const DEFAULT_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#84CC16', // lime
  '#F97316', // orange
  '#6366F1', // indigo
];

export const EnhancedPieChart: React.FC<EnhancedPieChartProps> = ({
  data,
  title = 'Expense Breakdown by Category',
  onCategoryClick,
  showLegend = true,
  showPercentages = true,
  height = 400,
  className,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Add colors to data if not provided
  const coloredData = data.map((d, i) => ({
    ...d,
    color: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  const total = coloredData.reduce((sum, d) => sum + d.amount, 0);

  useEffect(() => {
    if (!svgRef.current || !coloredData.length) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const width = 400;
    const radius = Math.min(width, height) / 2 - 40;

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Create pie layout
    const pie = d3
      .pie<PieChartData>()
      .value((d) => d.amount)
      .sort(null);

    // Create arc generator
    const arc = d3
      .arc<d3.PieArcDatum<PieChartData>>()
      .innerRadius(radius * 0.6) // Donut chart
      .outerRadius(radius);

    // Create arc for hover effect
    const arcHover = d3
      .arc<d3.PieArcDatum<PieChartData>>()
      .innerRadius(radius * 0.6)
      .outerRadius(radius + 10);

    const tooltip = d3.select(tooltipRef.current);

    // Draw arcs
    const arcs = svg
      .selectAll('.arc')
      .data(pie(coloredData))
      .enter()
      .append('g')
      .attr('class', 'arc')
      .style('cursor', onCategoryClick ? 'pointer' : 'default');

    // Draw paths with animation
    arcs
      .append('path')
      .attr('fill', (d) => d.data.color || '#3B82F6')
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
      .style('filter', 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))')
      .transition()
      .duration(800)
      .attrTween('d', function (d) {
        const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return function (t) {
          return arc(interpolate(t) as any) || '';
        };
      });

    // Add interaction
    arcs
      .on('mouseover', function (event, d) {
        const path = d3.select(this).select('path');

        // Highlight
        path
          .transition()
          .duration(200)
          .attr('d', arcHover(d) as any)
          .style('filter', 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.2))');

        setSelectedCategory(d.data.category);

        // Show tooltip
        const percentage = ((d.data.amount / total) * 100).toFixed(1);
        tooltip
          .style('display', 'block')
          .html(
            `
            <div class="font-semibold text-gray-900 mb-1">${d.data.category}</div>
            <div class="text-gray-700">
              <span class="font-bold">$${d.data.amount.toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}</span>
            </div>
            <div class="text-sm text-gray-600 mt-0.5">${percentage}% of total</div>
          `
          )
          .style('left', `${event.pageX + 15}px`)
          .style('top', `${event.pageY - 15}px`);
      })
      .on('mouseout', function (event, d) {
        const path = d3.select(this).select('path');

        // Remove highlight
        path
          .transition()
          .duration(200)
          .attr('d', arc(d) as any)
          .style('filter', 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))');

        setSelectedCategory(null);
        tooltip.style('display', 'none');
      })
      .on('click', function (event, d) {
        if (onCategoryClick) {
          onCategoryClick(d.data.category);
        }
      });

    // Add percentage labels if enabled
    if (showPercentages) {
      arcs
        .append('text')
        .attr('transform', (d) => {
          const pos = arc.centroid(d);
          return `translate(${pos})`;
        })
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('fill', 'white')
        .style('pointer-events', 'none')
        .style('opacity', 0)
        .text((d) => {
          const percentage = (d.data.amount / total) * 100;
          return percentage > 5 ? `${percentage.toFixed(0)}%` : '';
        })
        .transition()
        .delay(800)
        .duration(400)
        .style('opacity', 1);
    }

    // Center label showing total
    const centerGroup = svg.append('g').attr('class', 'center-label');

    centerGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.5em')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .style('fill', '#6B7280')
      .text('Total');

    centerGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1em')
      .style('font-size', '24px')
      .style('font-weight', 'bold')
      .style('fill', '#111827')
      .text(`$${(total / 1000).toFixed(1)}k`);

  }, [coloredData, height, onCategoryClick, showPercentages, total]);

  return (
    <div className={cn('bg-white rounded-2xl shadow-lg border border-gray-200 p-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-2.5 rounded-xl shadow-lg">
            <PieChart className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>

        {onCategoryClick && (
          <span className="text-xs text-gray-500 font-medium">
            Click to view details
          </span>
        )}
      </div>

      {/* Chart and Legend Layout */}
      <div className="flex items-center gap-8">
        {/* Chart */}
        <div className="relative flex-shrink-0">
          <svg ref={svgRef} />
          <div
            ref={tooltipRef}
            className="absolute bg-white border border-gray-300 rounded-xl shadow-2xl p-3 text-sm pointer-events-none z-50"
            style={{ display: 'none' }}
          />
        </div>

        {/* Legend */}
        {showLegend && coloredData.length > 0 && (
          <div className="flex-1 space-y-2 max-h-[400px] overflow-y-auto">
            {coloredData
              .sort((a, b) => b.amount - a.amount)
              .map((item, index) => {
                const percentage = ((item.amount / total) * 100).toFixed(1);
                const isSelected = selectedCategory === item.category;

                return (
                  <div
                    key={item.category}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg transition-all duration-200',
                      onCategoryClick && 'cursor-pointer hover:bg-gray-50',
                      isSelected && 'bg-blue-50 border border-blue-200'
                    )}
                    onClick={() => onCategoryClick?.(item.category)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {item.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {percentage}%
                      </span>
                      <span className="text-sm font-bold text-gray-900 min-w-[80px] text-right">
                        ${item.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Empty state */}
      {coloredData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Info className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">No expense data available</p>
          <p className="text-xs mt-1">Add expenses to see the breakdown</p>
        </div>
      )}
    </div>
  );
};
