import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export interface IncomeExpenseData {
  month: string; // e.g., "2024-01" or "Jan 2024"
  income: number;
  expenses: number;
}

interface IncomeExpenseChartProps {
  data: IncomeExpenseData[];
}

const IncomeExpenseChart: React.FC<IncomeExpenseChartProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Dimensions
    const margin = { top: 20, right: 80, bottom: 40, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates and format for display
    const parseDate = (dateStr: string) => {
      // Handle both "2024-01" and "Jan 2024" formats
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
    }));

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(formattedData, (d) => d.date) as [Date, Date])
      .range([0, width]);

    const maxValue = d3.max(formattedData, (d) => Math.max(d.income, d.expenses)) || 0;
    const yScale = d3
      .scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([height, 0])
      .nice();

    // X-axis
    svg
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(d3.timeMonth.every(1))
          .tickFormat((d) => d3.timeFormat('%b %y')(d as Date))
      )
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')
      .style('font-size', '11px')
      .style('fill', '#6B7280');

    // Y-axis
    svg
      .append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(6)
          .tickFormat((d) => `$${(d as number / 1000).toFixed(0)}k`)
      )
      .selectAll('text')
      .style('font-size', '11px')
      .style('fill', '#6B7280');

    // Grid lines
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
      .style('stroke-dasharray', '3,3');

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

    // Income line
    svg
      .append('path')
      .datum(formattedData)
      .attr('fill', 'none')
      .attr('stroke', '#10B981')
      .attr('stroke-width', 3)
      .attr('d', incomeLine);

    // Expenses line
    svg
      .append('path')
      .datum(formattedData)
      .attr('fill', 'none')
      .attr('stroke', '#EF4444')
      .attr('stroke-width', 3)
      .attr('d', expenseLine);

    // Tooltip
    const tooltip = d3.select(tooltipRef.current);

    // Income dots
    svg
      .selectAll('.income-dot')
      .data(formattedData)
      .enter()
      .append('circle')
      .attr('class', 'income-dot')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(d.income))
      .attr('r', 5)
      .attr('fill', '#10B981')
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).attr('r', 7);
        tooltip
          .style('display', 'block')
          .html(
            `
            <div class="font-semibold text-gray-900">${d3.timeFormat('%B %Y')(d.date)}</div>
            <div class="text-green-600">Income: $${d.income.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</div>
          `
          )
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`);
      })
      .on('mouseout', function () {
        d3.select(this).attr('r', 5);
        tooltip.style('display', 'none');
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
      .attr('r', 5)
      .attr('fill', '#EF4444')
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).attr('r', 7);
        tooltip
          .style('display', 'block')
          .html(
            `
            <div class="font-semibold text-gray-900">${d3.timeFormat('%B %Y')(d.date)}</div>
            <div class="text-red-600">Expenses: $${d.expenses.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</div>
          `
          )
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`);
      })
      .on('mouseout', function () {
        d3.select(this).attr('r', 5);
        tooltip.style('display', 'none');
      });

    // Legend
    const legend = svg
      .append('g')
      .attr('transform', `translate(${width - 60}, 0)`);

    legend
      .append('line')
      .attr('x1', 0)
      .attr('x2', 30)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#10B981')
      .attr('stroke-width', 3);

    legend
      .append('text')
      .attr('x', 35)
      .attr('y', 4)
      .text('Income')
      .style('font-size', '12px')
      .style('fill', '#374151');

    legend
      .append('line')
      .attr('x1', 0)
      .attr('x2', 30)
      .attr('y1', 20)
      .attr('y2', 20)
      .attr('stroke', '#EF4444')
      .attr('stroke-width', 3);

    legend
      .append('text')
      .attr('x', 35)
      .attr('y', 24)
      .text('Expenses')
      .style('font-size', '12px')
      .style('fill', '#374151');
  }, [data]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Income vs Expenses Over Time</h3>
      <div className="relative">
        <svg ref={svgRef} className="w-full" />
        <div
          ref={tooltipRef}
          className="absolute bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm pointer-events-none"
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
};

export default IncomeExpenseChart;
