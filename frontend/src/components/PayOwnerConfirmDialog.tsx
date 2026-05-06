import React, { useEffect, useState } from 'react';
import { X, Building2, Users } from 'lucide-react';
import { payoutsAPI } from '../services/api';

interface Preview {
  ownerName: string | null;
  propertyName: string | null;
  source: 'group' | 'listing' | null;
  sourceLabel: string | null;
  holderName: string | null;
  routingNumber: string | null;
  accountNumberLast4: string | null;
  increaseStatus: string | null;
}

interface Props {
  isOpen: boolean;
  statementId: number | null;
  payoutAmount: number;
  onClose: () => void;
  onConfirmed: (response: { totalTransferAmount?: number; queued?: boolean; message?: string }) => void;
  onError: (msg: string) => void;
}

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
    <span className="text-gray-500 dark:text-gray-400">{label}</span>
    <span className={`text-gray-900 dark:text-gray-100 truncate ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value}</span>
  </div>
);

const PayOwnerConfirmDialog: React.FC<Props> = ({ isOpen, statementId, payoutAmount, onClose, onConfirmed, onError }) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!isOpen || !statementId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    payoutsAPI.previewRecipient(statementId)
      .then((data) => {
        if (cancelled) return;
        setLoading(false);
        setError(data.error || null);
        setPreview({
          ownerName: data.ownerName,
          propertyName: data.propertyName,
          source: data.source,
          sourceLabel: data.sourceLabel,
          holderName: data.holderName,
          routingNumber: data.routingNumber,
          accountNumberLast4: data.accountNumberLast4,
          increaseStatus: data.increaseStatus,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        setError(err?.response?.data?.error || err?.message || 'Failed to load recipient');
      });
    return () => { cancelled = true; };
  }, [isOpen, statementId]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!statementId) return;
    setSubmitting(true);
    try {
      const response = await payoutsAPI.transferToOwner(statementId);
      if (response.success) {
        onConfirmed({
          totalTransferAmount: response.totalTransferAmount,
          queued: (response as any).queued,
          message: (response as any).message,
        });
      } else {
        onError(response.error || 'Transfer failed');
      }
    } catch (err: any) {
      onError(err?.response?.data?.error || err?.message || 'Transfer failed');
    } finally {
      setSubmitting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <button
          onClick={onClose}
          disabled={submitting}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Pay Owner via Increase</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Review the recipient before sending.</p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading recipient...</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded border border-gray-200 dark:border-gray-700 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Amount</div>
              <div className="text-2xl font-semibold text-green-600">${payoutAmount.toFixed(2)}</div>
            </div>

            {preview?.source && (
              <div className="flex items-center gap-2">
                {preview.source === 'group' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                    <Users className="w-3 h-3" /> Group account
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    <Building2 className="w-3 h-3" /> Listing account
                  </span>
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{preview.sourceLabel}</span>
              </div>
            )}

            <div className="rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
              <Row label="Account holder" value={preview?.holderName || '—'} mono={false} />
              <Row
                label="Account"
                value={preview?.accountNumberLast4 ? `••••${preview.accountNumberLast4}` : '—'}
                mono
              />
              <Row label="Routing" value={preview?.routingNumber || '—'} mono />
              {preview?.propertyName && (
                <Row label="Property" value={preview.propertyName} mono={false} />
              )}
              {preview?.increaseStatus && (
                <Row label="Increase status" value={preview.increaseStatus} mono />
              )}
            </div>

            {error && (
              <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm p-2">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || submitting || !preview?.holderName}
            className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
          >
            {submitting ? 'Sending...' : 'Confirm & Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PayOwnerConfirmDialog;
