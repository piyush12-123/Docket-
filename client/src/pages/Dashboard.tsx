import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Bell,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Plus,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import * as dashboardApi from '@/api/dashboardApi';
import type { DashboardStats } from '@/api/dashboardApi';
import AiQueryBar from '@/components/AiQueryBar';
import ExpiryBadge from '@/components/ExpiryBadge';
import LoadingSkeleton from '@/components/LoadingSkeleton';

const TYPE_COLORS: Record<string, string> = {
  id: '#3b82f6',
  certificate: '#10b981',
  contract: '#8b5cf6',
  invoice: '#f59e0b',
  insurance: '#ec4899',
  warranty: '#06b6d4',
  other: '#6b7280',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dashboardApi.getStats();
      setStats(data);
    } catch {
      setError('Failed to load dashboard statistics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Chart data formatting
  const chartData = stats
    ? Object.entries(stats.typeCounts).map(([type, count]) => ({
        type: type.toUpperCase(),
        count,
        color: TYPE_COLORS[type] || '#6b7280',
      }))
    : [];

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back to your Document Vault overview.
          </p>
        </div>

        <button
          onClick={() => navigate('/documents')}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* AI Query Bar — Requirement 13.5 */}
      <AiQueryBar onSuccess={loadStats} />

      {/* Error Banner */}
      {!loading && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={loadStats}
            className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <LoadingSkeleton variant="document-card" count={4} />
          </div>
        </div>
      )}

      {/* Stat Cards Overview — Requirement 13.1 */}
      {!loading && stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Documents */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Total Vault Documents
                </span>
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">{stats.totalCount}</div>
              <p className="text-xs text-muted-foreground">
                {stats.statusCounts.ready} ready • {stats.statusCounts.processing} processing
              </p>
            </div>

            {/* Ready Status */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Processed & Ready
                </span>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">{stats.statusCounts.ready}</div>
              <p className="text-xs text-muted-foreground">
                Indexed for search and query
              </p>
            </div>

            {/* Expiring Soon */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Expiring in 30 Days
                </span>
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">{stats.expiringCount}</div>
              <p className="text-xs text-muted-foreground">
                Action required soon
              </p>
            </div>

            {/* Unread Notifications */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Unread Notifications
                </span>
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                  <Bell className="h-5 w-5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">{stats.unreadNotificationCount}</div>
              <button
                onClick={() => navigate('/notifications')}
                className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                View notification center <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Main Grid: Recharts + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart: Document Types Breakdown — Requirement 13.2 */}
            <div className="lg:col-span-1 rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Document Types
                </h2>
              </div>
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--background)',
                        borderColor: 'var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Activity List — Requirement 13.4 */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Recent Activity
                  </h2>
                  <button
                    onClick={() => navigate('/documents')}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    View library
                  </button>
                </div>

                <div className="divide-y divide-border">
                  {stats.recentDocuments.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      No documents in your vault yet.
                    </p>
                  ) : (
                    stats.recentDocuments.map((doc) => (
                      <div
                        key={doc._id}
                        onClick={() => navigate(`/documents/${doc._id}`)}
                        className="py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/40 px-2 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-muted text-muted-foreground flex-shrink-0">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">{doc.title}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {doc.documentType} • {new Date(doc.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {doc.expiryDate && <ExpiryBadge expiryDate={doc.expiryDate} />}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
