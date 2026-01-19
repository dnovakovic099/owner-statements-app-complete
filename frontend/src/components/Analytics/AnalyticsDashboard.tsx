import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  Percent,
  FileText,
  Calendar,
  ChevronDown,
  BarChart3,
  PieChart,
  Building2,
  RefreshCw,
  Home,
  AlertTriangle,
  Users,
  Download,
  FileSpreadsheet,
  Printer
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { useAnalyticsSummary } from './hooks/useAnalyticsSummary';
import { useRevenueTrend } from './hooks/useRevenueTrend';
import { useExpenseBreakdown } from './hooks/useExpenseBreakdown';
import { usePropertyPerformance } from './hooks/usePropertyPerformance';
import { useMonthlyComparison, MonthlyComparisonDataPoint } from './hooks/useMonthlyComparison';
import { useOwnerBreakdown, OwnerData } from './hooks/useOwnerBreakdown';
import { useStatementStatus } from './hooks/useStatementStatus';
import { useRecentStatements } from './hooks/useRecentStatements';
import { useAnalyticsFilters } from './hooks/useAnalyticsFilters';
import { usePayoutTrend } from './hooks/usePayoutTrend';

interface AnalyticsDashboardProps {
  onBack?: () => void;
}

// Compact KPI Card Component
const KPICard: React.FC<{
  title: string;
  value: string;
  change?: number;
  previousValue?: string;
  icon: React.ReactNode;
  loading?: boolean;
}> = ({ title, value, change, previousValue, icon, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 bg-gray-200 rounded" />
          <div className="h-8 w-8 bg-gray-200 rounded" />
        </div>
        <div className="mt-2 h-7 w-24 bg-gray-200 rounded" />
        <div className="mt-1 h-4 w-16 bg-gray-200 rounded" />
      </div>
    );
  }

  const isPositive = change !== undefined && change >= 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</span>
        <div className="p-1.5 bg-gray-50 rounded-md text-gray-400">
          {icon}
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      <div className="mt-1 flex items-center gap-2">
        {change !== undefined && (
          <span className={`inline-flex items-center text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
            {isPositive ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
        {previousValue && (
          <span className="text-xs text-gray-400">vs {previousValue}</span>
        )}
      </div>
    </div>
  );
};

// Searchable Dropdown Component
interface DropdownOption {
  id: string | number;
  name: string;
}

const FilterDropdown: React.FC<{
  label: string;
  options: DropdownOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}> = ({ label, options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.id.toString() === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
          value
            ? 'bg-blue-50 text-blue-700 border border-blue-200'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        <span className="truncate max-w-[100px]">
          {selectedOption ? selectedOption.name : label}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto">
          <div
            onClick={() => {
              onChange(undefined);
              setIsOpen(false);
            }}
            className={`px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm ${
              !value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
            }`}
          >
            All {label}
          </div>
          {options.map((option) => (
            <div
              key={option.id}
              onClick={() => {
                onChange(option.id.toString());
                setIsOpen(false);
              }}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm truncate ${
                value === option.id.toString() ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              }`}
            >
              {option.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onBack }) => {
  // Date presets
  const getDateRange = (preset: string): { start: string; end: string } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (preset) {
      case 'daily': {
        // Today only
        const start = today.toISOString().split('T')[0];
        return { start, end: start };
      }
      case 'weekly': {
        // Current week (Sunday to today)
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        return {
          start: startOfWeek.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0],
        };
      }
      case 'monthly': {
        // Current month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          start: startOfMonth.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0],
        };
      }
      case 'quarterly': {
        // Current quarter
        const quarter = Math.floor(now.getMonth() / 3);
        const startOfQuarter = new Date(now.getFullYear(), quarter * 3, 1);
        return {
          start: startOfQuarter.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0],
        };
      }
      case 'yearly': {
        // Current year
        return {
          start: `${now.getFullYear()}-01-01`,
          end: today.toISOString().split('T')[0],
        };
      }
      case 'alltime': {
        // All time - go back 10 years to capture everything
        return {
          start: '2020-01-01',
          end: today.toISOString().split('T')[0],
        };
      }
      case 'custom': {
        // For custom, return default month range (actual dates set by date pickers)
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          start: startOfMonth.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0],
        };
      }
      default:
        // Default to current month
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
          end: today.toISOString().split('T')[0],
        };
    }
  };

  const getPreviousPeriod = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diff = endDate.getTime() - startDate.getTime();
    const prevEnd = new Date(startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diff);
    return {
      start: prevStart.toISOString().split('T')[0],
      end: prevEnd.toISOString().split('T')[0],
    };
  };

  // State
  const [selectedPeriod, setSelectedPeriod] = useState('monthly');
  const [dateRange, setDateRange] = useState(getDateRange('monthly'));
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('week');
  const [payoutGranularity, setPayoutGranularity] = useState<'day' | 'week' | 'month'>('week');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | undefined>(undefined);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(undefined);
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(undefined);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const previousPeriod = getPreviousPeriod(dateRange.start, dateRange.end);

  // Export handlers
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const authData = localStorage.getItem('luxury-lodging-auth');
      const token = authData ? JSON.parse(authData).token : null;

      const response = await fetch(
        `/api/analytics/export?startDate=${dateRange.start}&endDate=${dateRange.end}&format=csv`,
        {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
          },
        }
      );

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-export-${dateRange.start}-to-${dateRange.end}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
      setShowExportMenu(false);
    }
  };

  const handleExportExcel = async () => {
    // Excel can open CSV files, so we use the same endpoint
    await handleExportCSV();
  };

  const handleExportPDF = async () => {
    setShowExportMenu(false);
    setIsExporting(true);

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      // Helper function to add new page if needed
      const checkNewPage = (neededHeight: number) => {
        if (yPos + neededHeight > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
          return true;
        }
        return false;
      };

      // === HEADER ===
      pdf.setFillColor(51, 65, 85); // slate-700
      pdf.rect(0, 0, pageWidth, 35, 'F');

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(22);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Analytics Report', margin, 18);

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Period: ${dateRange.start} to ${dateRange.end}`, margin, 28);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin - 45, 28);

      yPos = 45;

      // === METRICS BAR ===
      pdf.setTextColor(51, 65, 85);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Financial Overview', margin, yPos);
      yPos += 8;

      const metricsData = [
        ['Base Rate', 'Guest Fees', 'Platform Fees', 'Revenue', 'PM Commission', 'Tax', 'Gross Payout'],
        [
          formatFullCurrency(kpiData.baseRate),
          formatFullCurrency(kpiData.guestFees),
          formatFullCurrency(kpiData.platformFees),
          formatFullCurrency(kpiData.revenue),
          formatFullCurrency(kpiData.pmCommission),
          formatFullCurrency(kpiData.taxes),
          formatFullCurrency(kpiData.grossPayout)
        ]
      ];

      autoTable(pdf, {
        startY: yPos,
        head: [metricsData[0]],
        body: [metricsData[1]],
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 8, halign: 'center' },
        bodyStyles: { fontSize: 10, halign: 'center', fontStyle: 'bold' },
        margin: { left: margin, right: margin },
      });

      yPos = (pdf as any).lastAutoTable.finalY + 12;

      // === KPI CARDS ===
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Key Performance Indicators', margin, yPos);
      yPos += 8;

      const kpiTableData = [
        ['Total Revenue', 'Net Income', 'Total Expenses', 'Statements'],
        [
          formatFullCurrency(kpiData.revenue),
          formatFullCurrency(kpiData.netIncome),
          formatFullCurrency(kpiData.expenses),
          kpiData.statementCount.toString()
        ],
        ['Avg Payout', 'Reservations', 'Properties', 'Negative Payouts'],
        [
          formatFullCurrency(kpiData.avgPayoutPerStatement),
          kpiData.reservationCount.toString(),
          kpiData.propertyCount.toString(),
          kpiData.negativePayoutCount.toString()
        ]
      ];

      autoTable(pdf, {
        startY: yPos,
        head: [kpiTableData[0]],
        body: [kpiTableData[1]],
        theme: 'grid',
        headStyles: { fillColor: [100, 116, 139], textColor: 255, fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 11, halign: 'center', fontStyle: 'bold' },
        margin: { left: margin, right: margin },
      });

      yPos = (pdf as any).lastAutoTable.finalY + 3;

      autoTable(pdf, {
        startY: yPos,
        head: [kpiTableData[2]],
        body: [kpiTableData[3]],
        theme: 'grid',
        headStyles: { fillColor: [100, 116, 139], textColor: 255, fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 11, halign: 'center', fontStyle: 'bold' },
        margin: { left: margin, right: margin },
      });

      yPos = (pdf as any).lastAutoTable.finalY + 12;

      // === CHARTS SECTION ===
      checkNewPage(100);

      // Capture Revenue Trend Chart
      const revenueChartEl = document.querySelector('[data-chart="revenue-trend"]');
      if (revenueChartEl) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Revenue Trend', margin, yPos);
        yPos += 5;

        try {
          const canvas = await html2canvas(revenueChartEl as HTMLElement, { scale: 2, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - (margin * 2);
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          checkNewPage(imgHeight + 10);
          pdf.addImage(imgData, 'PNG', margin, yPos, imgWidth, Math.min(imgHeight, 60));
          yPos += Math.min(imgHeight, 60) + 10;
        } catch (e) {
          console.error('Failed to capture revenue chart:', e);
        }
      }

      // === PROPERTY PERFORMANCE TABLE ===
      checkNewPage(60);

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Property Performance', margin, yPos);
      yPos += 8;

      if (propertyData?.properties && propertyData.properties.length > 0) {
        const propertyTableHead = ['Property', 'Revenue', 'Expenses', 'Net Income', 'Bookings'];
        const propertyTableBody = propertyData.properties.slice(0, 10).map((p: any) => [
          p.propertyName?.substring(0, 25) || 'Unknown',
          formatFullCurrency(p.totalRevenue),
          formatFullCurrency(p.totalExpenses),
          formatFullCurrency(p.netIncome),
          p.bookings?.toString() || '0'
        ]);

        autoTable(pdf, {
          startY: yPos,
          head: [propertyTableHead],
          body: propertyTableBody,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 9 },
          bodyStyles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 60 },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'center' }
          },
          margin: { left: margin, right: margin },
        });

        yPos = (pdf as any).lastAutoTable.finalY + 12;
      }

      // === OWNER BREAKDOWN TABLE ===
      checkNewPage(60);

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Owner Breakdown', margin, yPos);
      yPos += 8;

      if (ownerData && ownerData.length > 0) {
        const ownerTableHead = ['Owner', 'Revenue', 'Payout', 'PM Commission', 'Statements'];
        const ownerTableBody = ownerData.slice(0, 10).map((o: OwnerData) => [
          o.ownerName?.substring(0, 25) || 'Unknown',
          formatFullCurrency(o.totalRevenue),
          formatFullCurrency(o.ownerPayout),
          formatFullCurrency(o.pmCommission),
          o.statementCount?.toString() || '0'
        ]);

        autoTable(pdf, {
          startY: yPos,
          head: [ownerTableHead],
          body: ownerTableBody,
          theme: 'striped',
          headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 9 },
          bodyStyles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 60 },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'center' },
            4: { halign: 'center' }
          },
          margin: { left: margin, right: margin },
        });

        yPos = (pdf as any).lastAutoTable.finalY + 12;
      }

      // === RECENT STATEMENTS TABLE ===
      checkNewPage(60);

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Recent Statements', margin, yPos);
      yPos += 8;

      if (recentStatementsData && recentStatementsData.length > 0) {
        const statementsTableHead = ['Property', 'Period', 'Revenue', 'Payout', 'Status'];
        const statementsTableBody = recentStatementsData.slice(0, 15).map((s: any) => [
          s.propertyName?.substring(0, 25) || 'Unknown',
          `${s.weekStartDate} - ${s.weekEndDate}`,
          formatFullCurrency(s.totalRevenue),
          formatFullCurrency(s.ownerPayout),
          s.status || 'draft'
        ]);

        autoTable(pdf, {
          startY: yPos,
          head: [statementsTableHead],
          body: statementsTableBody,
          theme: 'striped',
          headStyles: { fillColor: [139, 92, 246], textColor: 255, fontSize: 9 },
          bodyStyles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 45 },
            1: { cellWidth: 45 },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'center' }
          },
          margin: { left: margin, right: margin },
        });
      }

      // === FOOTER ===
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(128, 128, 128);
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
        pdf.text('Luxury Lodging Analytics', margin, pageHeight - 8);
      }

      // Save the PDF
      const fileName = `analytics-report-${dateRange.start}-to-${dateRange.end}.pdf`;
      pdf.save(fileName);

    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Fetch filter options
  const { data: filtersData, loading: filtersLoading } = useAnalyticsFilters();

  // Fetch data
  const { data: summaryData, loading: summaryLoading, refetch: refetchSummary } = useAnalyticsSummary({
    startDate: dateRange.start,
    endDate: dateRange.end,
    compareStart: previousPeriod.start,
    compareEnd: previousPeriod.end,
    ownerId: selectedOwnerId,
    propertyId: selectedPropertyId,
  });

  const { data: trendData, loading: trendLoading } = useRevenueTrend({
    startDate: dateRange.start,
    endDate: dateRange.end,
    granularity: granularity,
    ownerId: selectedOwnerId,
    propertyId: selectedPropertyId,
  });

  const { data: payoutTrendData, loading: payoutTrendLoading } = usePayoutTrend({
    startDate: dateRange.start,
    endDate: dateRange.end,
    granularity: payoutGranularity,
  });

  const { data: expenseData, loading: expenseLoading } = useExpenseBreakdown({
    startDate: dateRange.start,
    endDate: dateRange.end,
    ownerId: selectedOwnerId,
    propertyId: selectedPropertyId,
  });

  const { data: propertyData, loading: propertyLoading } = usePropertyPerformance({
    startDate: dateRange.start,
    endDate: dateRange.end,
    sortBy: 'revenue',
    ownerId: selectedOwnerId,
    propertyId: selectedPropertyId,
  });

  const { data: monthlyComparisonData, loading: monthlyComparisonLoading } = useMonthlyComparison({
    months: 6,
  });

  const { data: ownerData, loading: ownerLoading } = useOwnerBreakdown({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  const { data: statementStatusData, loading: statementStatusLoading } = useStatementStatus({
    startDate: dateRange.start,
    endDate: dateRange.end,
    ownerId: selectedOwnerId,
    propertyId: selectedPropertyId,
    groupId: selectedGroupId,
  });

  const { data: recentStatementsData, loading: recentStatementsLoading } = useRecentStatements({
    startDate: dateRange.start,
    endDate: dateRange.end,
    ownerId: selectedOwnerId,
    propertyId: selectedPropertyId,
    groupId: selectedGroupId,
  });

  // Format currency
  const formatCurrency = (amount: number | null | undefined) => {
    const val = amount || 0;
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(0)}`;
  };

  const formatFullCurrency = (amount: number | null | undefined) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  // KPI data - map API response fields to display fields
  const kpiData = useMemo(() => {
    if (!summaryData) {
      return {
        baseRate: 0, previousBaseRate: 0, baseRateChange: 0,
        guestFees: 0, previousGuestFees: 0, guestFeesChange: 0,
        platformFees: 0, previousPlatformFees: 0, platformFeesChange: 0,
        revenue: 0, previousRevenue: 0, revenueChange: 0,
        pmCommission: 0, previousPmCommission: 0, pmCommissionChange: 0,
        taxes: 0, previousTaxes: 0, taxesChange: 0,
        grossPayout: 0, previousGrossPayout: 0, grossPayoutChange: 0,
        expenses: 0, previousExpenses: 0, expensesChange: 0,
        netIncome: 0, previousNetIncome: 0, netIncomeChange: 0,
        statementCount: 0, previousStatementCount: 0,
        avgPayoutPerStatement: 0, previousAvgPayoutPerStatement: 0, avgPayoutPerStatementChange: 0,
        reservationCount: 0, previousReservationCount: 0, reservationCountChange: 0,
        propertyCount: 0, previousPropertyCount: 0, propertyCountChange: 0,
        negativePayoutCount: 0, previousNegativePayoutCount: 0, negativePayoutCountChange: 0,
      };
    }

    const data = summaryData as any;
    const current = data.current || {};
    const previous = data.previous || {};
    const pctChange = data.percentChange || {};

    return {
      // Base Rate (accommodation)
      baseRate: current.baseRate ?? 0,
      previousBaseRate: previous?.baseRate ?? 0,
      baseRateChange: pctChange.baseRate ?? 0,
      // Guest Fees
      guestFees: current.guestFees ?? 0,
      previousGuestFees: previous?.guestFees ?? 0,
      guestFeesChange: pctChange.guestFees ?? 0,
      // Platform Fees
      platformFees: current.platformFees ?? 0,
      previousPlatformFees: previous?.platformFees ?? 0,
      platformFeesChange: pctChange.platformFees ?? 0,
      // Revenue
      revenue: current.totalRevenue ?? 0,
      previousRevenue: previous?.totalRevenue ?? 0,
      revenueChange: pctChange.totalRevenue ?? 0,
      // PM Commission
      pmCommission: current.pmCommission ?? 0,
      previousPmCommission: previous?.pmCommission ?? 0,
      pmCommissionChange: pctChange.pmCommission ?? 0,
      // Taxes
      taxes: current.taxes ?? 0,
      previousTaxes: previous?.taxes ?? 0,
      taxesChange: pctChange.taxes ?? 0,
      // Gross Payout
      grossPayout: current.grossPayout ?? 0,
      previousGrossPayout: previous?.grossPayout ?? 0,
      grossPayoutChange: pctChange.grossPayout ?? 0,
      // Expenses
      expenses: current.totalExpenses ?? 0,
      previousExpenses: previous?.totalExpenses ?? 0,
      expensesChange: pctChange.totalExpenses ?? 0,
      // Net Income (Owner Payout)
      netIncome: current.ownerPayout ?? 0,
      previousNetIncome: previous?.ownerPayout ?? 0,
      netIncomeChange: pctChange.ownerPayout ?? 0,
      // Statement count
      statementCount: current.statementCount ?? 0,
      previousStatementCount: previous?.statementCount ?? 0,
      // Avg Payout per Statement
      avgPayoutPerStatement: current.avgPayoutPerStatement ?? 0,
      previousAvgPayoutPerStatement: previous?.avgPayoutPerStatement ?? 0,
      avgPayoutPerStatementChange: pctChange.avgPayoutPerStatement ?? 0,
      // Reservation Count
      reservationCount: current.reservationCount ?? 0,
      previousReservationCount: previous?.reservationCount ?? 0,
      reservationCountChange: pctChange.reservationCount ?? 0,
      // Property Count
      propertyCount: current.propertyCount ?? 0,
      previousPropertyCount: previous?.propertyCount ?? 0,
      propertyCountChange: pctChange.propertyCount ?? 0,
      // Negative Payout Count
      negativePayoutCount: current.negativePayoutCount ?? 0,
      previousNegativePayoutCount: previous?.negativePayoutCount ?? 0,
      negativePayoutCountChange: pctChange.negativePayoutCount ?? 0,
    };
  }, [summaryData]);

  // Revenue trend chart options
  const trendChartOption = useMemo(() => {
    const raw = trendData as any;
    const trends = Array.isArray(raw) ? raw : (raw?.trends || raw?.data || []);
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'white',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: '#374151', fontSize: 12 },
        formatter: (params: any) => {
          const data = params[0];
          return `<div class="font-medium">${data.name}</div>
                  <div class="text-gray-500">Revenue: ${formatFullCurrency(data.value)}</div>`;
        },
      },
      grid: { top: 20, right: 20, bottom: 30, left: 50 },
      xAxis: {
        type: 'category',
        data: trends.map((t: any) => t.period),
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#6b7280', fontSize: 11 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          formatter: (value: number) => formatCurrency(value),
        },
      },
      series: [{
        type: 'line',
        data: trends.map((t: any) => t.revenue),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.15)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0)' },
            ],
          },
        },
      }],
    };
  }, [trendData]);

  // Payout trend chart options
  const payoutTrendChartOption = useMemo(() => {
    const trends = payoutTrendData || [];
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'white',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: '#374151', fontSize: 12 },
        formatter: (params: any) => {
          const data = params[0];
          return `<div class="font-medium">${data.name}</div>
                  <div class="text-gray-500">Payout: ${formatFullCurrency(data.value)}</div>`;
        },
      },
      grid: { top: 20, right: 20, bottom: 30, left: 50 },
      xAxis: {
        type: 'category',
        data: trends.map((t: any) => t.period),
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#6b7280', fontSize: 11 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          formatter: (value: number) => formatCurrency(value),
        },
      },
      series: [{
        type: 'line',
        data: trends.map((t: any) => t.payout),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#10b981', width: 2 },
        itemStyle: { color: '#10b981' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.15)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0)' },
            ],
          },
        },
      }],
    };
  }, [payoutTrendData]);

  // Expense breakdown chart options
  const expenseChartOption = useMemo(() => {
    // API returns array directly or { categories: [...] }
    const raw = expenseData as any;
    const categories = Array.isArray(raw) ? raw : (raw?.categories || raw?.data || []);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'white',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: '#374151', fontSize: 12 },
        formatter: (params: any) => {
          return `<div class="font-medium">${params.name}</div>
                  <div class="text-gray-500">${formatFullCurrency(params.value)} (${params.percent}%)</div>`;
        },
      },
      series: [{
        type: 'pie',
        radius: ['55%', '80%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: categories.map((c: any, i: number) => ({
          name: c.category,
          value: c.amount,
          itemStyle: { color: colors[i % colors.length] },
        })),
      }],
    };
  }, [expenseData]);

  // Statement status donut chart options
  const statementStatusChartOption = useMemo(() => {
    const statusColors: { [key: string]: string } = {
      draft: '#f59e0b',    // Yellow
      sent: '#10b981',     // Green
      modified: '#3b82f6', // Blue
    };

    const statusLabels: { [key: string]: string } = {
      draft: 'Draft',
      sent: 'Sent',
      modified: 'Modified',
    };

    const data = (statementStatusData || []).map((item: any) => ({
      name: statusLabels[item.status] || item.status,
      value: item.count,
      itemStyle: { color: statusColors[item.status] || '#6b7280' },
    }));

    const total = data.reduce((sum: number, item: any) => sum + item.value, 0);

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'white',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: '#374151', fontSize: 12 },
        formatter: (params: any) => {
          return `<div class="font-medium">${params.name}</div>
                  <div class="text-gray-500">${params.value} statements (${params.percent}%)</div>`;
        },
      },
      graphic: {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: total.toString(),
          fontSize: 24,
          fontWeight: 'bold',
          textAlign: 'center',
          fill: '#374151',
        },
      },
      series: [{
        type: 'pie',
        radius: ['55%', '80%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: data,
      }],
    };
  }, [statementStatusData]);

  // Property performance data
  const propertyChartData = useMemo(() => {
    // API returns array directly or { properties: [...] }
    const raw = propertyData as any;
    const properties = Array.isArray(raw) ? raw : (raw?.properties || raw?.data || []);
    return properties.slice(0, 10);
  }, [propertyData]);

  // Property performance horizontal bar chart options
  const propertyBarChartOption = useMemo(() => {
    if (!propertyChartData || propertyChartData.length === 0) {
      return {};
    }

    // Reverse for horizontal bar chart (bottom to top display)
    const sortedData = [...propertyChartData].reverse();
    const propertyNames = sortedData.map((p: any) =>
      (p.propertyName || `Property ${p.propertyId}`).length > 25
        ? (p.propertyName || `Property ${p.propertyId}`).substring(0, 22) + '...'
        : (p.propertyName || `Property ${p.propertyId}`)
    );
    const revenueValues = sortedData.map((p: any) => p.revenue || 0);
    const payoutValues = sortedData.map((p: any) => p.netIncome || p.payout || 0);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#ffffff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: 12,
        textStyle: { color: '#374151', fontSize: 12 },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const index = params[0].dataIndex;
          const originalData = sortedData[index];
          const fullName = originalData.propertyName || `Property ${originalData.propertyId}`;
          return `
            <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px;">${fullName}</div>
            <div style="display: flex; justify-content: space-between; gap: 24px; margin-bottom: 4px;">
              <span style="color: #6b7280;">Revenue:</span>
              <span style="font-weight: 500;">$${(originalData.revenue || 0).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 24px; margin-bottom: 4px;">
              <span style="color: #6b7280;">Payout:</span>
              <span style="font-weight: 500;">$${(originalData.netIncome || originalData.payout || 0).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 24px; margin-bottom: 4px;">
              <span style="color: #6b7280;">Expenses:</span>
              <span style="font-weight: 500;">$${(originalData.expenses || 0).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 24px;">
              <span style="color: #6b7280;">Bookings:</span>
              <span style="font-weight: 500;">${originalData.bookings || 0}</span>
            </div>
          `;
        },
        extraCssText: 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);',
      },
      legend: {
        data: ['Revenue', 'Payout'],
        bottom: 0,
        left: 'center',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: '#6b7280', fontSize: 11 },
      },
      grid: {
        left: '3%',
        right: '4%',
        top: '3%',
        bottom: '12%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          formatter: (value: number) => formatCurrency(value),
        },
      },
      yAxis: {
        type: 'category',
        data: propertyNames,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#374151',
          fontSize: 11,
          width: 140,
          overflow: 'truncate',
        },
      },
      series: [
        {
          name: 'Revenue',
          type: 'bar',
          data: revenueValues,
          barMaxWidth: 16,
          itemStyle: {
            color: '#3b82f6',
            borderRadius: [0, 4, 4, 0],
          },
        },
        {
          name: 'Payout',
          type: 'bar',
          data: payoutValues,
          barMaxWidth: 16,
          itemStyle: {
            color: '#10b981',
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    };
  }, [propertyChartData]);

  // Owner breakdown chart data
  const ownerChartData = useMemo(() => {
    if (!ownerData || !Array.isArray(ownerData)) return [];
    return ownerData.slice(0, 10);
  }, [ownerData]);

  // Owner breakdown pie chart options (revenue distribution)
  const ownerPieChartOption = useMemo(() => {
    if (!ownerChartData || ownerChartData.length === 0) {
      return {};
    }

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'white',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: '#374151', fontSize: 12 },
        formatter: (params: any) => {
          return `<div class="font-medium">${params.name}</div>
                  <div class="text-gray-500">${formatFullCurrency(params.value)} (${params.percent.toFixed(1)}%)</div>`;
        },
      },
      series: [{
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: ownerChartData.map((owner: OwnerData, i: number) => ({
          name: owner.ownerName,
          value: owner.totalRevenue,
          itemStyle: { color: colors[i % colors.length] },
        })),
      }],
    };
  }, [ownerChartData]);

  // Monthly comparison chart options
  const monthlyComparisonChartOption = useMemo(() => {
    if (!monthlyComparisonData || monthlyComparisonData.length === 0) {
      return {};
    }

    const data = monthlyComparisonData as MonthlyComparisonDataPoint[];
    const months = data.map((d) => `${d.month} ${d.year}`);
    const revenueData = data.map((d) => d.revenue);
    const payoutData = data.map((d) => d.payout);
    const expensesData = data.map((d) => d.expenses);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#ffffff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: 12,
        textStyle: { color: '#374151', fontSize: 12 },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const monthLabel = params[0].name;
          const dataIndex = params[0].dataIndex;
          const monthData = data[dataIndex];
          return `
            <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px;">${monthLabel}</div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="display: inline-block; width: 10px; height: 10px; background: #3b82f6; border-radius: 2px;"></span>
              <span style="color: #6b7280; flex: 1;">Revenue:</span>
              <span style="font-weight: 500;">$${monthData.revenue.toLocaleString()}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="display: inline-block; width: 10px; height: 10px; background: #10b981; border-radius: 2px;"></span>
              <span style="color: #6b7280; flex: 1;">Payout:</span>
              <span style="font-weight: 500;">$${monthData.payout.toLocaleString()}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="display: inline-block; width: 10px; height: 10px; background: #f59e0b; border-radius: 2px;"></span>
              <span style="color: #6b7280; flex: 1;">Expenses:</span>
              <span style="font-weight: 500;">$${monthData.expenses.toLocaleString()}</span>
            </div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 11px;">
              ${monthData.count} statement${monthData.count !== 1 ? 's' : ''}
            </div>
          `;
        },
        extraCssText: 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);',
      },
      legend: {
        data: ['Revenue', 'Payout', 'Expenses'],
        bottom: 0,
        left: 'center',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: '#6b7280', fontSize: 11 },
      },
      grid: {
        left: '3%',
        right: '4%',
        top: '8%',
        bottom: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: months,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#6b7280', fontSize: 11 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          formatter: (value: number) => formatCurrency(value),
        },
      },
      series: [
        {
          name: 'Revenue',
          type: 'bar',
          data: revenueData,
          barMaxWidth: 24,
          itemStyle: {
            color: '#3b82f6',
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'Payout',
          type: 'bar',
          data: payoutData,
          barMaxWidth: 24,
          itemStyle: {
            color: '#10b981',
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: 'Expenses',
          type: 'bar',
          data: expensesData,
          barMaxWidth: 24,
          itemStyle: {
            color: '#f59e0b',
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };
  }, [monthlyComparisonData]);

  // Handle period change
  const handlePeriodChange = (preset: string) => {
    setSelectedPeriod(preset);
    if (preset === 'custom') {
      setShowCustomPicker(true);
      // Initialize custom dates with current range if empty
      if (!customStartDate) setCustomStartDate(dateRange.start);
      if (!customEndDate) setCustomEndDate(dateRange.end);
    } else {
      setShowCustomPicker(false);
      const newRange = getDateRange(preset);
      setDateRange(newRange);
    }
  };

  // Handle custom date apply
  const handleCustomDateApply = () => {
    if (customStartDate && customEndDate) {
      setDateRange({ start: customStartDate, end: customEndDate });
    }
  };

  // Period options
  const periodOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'alltime', label: 'All Time' },
    { value: 'custom', label: 'Custom' },
  ];

  const isLoading = summaryLoading || trendLoading || expenseLoading || propertyLoading || ownerLoading;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-shrink-0">
            <h1 className="text-lg font-semibold text-gray-900 whitespace-nowrap">Analytics</h1>
            <div className="w-px h-6 bg-gray-200" />
            <FilterDropdown
              label="Owners"
              options={filtersData?.owners || []}
              value={selectedOwnerId}
              onChange={setSelectedOwnerId}
            />
            <FilterDropdown
              label="Properties"
              options={filtersData?.properties || []}
              value={selectedPropertyId}
              onChange={setSelectedPropertyId}
            />
            <FilterDropdown
              label="Groups"
              options={filtersData?.groups || []}
              value={selectedGroupId}
              onChange={setSelectedGroupId}
            />
          </div>
          <div className="flex-1 min-w-0" />
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handlePeriodChange(option.value)}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    selectedPeriod === option.value
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {showCustomPicker && (
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1.5">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleCustomDateApply}
                  className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
            <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 print:hidden"
            >
              <Download className={`w-4 h-4 ${isExporting ? 'animate-pulse' : ''}`} />
              <span>Export</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <button
                  onClick={handleExportCSV}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  Export to CSV
                </button>
                <button
                  onClick={handleExportExcel}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  Export to Excel
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Printer className="w-4 h-4 text-blue-600" />
                  Download PDF Report
                </button>
              </div>
            )}
          </div>
            <button
              onClick={() => refetchSummary()}
              disabled={isLoading}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 print:hidden"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Financial Metrics Bar */}
        <div className="bg-slate-700 rounded-lg p-4 mb-6 overflow-x-auto">
          <div className="flex items-center justify-between min-w-max gap-4">
            <div className="text-center px-4">
              <div className="text-xs text-slate-300 uppercase tracking-wide mb-1">Base Rate</div>
              <div className="text-lg font-semibold text-white">{formatFullCurrency(kpiData.baseRate)}</div>
            </div>
            <div className="w-px h-10 bg-slate-500" />
            <div className="text-center px-4">
              <div className="text-xs text-slate-300 uppercase tracking-wide mb-1">Guest Fees</div>
              <div className="text-lg font-semibold text-white">{formatFullCurrency(kpiData.guestFees)}</div>
            </div>
            <div className="w-px h-10 bg-slate-500" />
            <div className="text-center px-4">
              <div className="text-xs text-slate-300 uppercase tracking-wide mb-1">Platform Fees</div>
              <div className="text-lg font-semibold text-white">{formatFullCurrency(kpiData.platformFees)}</div>
            </div>
            <div className="w-px h-10 bg-slate-500" />
            <div className="text-center px-4">
              <div className="text-xs text-slate-300 uppercase tracking-wide mb-1">Revenue</div>
              <div className="text-lg font-semibold text-white">{formatFullCurrency(kpiData.revenue)}</div>
            </div>
            <div className="w-px h-10 bg-slate-500" />
            <div className="text-center px-4">
              <div className="text-xs text-slate-300 uppercase tracking-wide mb-1">PM Commission</div>
              <div className="text-lg font-semibold text-white">{formatFullCurrency(kpiData.pmCommission)}</div>
            </div>
            <div className="w-px h-10 bg-slate-500" />
            <div className="text-center px-4">
              <div className="text-xs text-slate-300 uppercase tracking-wide mb-1">Tax</div>
              <div className="text-lg font-semibold text-white">{formatFullCurrency(kpiData.taxes)}</div>
            </div>
            <div className="w-px h-10 bg-slate-500" />
            <div className="text-center px-4">
              <div className="text-xs text-slate-300 uppercase tracking-wide mb-1">Gross Payout</div>
              <div className="text-lg font-semibold text-white">{formatFullCurrency(kpiData.grossPayout)}</div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard
            title="Total Revenue"
            value={formatFullCurrency(kpiData.revenue)}
            change={kpiData.revenueChange}
            previousValue={formatCurrency(kpiData.previousRevenue)}
            icon={<DollarSign className="w-4 h-4" />}
            loading={summaryLoading}
          />
          <KPICard
            title="Net Income"
            value={formatFullCurrency(kpiData.netIncome)}
            change={kpiData.netIncomeChange}
            previousValue={formatCurrency(kpiData.previousNetIncome)}
            icon={<CreditCard className="w-4 h-4" />}
            loading={summaryLoading}
          />
          <KPICard
            title="Total Expenses"
            value={formatFullCurrency(kpiData.expenses)}
            change={kpiData.expensesChange}
            previousValue={formatCurrency(kpiData.previousExpenses)}
            icon={<Percent className="w-4 h-4" />}
            loading={summaryLoading}
          />
          <KPICard
            title="Statements"
            value={kpiData.statementCount.toString()}
            previousValue={kpiData.previousStatementCount > 0 ? kpiData.previousStatementCount.toString() : undefined}
            icon={<FileText className="w-4 h-4" />}
            loading={summaryLoading}
          />
        </div>

        {/* Second Row KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard
            title="Avg Payout"
            value={formatFullCurrency(kpiData.avgPayoutPerStatement)}
            change={kpiData.avgPayoutPerStatementChange}
            previousValue={formatCurrency(kpiData.previousAvgPayoutPerStatement)}
            icon={<DollarSign className="w-4 h-4" />}
            loading={summaryLoading}
          />
          <KPICard
            title="Reservations"
            value={kpiData.reservationCount.toString()}
            change={kpiData.reservationCountChange}
            previousValue={kpiData.previousReservationCount > 0 ? kpiData.previousReservationCount.toString() : undefined}
            icon={<Calendar className="w-4 h-4" />}
            loading={summaryLoading}
          />
          <KPICard
            title="Properties"
            value={kpiData.propertyCount.toString()}
            change={kpiData.propertyCountChange}
            previousValue={kpiData.previousPropertyCount > 0 ? kpiData.previousPropertyCount.toString() : undefined}
            icon={<Home className="w-4 h-4" />}
            loading={summaryLoading}
          />
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Negative Payouts</span>
              <div className="p-1.5 bg-red-50 rounded-md text-red-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className={`mt-2 text-2xl font-semibold tabular-nums ${kpiData.negativePayoutCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {kpiData.negativePayoutCount}
            </div>
            <div className="mt-1 flex items-center gap-2">
              {kpiData.previousNegativePayoutCount > 0 && (
                <span className="text-xs text-gray-400">vs {kpiData.previousNegativePayoutCount}</span>
              )}
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Revenue Trend - Takes 2 columns */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-4" data-chart="revenue-trend">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-medium text-gray-900">Revenue Trend</h3>
              </div>
              <div className="flex items-center bg-gray-100 rounded-md p-0.5">
                <button
                  onClick={() => setGranularity('day')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    granularity === 'day' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Day
                </button>
                <button
                  onClick={() => setGranularity('week')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    granularity === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setGranularity('month')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    granularity === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Month
                </button>
              </div>
            </div>
            {trendLoading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : ((() => { const r = trendData as any; return (Array.isArray(r) ? r : r?.trends || r?.data || []).length > 0; })()) ? (
              <ReactECharts option={trendChartOption} style={{ height: '256px' }} />
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                <BarChart3 className="w-8 h-8 mb-2" />
                <span className="text-sm">No data for selected period</span>
              </div>
            )}
          </div>

          {/* Expense Breakdown */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-900">Expense Breakdown</h3>
            </div>
            {expenseLoading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : ((() => { const r = expenseData as any; return (Array.isArray(r) ? r : r?.categories || r?.data || []).length > 0; })()) ? (
              <>
                <ReactECharts option={expenseChartOption} style={{ height: '180px' }} />
                <div className="mt-2 space-y-1.5">
                  {((() => { const r = expenseData as any; return Array.isArray(r) ? r : r?.categories || r?.data || []; })()).slice(0, 4).map((cat: any, i: number) => (
                    <div key={cat.category} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][i] }}
                        />
                        <span className="text-gray-600 truncate">{cat.category}</span>
                      </div>
                      <span className="text-gray-900 font-medium tabular-nums">
                        {formatCurrency(cat.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                <PieChart className="w-8 h-8 mb-2" />
                <span className="text-sm">No expenses</span>
              </div>
            )}
          </div>
        </div>

        {/* Payout Trend Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-900">Payout Trend</h3>
            </div>
            <div className="flex items-center bg-gray-100 rounded-md p-0.5">
              <button
                onClick={() => setPayoutGranularity('day')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  payoutGranularity === 'day' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setPayoutGranularity('week')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  payoutGranularity === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setPayoutGranularity('month')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  payoutGranularity === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                Month
              </button>
            </div>
          </div>
          {payoutTrendLoading ? (
            <div className="h-64 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : (payoutTrendData && payoutTrendData.length > 0) ? (
            <ReactECharts option={payoutTrendChartOption} style={{ height: '256px' }} />
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-gray-400">
              <CreditCard className="w-8 h-8 mb-2" />
              <span className="text-sm">No payout data for selected period</span>
            </div>
          )}
        </div>

        {/* Property Performance */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-medium text-gray-900">Top Properties by Revenue</h3>
          </div>
          {propertyLoading ? (
            <div className="h-80 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : propertyChartData.length > 0 ? (
            <ReactECharts
              option={propertyBarChartOption}
              style={{ height: Math.max(300, propertyChartData.length * 40) + 'px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          ) : (
            <div className="h-80 flex flex-col items-center justify-center text-gray-400">
              <Building2 className="w-8 h-8 mb-2" />
              <span className="text-sm">No property data</span>
            </div>
          )}
        </div>

        {/* Owner Breakdown Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          {/* Owner Revenue Distribution Pie Chart */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-900">Revenue by Owner</h3>
            </div>
            {ownerLoading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : ownerChartData.length > 0 ? (
              <>
                <ReactECharts option={ownerPieChartOption} style={{ height: '200px' }} />
                <div className="mt-2 space-y-1.5">
                  {ownerChartData.slice(0, 5).map((owner: OwnerData, i: number) => (
                    <div key={owner.ownerName} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i] }}
                        />
                        <span className="text-gray-600 truncate max-w-[120px]">{owner.ownerName}</span>
                      </div>
                      <span className="text-gray-900 font-medium tabular-nums">
                        {formatCurrency(owner.totalRevenue)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                <Users className="w-8 h-8 mb-2" />
                <span className="text-sm">No owner data</span>
              </div>
            )}
          </div>

          {/* Top Owners by Payout Table */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-900">Top Owners by Payout</h3>
            </div>
            {ownerLoading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : ownerChartData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Owner
                      </th>
                      <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payout
                      </th>
                      <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        PM Fee
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ownerChartData.slice(0, 10).map((owner: OwnerData) => (
                      <tr key={owner.ownerName} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                          {owner.ownerName}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700 text-right tabular-nums">
                          {formatFullCurrency(owner.totalRevenue)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700 text-right tabular-nums">
                          {formatFullCurrency(owner.ownerPayout)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700 text-right tabular-nums">
                          {formatFullCurrency(owner.pmCommission)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                <Users className="w-8 h-8 mb-2" />
                <span className="text-sm">No owner data available</span>
              </div>
            )}
          </div>
        </div>

        {/* Monthly Comparison Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-medium text-gray-900">Monthly Comparison (Last 6 Months)</h3>
          </div>
          {monthlyComparisonLoading ? (
            <div className="h-80 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : monthlyComparisonData && monthlyComparisonData.length > 0 ? (
            <ReactECharts
              option={monthlyComparisonChartOption}
              style={{ height: '320px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          ) : (
            <div className="h-80 flex flex-col items-center justify-center text-gray-400">
              <Calendar className="w-8 h-8 mb-2" />
              <span className="text-sm">No monthly data available</span>
            </div>
          )}
        </div>

        {/* Statement Status and Recent Statements Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          {/* Statement Status Donut Chart */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-900">Statement Status</h3>
            </div>
            {statementStatusLoading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : (statementStatusData && statementStatusData.length > 0) ? (
              <>
                <ReactECharts option={statementStatusChartOption} style={{ height: '180px' }} />
                <div className="mt-4 space-y-2">
                  {statementStatusData.map((item: any) => {
                    const statusColors: { [key: string]: string } = {
                      draft: '#f59e0b',
                      sent: '#10b981',
                      modified: '#3b82f6',
                    };
                    const statusLabels: { [key: string]: string } = {
                      draft: 'Draft',
                      sent: 'Sent',
                      modified: 'Modified',
                    };
                    return (
                      <div key={item.status} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: statusColors[item.status] || '#6b7280' }}
                          />
                          <span className="text-gray-600">{statusLabels[item.status] || item.status}</span>
                        </div>
                        <span className="text-gray-900 font-medium tabular-nums">{item.count}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                <PieChart className="w-8 h-8 mb-2" />
                <span className="text-sm">No statement data</span>
              </div>
            )}
          </div>

          {/* Recent Statements Table */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-900">Recent Statements</h3>
            </div>
            {recentStatementsLoading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : (recentStatementsData && recentStatementsData.length > 0) ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Payout</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentStatementsData.map((statement: any) => {
                      const statusColors: { [key: string]: string } = {
                        draft: 'bg-yellow-100 text-yellow-800',
                        sent: 'bg-green-100 text-green-800',
                        modified: 'bg-blue-100 text-blue-800',
                      };
                      const statusLabels: { [key: string]: string } = {
                        draft: 'Draft',
                        sent: 'Sent',
                        modified: 'Modified',
                      };
                      const formatDate = (dateStr: string) => {
                        const date = new Date(dateStr);
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      };
                      return (
                        <tr key={statement.id} className="hover:bg-gray-50">
                          <td className="px-3 py-3 text-sm text-gray-900 truncate max-w-[200px]" title={statement.propertyName}>
                            {statement.propertyName}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">
                            {formatDate(statement.weekStartDate)} - {formatDate(statement.weekEndDate)}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-900 text-right tabular-nums">
                            {formatCurrency(statement.totalRevenue)}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-900 text-right tabular-nums">
                            {formatCurrency(statement.ownerPayout)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[statement.status] || 'bg-gray-100 text-gray-800'}`}>
                              {statusLabels[statement.status] || statement.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                <FileText className="w-8 h-8 mb-2" />
                <span className="text-sm">No recent statements</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
