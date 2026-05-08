'use client';

import Sidebar from '@/components/shared/Sidebar';
import FraudAlertPanel from '@/components/admin/FraudAlertPanel';

export default function FraudAlertsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="admin" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Fraud Alerts</h1>
          <p className="text-surface-400">AI-detected anomalies and suspicious activities.</p>
        </div>

        <FraudAlertPanel />
      </main>
    </div>
  );
}
