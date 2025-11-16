import React, { useState, useEffect } from 'react';
import { Plus, AlertCircle, LogOut, Home, Search } from 'lucide-react';
import { dashboardAPI, statementsAPI, expensesAPI, reservationsAPI } from '../services/api';
import { Owner, Property, Statement } from '../types';
import StatementsTable from './StatementsTable';
import GenerateModal from './GenerateModal';
import UploadModal from './UploadModal';
import ExpenseUpload from './ExpenseUpload';
import EditStatementModal from './EditStatementModal';
import LoadingSpinner from './LoadingSpinner';
import ListingsPage from './ListingsPage';

interface User {
  username: string;
}

interface DashboardProps {
  user: User | null;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadModalType, setUploadModalType] = useState<'expenses' | 'reservations'>('expenses');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStatementId, setEditingStatementId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'listings'>('dashboard');

  // Filter states
  const [filters, setFilters] = useState({
    ownerId: '',
    propertyId: '',
    status: '',
    startDate: '',
    endDate: '',
  });

  // Property search state
  const [propertySearch, setPropertySearch] = useState('');

  // Filter properties based on search
  const filteredProperties = properties.filter((property) => {
    if (!propertySearch) return true;
    const searchLower = propertySearch.toLowerCase();
    return (
      property.name.toLowerCase().includes(searchLower) ||
      property.nickname?.toLowerCase().includes(searchLower) ||
      property.id.toString().includes(searchLower)
    );
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadStatements();
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [ownersResponse, propertiesResponse] = await Promise.all([
        dashboardAPI.getOwners(),
        dashboardAPI.getProperties(),
      ]);
      setOwners(ownersResponse);
      setProperties(propertiesResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      console.error('Failed to load initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStatements = async () => {
    try {
      const response = await statementsAPI.getStatements(filters);
      setStatements(response.statements);
    } catch (err) {
      console.error('Failed to load statements:', err);
    }
  };


  const handleGenerateStatement = async (data: {
    ownerId: string;
    propertyId?: string;
    startDate: string;
    endDate: string;
    calculationType: string;
  }) => {
    try {
      const response = await statementsAPI.generateStatement(data);
      
      // Check if this is a background job (bulk generation)
      if (data.ownerId === 'all' && response.jobId) {
        alert(
          `🚀 Bulk Statement Generation Started!\n\n` +
          `This process is running in the background and may take several minutes to complete.\n\n` +
          `✅ You can close this window and check back later.\n` +
          `📊 The statements will appear in the list once generation is complete.\n\n` +
          `Tip: Refresh the page to see newly generated statements.`
        );
        
        setIsGenerateModalOpen(false);
        // Refresh statements after a short delay to show any initial progress
        setTimeout(() => loadStatements(), 3000);
      } 
      // Check if this was a completed bulk generation (old format, shouldn't happen anymore)
      else if (data.ownerId === 'all' && response.summary) {
        const { generated, skipped, errors } = response.summary;
        let message = `✅ Bulk Generation Complete!\n\n`;
        message += `📊 Generated: ${generated} statement(s)\n`;
        if (skipped > 0) message += `⏭️  Skipped: ${skipped} (no activity)\n`;
        if (errors > 0) message += `❌ Errors: ${errors}\n`;
        
        if (response.results?.errors && response.results.errors.length > 0) {
          message += `\nErrors:\n`;
          response.results.errors.slice(0, 3).forEach((err: any) => {
            message += `  • ${err.ownerName} - ${err.propertyName}: ${err.error}\n`;
          });
          if (response.results.errors.length > 3) {
            message += `  ... and ${response.results.errors.length - 3} more\n`;
          }
        }
        
        alert(message);
        setIsGenerateModalOpen(false);
        await loadStatements();
      } 
      // Single statement generation
      else {
        alert('✅ Statement generated successfully');
        setIsGenerateModalOpen(false);
        await loadStatements();
      }
    } catch (err) {
      alert(`❌ Failed to generate statement: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err; // Re-throw to keep modal open on error
    }
  };

  const handleUploadCSV = async (file: File) => {
    try {
      if (uploadModalType === 'reservations') {
        const response = await reservationsAPI.uploadCSV(file);
        if (response.success) {
          alert(`✅ ${response.message}`);
        } else {
          alert(`❌ ${response.error || 'Failed to upload reservations'}`);
        }
      } else {
        const response = await expensesAPI.uploadCSV(file);
        alert(`✅ CSV uploaded successfully: ${response.processed} processed, ${response.errors} errors`);
      }
      setIsUploadModalOpen(false);
      await loadInitialData();
    } catch (err) {
      alert(`❌ Failed to upload CSV: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDownloadReservationTemplate = async () => {
    try {
      const blob = await reservationsAPI.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reservation_template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(`❌ Failed to download template: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleStatementAction = async (id: number, action: string) => {
    try {
      if (action === 'send') {
        if (!window.confirm('Are you sure you want to send this statement?')) {
          return;
        }
        await statementsAPI.updateStatementStatus(id, 'sent');
        alert('✅ Statement sent successfully');
        await loadStatements();
      } else if (action === 'view') {
        // Navigate to statement view in same window for debugging
        console.log('Opening view for statement:', id);
        const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
        const viewUrl = `${baseUrl}/api/statements/${id}/view`;
        console.log('View URL:', viewUrl);
        window.open(viewUrl, '_blank');
      } else if (action === 'download') {
        // Download statement as PDF file with cache-busting timestamp
        const blob = await statementsAPI.downloadStatement(id);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Add timestamp to filename to prevent browser caching
        const timestamp = new Date().getTime();
        a.download = `statement-${id}-${timestamp}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else if (action === 'edit') {
        setEditingStatementId(id);
        setIsEditModalOpen(true);
      } else if (action === 'refresh') {
        if (!window.confirm('🔄 Regenerate this statement with the latest data? This will replace the existing statement.')) {
          return;
        }
        // Find the statement to get its parameters
        const statement = statements.find(s => s.id === id);
        if (!statement) {
          alert('❌ Statement not found');
          return;
        }
        
        // Delete the old statement first
        await statementsAPI.deleteStatement(id);
        
        // Regenerate with the same parameters
        await handleGenerateStatement({
          ownerId: statement.ownerId.toString(),
          propertyId: statement.propertyId?.toString() || '',
          startDate: statement.weekStartDate,
          endDate: statement.weekEndDate,
          calculationType: statement.calculationType || 'checkout'
        });
        
        // Reload statements to get the new statement ID
        await loadStatements();
        
        alert('✅ Statement regenerated successfully');
      } else if (action === 'delete') {
        if (!window.confirm('⚠️ Are you sure you want to delete this statement? This action cannot be undone.')) {
          return;
        }
        await statementsAPI.deleteStatement(id);
        alert('✅ Statement deleted successfully');
        await loadStatements();
      }
    } catch (err) {
      alert(`❌ Failed to ${action} statement: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="flex items-center text-red-600 mb-4">
            <AlertCircle className="w-6 h-6 mr-2" />
            <h2 className="text-lg font-semibold">Error Loading Dashboard</h2>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadInitialData}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show listings page if selected
  if (currentPage === 'listings') {
    return (
      <ListingsPage 
        onBack={() => setCurrentPage('dashboard')} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 to-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">📊 Owner Statements</h1>
              {user && (
                <p className="text-white/80 text-sm mt-1">Welcome, {user.username}</p>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setCurrentPage('listings')}
                className="flex items-center px-4 py-2 bg-green-500/20 border border-green-300/30 rounded-md hover:bg-green-500/30 transition-colors"
                title="Manage Listings"
              >
                <Home className="w-4 h-4 mr-2" />
                Listings
              </button>
              <button
                onClick={onLogout}
                className="flex items-center px-4 py-2 bg-red-500/20 border border-red-300/30 rounded-md hover:bg-red-500/30 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
            <button
              onClick={() => setIsGenerateModalOpen(true)}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Generate Statement
            </button>
          </div>
        </div>

        {/* File Uploads */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Expense Upload */}
          <div>
            <ExpenseUpload onUploadSuccess={loadInitialData} />
          </div>

          {/* Reservation Upload */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg shadow-md p-6 border border-purple-200">
            <h3 className="text-lg font-semibold text-purple-900 mb-2">Import Reservations</h3>
            <p className="text-sm text-purple-700 mb-4">Upload a CSV file with manual reservations</p>
            <button
              onClick={() => {
                setUploadModalType('reservations');
                setIsUploadModalOpen(true);
              }}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium"
            >
              Upload Reservations CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Owner</label>
              <select
                value={filters.ownerId}
                onChange={(e) => setFilters({ ...filters, ownerId: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Owners</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Property Search</label>
              <div className="space-y-2">
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by property name, nickname, or ID..."
                    value={propertySearch}
                    onChange={(e) => setPropertySearch(e.target.value)}
                    className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {propertySearch && (
                    <button
                      onClick={() => setPropertySearch('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
                
                {/* Property Dropdown */}
                <select
                  value={filters.propertyId}
                  onChange={(e) => setFilters({ ...filters, propertyId: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Properties ({filteredProperties.length})</option>
                  {filteredProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.nickname || property.name} (ID: {property.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="generated">Generated</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Statements Table */}
        <StatementsTable statements={statements} onAction={handleStatementAction} />
      </div>

      {/* Modals */}
      <GenerateModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        onGenerate={handleGenerateStatement}
        owners={owners}
        properties={properties}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUploadCSV}
        type={uploadModalType}
        onDownloadTemplate={uploadModalType === 'reservations' ? handleDownloadReservationTemplate : undefined}
      />

      <EditStatementModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingStatementId(null);
        }}
        statementId={editingStatementId}
        onStatementUpdated={loadStatements}
      />
    </div>
  );
};

export default Dashboard;
