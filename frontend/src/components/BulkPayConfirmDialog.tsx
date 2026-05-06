import React, { useEffect, useState } from 'react';
import { X, Building2, Users, AlertTriangle } from 'lucide-react';
import { payoutsAPI } from '../services/api';

interface Preview {
  statementId: number;
  payoutAmount?: number;
  ownerName?: string | null;
  propertyName?: string | null;
  source?: 'group' | 'listing' | null;
  sourceLabel?: string | null;
  holderName?: string | null;
  accountNumberLast4?: string | null;
  error?: string;
}

interface Props {
  isOpen: boolean;
  statementIds: number[];
  skippedCount: number;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

const BulkPayConfirmDialog: React.FC<Props> = ({ isOpen, statementIds, skippedCount, onClose, onConfirm, submitting }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);

  useEffect(() => {
    if (!isOpen || statementIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreviews([]);
    payoutsAPI.previewRecipientsBulk(statementIds)
      .then((data) => {
        if (cancelled) return;
        setPreviews(data.previews || []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        setError(err?.response?.data?.error || err?.message || 'Failed to load recipients');
      });
    return () => { cancelled = true; };
  }, [isOpen, statementIds]);

  if (!isOpen) return null;

  const total = previews.reduce((sum, p) => sum + (p.payoutAmount || 0), 0);
  const missingRecipients = previews.filter(p => p.error || !p.holderName);
  const canConfirm = !loading && !submitting && previews.length > 0 && missingRecipients.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Bulk Pay Owners</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Review every recipient before sending.</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {previews.length} payout{previews.length === 1 ? '' : 's'}
            {skippedCount > 0 && <span className="ml-2 text-gray-400">({skippedCount} skipped)</span>}
          </div>
          <div className="text-xl font-semibold text-green-600">${total.toFixed(2)}</div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500">Loading recipients...</div>
          ) : error ? (
            <div className="py-8 rounded border border-red-200 bg-red-50 text-red-700 text-sm p-3">{error}</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {previews.map((p) => (
                <li key={p.statementId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.source === 'group' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            <Users className="w-3 h-3" /> Group
                          </span>
                        )}
                        {p.source === 'listing' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <Building2 className="w-3 h-3" /> Listing
                          </span>
                        )}
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {p.holderName || p.ownerName || '—'}
                        </span>
                        {p.accountNumberLast4 && (
                          <span className="text-xs font-mono text-gray-500">••••{p.accountNumberLast4}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {p.propertyName || p.sourceLabel || `Statement #${p.statementId}`}
                      </div>
                      {(p.error || !p.holderName) && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle className="w-3 h-3" />
                          {p.error || 'No recipient configured'}
                        </div>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-green-600 whitespace-nowrap">
                      ${(p.payoutAmount || 0).toFixed(2)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
          <div className="text-xs text-gray-500">
            {missingRecipients.length > 0 && (
              <span className="text-red-600">
                {missingRecipients.length} row{missingRecipients.length === 1 ? '' : 's'} missing recipient — fix before sending.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!canConfirm}
              className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
            >
              {submitting ? 'Sending...' : `Send ${previews.length} payout${previews.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkPayConfirmDialog;
