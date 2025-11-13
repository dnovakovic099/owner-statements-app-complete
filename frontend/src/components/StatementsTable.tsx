import React from 'react';
import { Eye, Edit, Send, Download, Trash2 } from 'lucide-react';
import { Statement } from '../types';

interface StatementsTableProps {
  statements: Statement[];
  onAction: (id: number, action: string) => void;
}

const StatementsTable: React.FC<StatementsTableProps> = ({ statements, onAction }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    // Parse dates as local dates to avoid timezone issues
    const parseLocalDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day); // month is 0-indexed
    };
    
    const start = parseLocalDate(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = parseLocalDate(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${start} - ${end}`;
  };

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      draft: 'bg-yellow-100 text-yellow-800',
      generated: 'bg-blue-100 text-blue-800',
      sent: 'bg-green-100 text-green-800',
      paid: 'bg-purple-100 text-purple-800',
    };

    return (
      <span
        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          statusClasses[status as keyof typeof statusClasses] || 'bg-gray-100 text-gray-800'
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (statements.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">📭 No statements found</h2>
          <p className="text-gray-600">Generate your first statement using the button above.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Recent Statements</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Owner
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Property
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Week
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Revenue
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payout
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {statements.map((statement) => (
              <tr key={statement.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{statement.ownerName}</div>
                </td>
                <td className="px-4 py-4 w-32">
                  <div className="text-sm text-gray-900 truncate" title={statement.propertyName}>
                    {statement.propertyName}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {formatDateRange(statement.weekStartDate, statement.weekEndDate)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    statement.calculationType === 'calendar' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {statement.calculationType === 'calendar' ? '📅 Calendar' : '✓ Checkout'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {formatCurrency(statement.totalRevenue)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-gray-900">
                    {formatCurrency(statement.ownerPayout)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(statement.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <a
                      href={`${process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : ''}/api/statements/${statement.id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-900 inline-block"
                      title="View Statement"
                    >
                      <Eye className="w-4 h-4" />
                    </a>
                    {(statement.status === 'draft' || statement.status === 'modified') && (
                      <button
                        onClick={() => onAction(statement.id, 'edit')}
                        className="text-yellow-600 hover:text-yellow-900"
                        title="Edit Statement"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {statement.status === 'generated' && (
                      <button
                        onClick={() => onAction(statement.id, 'send')}
                        className="text-green-600 hover:text-green-900"
                        title="Send Statement"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onAction(statement.id, 'download')}
                      className="text-purple-600 hover:text-purple-900"
                      title="Download Statement"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onAction(statement.id, 'delete')}
                      className="text-red-600 hover:text-red-900"
                      title="Delete Statement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StatementsTable;
