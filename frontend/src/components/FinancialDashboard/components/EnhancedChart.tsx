import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface ChartDataPoint {
  month: string;
  income: number;
  expenses: number;
}

interface EnhancedChartProps {
  data: ChartDataPoint[];
  title?: string;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  interactive?: boolean;
  className?: string;
}

export const EnhancedChart: React.FC<EnhancedChartProps> = ({
  data,
  title = 'Income vs Expenses Trend',
  height = 400,
  showLegend = true,
  showGrid = true,
  interactive = true,
  className,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | null>(null);

  // Calculate summary statistics
  const totalIncome = data.reduce((sum, d) => sum + d.income, 0);
  const totalExpenses = data.reduce((sum, d) => sum + d.expenses, 0);
  const avgIncome = totalIncome / (data.length || 1);
  const avgExpenses = totalExpenses / (data.length || 1);
  const netProfit = totalIncome - totalExpenses;

  useEffect(() => {
    if (!svgRef.current || !data.length || !containerRef.current) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Get container width for responsiveness
    const containerWidth = containerRef.current.clientWidth;

    // Dimensions with responsive margins
    const margin = { top: 30, right: 100, bottom: 60, left: 70 };
    const width = containerWidth - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr('width', containerWidth)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates
    const parseDate = (dateStr: string) => {
      if (dateStr.includes('-')) {
        const [year, month] = dateStr.split('-');
        return new Date(parseInt(year), parseInt(month) - 1);
      }
      return new Date(dateStr);
    };

    const formattedData = data.map((d) => ({
      date: parseDate(d.month),
      month: d.month,
      income: d.income,
      expenses: d.expenses,
      netProfit: d.income - d.expenses,
    }));

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(formattedData, (d) => d.date) as [Date, Date])
      .range([0, width]);

    const maxValue = d3.max(formattedData, (d) => Math.max(d.income, d.expenses)) || 0;
    const yScale = d3
      .scaleLinear()
      .domain([0, maxValue * 1.15])
      .range([chartHeight, 0])
      .nice();

    // Add gradient definitions
    const defs = svg.append('defs');

    // Income gradient
    const incomeGradient = defs
      .append('linearGradient')
      .attr('id', 'income-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    incomeGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#10B981')
      .attr('stop-opacity', 0.3);

    incomeGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#10B981')
      .attr('stop-opacity', 0);

    // Expense gradient
    const expenseGradient = defs
      .append('linearGradient')
      .attr('id', 'expense-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    expenseGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#EF4444')
      .attr('stop-opacity', 0.3);

    expenseGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#EF4444')
      .attr('stop-opacity', 0);

    // Grid lines
    if (showGrid) {
      svg
        .append('g')
        .attr('class', 'grid')
        .call(
          d3
            .axisLeft(yScale)
            .ticks(6)
            .tickSize(-width)
            .tickFormat(() => '')
        )
        .selectAll('line')
        .style('stroke', '#E5E7EB')
        .style('stroke-dasharray', '2,4')
        .style('opacity', 0.5);

      // Remove domain line
      svg.select('.grid .domain').remove();
    }

    // X-axis
    const xAxis = svg
      .append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(d3.timeMonth.every(1))
          .tickFormat((d) => d3.timeFormat('%b %y')(d as Date))
      );

    xAxis
      .selectAll('text')
      .attr('transform', 'rotate(-40)')
      .style('text-anchor', 'end')
      .style('font-size', '11px')
      .style('font-weight', '500')
      .style('fill', '#6B7280');

    xAxis.select('.domain').style('stroke', '#D1D5DB');
    xAxis.selectAll('line').style('stroke', '#D1D5DB');

    // Y-axis
    const yAxis = svg
      .append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(6)
          .tickFormat((d) => `$${(d as number / 1000).toFixed(0)}k`)
      );

    yAxis
      .selectAll('text')
      .style('font-size', '11px')
      .style('font-weight', '500')
      .style('fill', '#6B7280');

    yAxis.select('.domain').style('stroke', '#D1D5DB');
    yAxis.selectAll('line').style('stroke', '#D1D5DB');

    // Area generators
    const incomeArea = d3
      .area<typeof formattedData[0]>()
      .x((d) => xScale(d.date))
      .y0(chartHeight)
      .y1((d) => yScale(d.income))
      .curve(d3.curveMonotoneX);

    const expenseArea = d3
      .area<typeof formattedData[0]>()
      .x((d) => xScale(d.date))
      .y0(chartHeight)
      .y1((d) => yScale(d.expenses))
      .curve(d3.curveMonotoneX);

    // Draw areas
    svg
      .append('path')
      .datum(formattedData)
      .attr('fill', 'url(#income-gradient)')
      .attr('d', incomeArea);

    svg
      .append('path')
      .datum(formattedData)
      .attr('fill', 'url(#expense-gradient)')
      .attr('d', expenseArea);

    // Line generators
    const incomeLine = d3
      .line<typeof formattedData[0]>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.income))
      .curve(d3.curveMonotoneX);

    const expenseLine = d3
      .line<typeof formattedData[0]>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.expenses))
      .curve(d3.curveMonotoneX);

    // Draw lines with animation
    const incomeLinePath = svg
      .append('path')
      .datum(formattedData)
      .attr('fill', 'none')
      .attr('stroke', '#10B981')
      .attr('stroke-width', 3)
      .attr('stroke-linecap', 'round')
      .attr('d', incomeLine);

    const expenseLinePath = svg
      .append('path')
      .datum(formattedData)
      .attr('fill', 'none')
      .attr('stroke', '#EF4444')
      .attr('stroke-width', 3)
      .attr('stroke-linecap', 'round')
      .attr('d', expenseLine);

    // Animate line drawing
    const animateLine = (path: d3.Selection<SVGPathElement, any, any, any>) => {
      const totalLength = path.node()?.getTotalLength() || 0;
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(1500)
        .ease(d3.easeQuadInOut)
        .attr('stroke-dashoffset', 0);
    };

    animateLine(incomeLinePath as any);
    animateLine(expenseLinePath as any);

    // Tooltip
    const tooltip = d3.select(tooltipRef.current);

    if (interactive) {
      // Income dots
      svg
        .selectAll('.income-dot')
        .data(formattedData)
        .enter()
        .append('circle')
        .attr('class', 'income-dot')
        .attr('cx', (d) => xScale(d.date))
        .attr('cy', (d) => yScale(d.income))
        .attr('r', 0)
        .attr('fill', '#10B981')
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .style('opacity', 0)
        .transition()
        .delay((d, i) => i * 50)
        .duration(300)
        .attr('r', 5)
        .style('opacity', 1);

      // Add hover interactions
      svg
        .selectAll('.income-dot')
        .on('mouseover', function (event, d: any) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 8)
            .style('filter', 'drop-shadow(0 4px 6px rgba(16, 185, 129, 0.4))');

          tooltip
            .style('display', 'block')
            .html(
              `
              <div class="font-semibold text-gray-900 mb-1">${d3.timeFormat('%B %Y')(d.date)}</div>
              <div class="space-y-0.5">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span class="text-emerald-700 font-semibold">Income: $${d.income.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-red-500"></div>
                  <span class="text-red-700 font-semibold">Expenses: $${d.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="pt-1 border-t border-gray-200">
                  <span class="text-gray-700 font-semibold">Net: <span class="${d.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}">$${d.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></span>
                </div>
              </div>
            `
            )
            .style('left', `${event.pageX + 15}px`)
            .style('top', `${event.pageY - 15}px`);

          setHoveredPoint(d);
        })
        .on('mouseout', function () {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 5)
            .style('filter', 'none');

          tooltip.style('display', 'none');
          setHoveredPoint(null);
        });

      // Expense dots
      svg
        .selectAll('.expense-dot')
        .data(formattedData)
        .enter()
        .append('circle')
        .attr('class', 'expense-dot')
        .attr('cx', (d) => xScale(d.date))
        .attr('cy', (d) => yScale(d.expenses))
        .attr('r', 0)
        .attr('fill', '#EF4444')
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .style('opacity', 0)
        .transition()
        .delay((d, i) => i * 50)
        .duration(300)
        .attr('r', 5)
        .style('opacity', 1);

      svg
        .selectAll('.expense-dot')
        .on('mouseover', function (event, d: any) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 8)
            .style('filter', 'drop-shadow(0 4px 6px rgba(239, 68, 68, 0.4))');

          tooltip
            .style('display', 'block')
            .html(
              `
              <div class="font-semibold text-gray-900 mb-1">${d3.timeFormat('%B %Y')(d.date)}</div>
              <div class="space-y-0.5">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span class="text-emerald-700 font-semibold">Income: $${d.income.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-red-500"></div>
                  <span class="text-red-700 font-semibold">Expenses: $${d.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="pt-1 border-t border-gray-200">
                  <span class="text-gray-700 font-semibold">Net: <span class="${d.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}">$${d.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></span>
                </div>
              </div>
            `
            )
            .style('left', `${event.pageX + 15}px`)
            .style('top', `${event.pageY - 15}px`);

          setHoveredPoint(d);
        })
        .on('mouseout', function () {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 5)
            .style('filter', 'none');

          tooltip.style('display', 'none');
          setHoveredPoint(null);
        });
    }

    // Legend
    if (showLegend) {
      const legend = svg
        .append('g')
        .attr('transform', `translate(${width - 90}, 0)`);

      // Income legend
      legend
        .append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', 30)
        .attr('height', 3)
        .attr('fill', '#10B981')
        .attr('rx', 2);

      legend
        .append('text')
        .attr('x', 35)
        .attr('y', 4)
        .text('Income')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('fill', '#374151');

      // Expense legend
      legend
        .append('rect')
        .attr('x', 0)
        .attr('y', 18)
        .attr('width', 30)
        .attr('height', 3)
        .attr('fill', '#EF4444')
        .attr('rx', 2);

      legend
        .append('text')
        .attr('x', 35)
        .attr('y', 22)
        .text('Expenses')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('fill', '#374151');
    }
  }, [data, height, showLegend, showGrid, interactive]);

  return (
    <div className={cn('bg-white rounded-2xl shadow-lg border border-gray-200 p-6', className)}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <div className="flex items-center gap-4">
            {/* Quick stats */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span className="text-gray-600">Avg:</span>
                <span className="font-semibold text-emerald-700">
                  ${avgIncome.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-red-600" />
                <span className="text-gray-600">Avg:</span>
                <span className="font-semibold text-red-700">
                  ${avgExpenses.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Net profit indicator */}
        <div className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold',
          netProfit >= 0
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        )}>
          {netProfit >= 0 ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          <span>
            Net: ${netProfit.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative">
        <svg ref={svgRef} className="w-full" />
        <div
          ref={tooltipRef}
          className="absolute bg-white border border-gray-300 rounded-xl shadow-2xl p-3 text-sm pointer-events-none z-50"
          style={{ display: 'none' }}
        />
      </div>

      {/* Empty state */}
      {data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Info className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">No data available</p>
          <p className="text-xs mt-1">Select a date range to view trends</p>
        </div>
      )}
    </div>
  );
};
