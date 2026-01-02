import React, { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';

export interface TrendDataPoint {
  month: string; // YYYY-MM format
  value: number;
}

export interface TrendLine {
  category: 'PM' | 'Arbitrage' | 'Owned';
  data: TrendDataPoint[];
}

interface TrendLineChartProps {
  data: TrendLine[];
  width?: number;
  height?: number;
  className?: string;
}

const TrendLineChart: React.FC<TrendLineChartProps> = ({
  data,
  width = 800,
  height = 400,
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Category colors
  const categoryColors = {
    PM: '#3B82F6', // blue-500
    Arbitrage: '#F97316', // orange-500
    Owned: '#10B981', // green-500
  };

  // Format functions
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Responsive width
  const [chartWidth, setChartWidth] = React.useState(width);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setChartWidth(containerRef.current.clientWidth);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Margins
    const margin = { top: 20, right: 120, bottom: 60, left: 60 };
    const chartHeight = height - margin.top - margin.bottom;
    const innerWidth = chartWidth - margin.left - margin.right;

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr('width', chartWidth)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get all unique months across all categories
    const allMonths = Array.from(
      new Set(
        data.flatMap(line => line.data.map(d => d.month))
      )
    ).sort();

    // X Scale
    const xScale = d3
      .scalePoint()
      .domain(allMonths)
      .range([0, innerWidth])
      .padding(0.1);

    // Y Scale
    const allValues = data.flatMap(line => line.data.map(d => d.value));
    const yMin = Math.min(0, d3.min(allValues) || 0);
    const yMax = d3.max(allValues) || 0;
    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([chartHeight, 0])
      .nice();

    // X Axis
    svg
      .append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(xScale).tickFormat(d => formatMonth(d as string)))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')
      .style('font-size', '11px')
      .style('fill', '#6B7280');

    // Y Axis
    svg
      .append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(6)
          .tickFormat(d => formatCurrency(d as number))
      )
      .selectAll('text')
      .style('font-size', '11px')
      .style('fill', '#6B7280');

    // Add grid lines
    svg
      .append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(
        d3
          .axisLeft(yScale)
          .ticks(6)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .style('stroke', '#9CA3AF');

    // Line generator
    const line = d3
      .line<TrendDataPoint>()
      .x(d => xScale(d.month) || 0)
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Draw lines for each category
    data.forEach(trendLine => {
      const color = categoryColors[trendLine.category];

      // Draw line
      svg
        .append('path')
        .datum(trendLine.data)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2.5)
        .attr('d', line)
        .style('opacity', 0)
        .transition()
        .duration(800)
        .style('opacity', 1);

      // Draw dots
      svg
        .selectAll(`.dot-${trendLine.category}`)
        .data(trendLine.data)
        .join('circle')
        .attr('class', `dot-${trendLine.category}`)
        .attr('cx', d => xScale(d.month) || 0)
        .attr('cy', d => yScale(d.value))
        .attr('r', 0)
        .attr('fill', color)
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .transition()
        .duration(800)
        .attr('r', 4);

      // Add tooltips to dots
      svg
        .selectAll(`.dot-${trendLine.category}`)
        .on('mouseenter', function(event, datum) {
          const d = datum as TrendDataPoint;
          // Enlarge dot
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 6);

          // Create tooltip
          const tooltip = svg
            .append('g')
            .attr('class', 'tooltip')
            .attr('transform', `translate(${xScale(d.month)},${yScale(d.value) - 20})`);

          tooltip
            .append('rect')
            .attr('x', -50)
            .attr('y', -35)
            .attr('width', 100)
            .attr('height', 30)
            .attr('fill', '#1F2937')
            .attr('rx', 4)
            .style('opacity', 0)
            .transition()
            .duration(200)
            .style('opacity', 0.95);

          tooltip
            .append('text')
            .attr('x', 0)
            .attr('y', -20)
            .attr('text-anchor', 'middle')
            .attr('fill', 'white')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .text(formatCurrency(d.value))
            .style('opacity', 0)
            .transition()
            .duration(200)
            .style('opacity', 1);
        })
        .on('mouseleave', function() {
          // Restore dot size
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 4);

          // Remove tooltip
          svg.selectAll('.tooltip').remove();
        });
    });

    // Legend
    const legend = svg
      .append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${innerWidth + 20}, 0)`);

    data.forEach((trendLine, index) => {
      const legendRow = legend
        .append('g')
        .attr('transform', `translate(0, ${index * 25})`);

      legendRow
        .append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', categoryColors[trendLine.category])
        .attr('rx', 2);

      legendRow
        .append('text')
        .attr('x', 18)
        .attr('y', 10)
        .text(trendLine.category)
        .style('font-size', '12px')
        .style('font-weight', '500')
        .style('fill', '#374151');
    });

    // Zero line (if there are negative values)
    if (yMin < 0) {
      svg
        .append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(0))
        .attr('y2', yScale(0))
        .attr('stroke', '#DC2626')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .style('opacity', 0.5);
    }

  }, [data, chartWidth, height]);

  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`} style={{ height }}>
        <p className="text-gray-500 text-sm">No data available</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className}>
      <svg ref={svgRef} style={{ width: '100%', height }}></svg>
    </div>
  );
};

export default TrendLineChart;
