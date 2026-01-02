import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export interface CategoryData {
  category: string;
  amount: number;
  color?: string;
}

interface CategoryPieChartProps {
  data: CategoryData[];
  onCategoryClick?: (category: string) => void;
}

const CategoryPieChart: React.FC<CategoryPieChartProps> = ({ data, onCategoryClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Dimensions
    const width = 400;
    const height = 400;
    const radius = Math.min(width, height) / 2 - 40;
    const innerRadius = radius * 0.6; // Donut chart

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Default color scale
    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(data.map((d) => d.category))
      .range([
        '#3B82F6',
        '#10B981',
        '#F59E0B',
        '#EF4444',
        '#8B5CF6',
        '#EC4899',
        '#14B8A6',
        '#F97316',
      ]);

    // Pie generator
    const pie = d3
      .pie<CategoryData>()
      .value((d) => d.amount)
      .sort(null);

    // Arc generator
    const arc = d3
      .arc<d3.PieArcDatum<CategoryData>>()
      .innerRadius(innerRadius)
      .outerRadius(radius);

    const arcHover = d3
      .arc<d3.PieArcDatum<CategoryData>>()
      .innerRadius(innerRadius)
      .outerRadius(radius + 10);

    // Tooltip
    const tooltip = d3.select(tooltipRef.current);

    // Total amount for percentage calculation
    const total = d3.sum(data, (d) => d.amount);

    // Create arcs
    const arcs = svg
      .selectAll('.arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc')
      .style('cursor', onCategoryClick ? 'pointer' : 'default');

    arcs
      .append('path')
      .attr('d', arc)
      .attr('fill', (d) => d.data.color || colorScale(d.data.category))
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .on('mouseover', function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arcHover(d) as string);

        const percentage = ((d.data.amount / total) * 100).toFixed(1);
        tooltip
          .style('display', 'block')
          .html(
            `
            <div class="font-semibold text-gray-900">${d.data.category}</div>
            <div class="text-gray-700">$${d.data.amount.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</div>
            <div class="text-sm text-gray-500">${percentage}% of total</div>
          `
          )
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`);
      })
      .on('mouseout', function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arc(d) as string);
        tooltip.style('display', 'none');
      })
      .on('click', function (event, d) {
        if (onCategoryClick) {
          onCategoryClick(d.data.category);
        }
      });

    // Center text showing total
    svg
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.5em')
      .style('font-size', '14px')
      .style('fill', '#6B7280')
      .text('Total Expenses');

    svg
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1em')
      .style('font-size', '24px')
      .style('font-weight', 'bold')
      .style('fill', '#111827')
      .text(
        `$${total.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}`
      );
  }, [data, onCategoryClick]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const total = d3.sum(data, (d) => d.amount);
  const colorScale = d3
    .scaleOrdinal<string>()
    .domain(data.map((d) => d.category))
    .range([
      '#3B82F6',
      '#10B981',
      '#F59E0B',
      '#EF4444',
      '#8B5CF6',
      '#EC4899',
      '#14B8A6',
      '#F97316',
    ]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Expenses by Category</h3>
      <div className="flex flex-col lg:flex-row items-center gap-8">
        {/* Chart */}
        <div className="relative flex-shrink-0">
          <svg ref={svgRef} />
          <div
            ref={tooltipRef}
            className="absolute bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm pointer-events-none z-10"
            style={{ display: 'none' }}
          />
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2 w-full">
          {data.map((item, index) => {
            const percentage = ((item.amount / total) * 100).toFixed(1);
            return (
              <div
                key={item.category}
                className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                  onCategoryClick ? 'hover:bg-gray-50 cursor-pointer' : ''
                }`}
                onClick={() => onCategoryClick?.(item.category)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color || colorScale(item.category) }}
                  />
                  <span className="text-sm font-medium text-gray-900">{item.category}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">{percentage}%</span>
                  <span className="text-sm font-semibold text-gray-900 min-w-[100px] text-right">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CategoryPieChart;
