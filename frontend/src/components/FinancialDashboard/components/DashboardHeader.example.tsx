import React, { useState } from 'react';
import { DashboardHeader } from './DashboardHeader';

/**
 * Example usage of the DashboardHeader component
 *
 * This component demonstrates how to use the QuickBooks-inspired
 * DashboardHeader with all available features.
 */
export const DashboardHeaderExample: React.FC = () => {
  const [notificationCount, setNotificationCount] = useState(3);

  const handleGenerateStatement = () => {
    console.log('Navigate to Generate Statement page');
    // Example: router.push('/statements/generate');
  };

  const handleExportData = () => {
    console.log('Export data triggered');
    // Example: Export data logic
  };

  const handleSettings = () => {
    console.log('Open settings');
    // Example: Open settings modal or navigate to settings page
  };

  const handleNotifications = () => {
    console.log('Open notifications');
    setNotificationCount(0); // Clear notifications when opened
    // Example: Open notifications panel
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Full example with all props */}
      <DashboardHeader
        onGenerateStatement={handleGenerateStatement}
        onExportData={handleExportData}
        onSettings={handleSettings}
        onNotifications={handleNotifications}
        notificationCount={notificationCount}
      />

      {/* Example content */}
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Dashboard Content</h2>
          <p className="text-gray-600">
            The header above demonstrates:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
            <li>Time-based greeting (Good morning/afternoon/evening)</li>
            <li>Primary action: Generate Statement button (blue)</li>
            <li>Secondary action: Export Data button (outline)</li>
            <li>Settings icon button</li>
            <li>Notifications bell with badge count</li>
            <li>Responsive layout (stacks on mobile)</li>
          </ul>
        </div>
      </div>

      {/* Minimal example */}
      <div className="mt-8">
        <h3 className="px-6 text-lg font-semibold mb-4">Minimal Usage:</h3>
        <DashboardHeader
          onGenerateStatement={handleGenerateStatement}
        />
      </div>

      {/* Without notifications example */}
      <div className="mt-8">
        <h3 className="px-6 text-lg font-semibold mb-4">Without Notifications:</h3>
        <DashboardHeader
          onGenerateStatement={handleGenerateStatement}
          onExportData={handleExportData}
          onSettings={handleSettings}
          notificationCount={0}
        />
      </div>
    </div>
  );
};

/**
 * Code snippet for quick reference:
 *
 * ```tsx
 * <DashboardHeader
 *   onGenerateStatement={() => router.push('/statements')}
 *   onExportData={() => exportDashboardData()}
 *   onSettings={() => setSettingsOpen(true)}
 *   onNotifications={() => setNotificationsOpen(true)}
 *   notificationCount={5}
 * />
 * ```
 */
