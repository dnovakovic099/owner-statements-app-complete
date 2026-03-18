import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';

export interface SkippedItem {
  name: string;
  propertyId?: number;
  propertyName?: string;
  listingId?: number;
  type?: 'group' | 'listing';
  reason: string;
  isOffboarded?: boolean;
  statementGenerated?: boolean;
}

export interface GenerationReport {
  generated: number;
  skipped: number;
  errors: number;
  skippedItems: SkippedItem[];
  tag?: string;
}

interface GenerationReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: GenerationReport | null;
}

const GenerationReportModal: React.FC<GenerationReportModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  if (!report) return null;

  const duplicateItems = report.skippedItems.filter(item => item.reason === 'Duplicate - statement already exists');
  const realIssues = report.skippedItems.filter(item => item.reason !== 'Duplicate - statement already exists');
  const errorItems = realIssues.filter(item => item.reason.startsWith('Error'));
  const skippedItems = realIssues.filter(item => !item.reason.startsWith('Error'));
  const hasIssues = realIssues.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasIssues ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            Generation Report{report.tag ? ` - "${report.tag}"` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="flex gap-4 text-sm flex-wrap">
            {report.generated > 0 && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span><strong>{report.generated}</strong> generated</span>
              </div>
            )}
            {duplicateItems.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Info className="h-4 w-4 text-gray-400" />
                <span><strong>{duplicateItems.length}</strong> already existed</span>
              </div>
            )}
            {realIssues.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Info className="h-4 w-4 text-amber-500" />
                <span><strong>{realIssues.length}</strong> issue{realIssues.length !== 1 ? 's' : ''}</span>
              </div>
            )}
            {report.errors > 0 && (
              <div className="flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-red-500" />
                <span><strong>{report.errors}</strong> errors</span>
              </div>
            )}
          </div>

          {/* Duplicate summary (collapsed) */}
          {duplicateItems.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-gray-400 shrink-0" />
              <span><strong>{duplicateItems.length}</strong> listing{duplicateItems.length !== 1 ? 's' : ''} already had statements for this period (skipped)</span>
            </div>
          )}

          {/* Skipped/Error items list */}
          {hasIssues && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The following listings had issues:
              </p>
              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                  {skippedItems.map((item, idx) => (
                    <div key={`skip-${idx}`} className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm">
                      <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium">{item.name || item.propertyName}</span>
                        {item.isOffboarded && (
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Offboarded</span>
                        )}
                        <p className="text-muted-foreground text-xs mt-0.5">{item.reason}</p>
                      </div>
                    </div>
                  ))}
                  {errorItems.map((item, idx) => (
                    <div key={`err-${idx}`} className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm">
                      <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium">{item.name || item.propertyName}</span>
                        {item.isOffboarded && (
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Offboarded</span>
                        )}
                        <p className="text-muted-foreground text-xs mt-0.5">{item.reason}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {!hasIssues && (
            <p className="text-sm text-muted-foreground">
              All listings in this tag were successfully generated.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerationReportModal;
