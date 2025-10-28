import React, { useState } from 'react';
import { expensesAPI } from '../services/api';

interface ExpenseUploadProps {
  onUploadSuccess?: () => void;
}

interface UploadResponse {
  success: boolean;
  message: string;
  data?: {
    totalExpenses: number;
    filename: string;
    savedTo: string;
    expenses: any[];
  };
  error?: string;
}

const ExpenseUpload: React.FC<ExpenseUploadProps> = ({ onUploadSuccess }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = (file: File) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.csv')) {
      setUploadResult({
        success: false,
        message: '',
        error: 'Please select a CSV or Excel file (.csv, .xls, .xlsx)'
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setUploadResult({
        success: false,
        message: '',
        error: 'File size must be less than 10MB'
      });
      return;
    }

    setSelectedFile(file);
    setUploadResult(null);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const response = await expensesAPI.upload(selectedFile);
      setUploadResult(response);
      setSelectedFile(null);
      
      if (response.success && onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (error: any) {
      setUploadResult({
        success: false,
        message: '',
        error: error.response?.data?.error || 'Upload failed. Please try again.'
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const blob = await expensesAPI.getTemplate();
      
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'expense_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download template:', error);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Upload Expenses</h3>
        <button
          onClick={downloadTemplate}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Download Template
        </button>
      </div>

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {selectedFile ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <div className="flex space-x-2 justify-center">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <button
                onClick={() => setSelectedFile(null)}
                className="bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-medium hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-600">
                Drag and drop your expense file here, or{' '}
                <label className="text-blue-600 hover:text-blue-800 cursor-pointer underline">
                  browse
                  <input
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileInputChange}
                  />
                </label>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                CSV and Excel files (max 10MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`mt-4 p-4 rounded-md ${
          uploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          {uploadResult.success ? (
            <div className="flex items-start">
              <svg className="w-5 h-5 text-green-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-green-800">Upload Successful!</h4>
                <p className="text-sm text-green-700 mt-1">{uploadResult.message}</p>
                {uploadResult.data && (
                  <div className="mt-2 text-xs text-green-600">
                    <p>• {uploadResult.data.totalExpenses} expenses processed</p>
                    <p>• Saved as: {uploadResult.data.savedTo}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start">
              <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-red-800">Upload Failed</h4>
                <p className="text-sm text-red-700 mt-1">{uploadResult.error}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-4 text-xs text-gray-500">
        <p className="font-medium mb-1">Required: date, description, amount</p>
        <p>Optional: category, vendor, listing, property_id</p>
      </div>
    </div>
  );
};

export default ExpenseUpload;
