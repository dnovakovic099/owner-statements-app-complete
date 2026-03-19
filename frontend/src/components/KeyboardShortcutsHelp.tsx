import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
}

const SHORTCUT_SECTIONS: { title: string; shortcuts: ShortcutEntry[] }[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['g', 'd'], description: 'Go to Dashboard' },
      { keys: ['g', 'l'], description: 'Go to Listings' },
      { keys: ['g', 'a'], description: 'Go to Analytics' },
      { keys: ['g', 's'], description: 'Go to Settings' },
      { keys: ['g', 'p'], description: 'Go to Payout Accounts' },
      { keys: ['g', 'e'], description: 'Go to Email' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['/'], description: 'Focus search' },
      { keys: ['Ctrl', 'K'], description: 'Focus search' },
      { keys: ['?'], description: 'Show this help' },
    ],
  },
];

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border border-gray-300 bg-gray-50 text-xs font-mono font-medium text-gray-700 shadow-sm">
    {children}
  </kbd>
);

const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {SHORTCUT_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-600">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && (
                            <span className="text-xs text-gray-400 mx-0.5">
                              {section.title === 'Navigation' ? 'then' : '+'}
                            </span>
                          )}
                          <Kbd>{key}</Kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            Press <Kbd>?</Kbd> to toggle this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsHelp;
