import { getAdminAuditLogs } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, History, Sliders, AlertCircle, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Settings & Audit Log | Heavy Equipment System",
  description: "Platform governance settings and administrative audit trail.",
};

export default async function AdminSettingsPage() {
  const auditLogs = await getAdminAuditLogs();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
          Platform Governance & System Settings
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Heavy equipment rental rules, administrative role management, and audit log history.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Governance Guidelines */}
        <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
            <Sliders className="h-5 w-5 text-primary" />
            <h3 className="font-heading text-base font-bold text-foreground">
              Equipment Marketplace Policies
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="rounded-xl bg-muted/30 p-3.5 border border-border/60">
              <span className="font-bold text-foreground block text-sm mb-1">
                Machinery Inspection & Certification
              </span>
              <p className="text-muted-foreground leading-relaxed">
                All registered excavators, mobile cranes, and compaction equipment must submit valid annual third-party load test certifications. Uncertified units flagged by renters are placed in restricted status until recertified.
              </p>
            </div>

            <div className="rounded-xl bg-muted/30 p-3.5 border border-border/60">
              <span className="font-bold text-foreground block text-sm mb-1">
                Account Status Governance
              </span>
              <p className="text-muted-foreground leading-relaxed">
                • <strong className="text-foreground">Restricted:</strong> User retains browse capabilities but cannot publish new inventory or initiate rental reservations.<br />
                • <strong className="text-foreground">Banned:</strong> All active sessions and listings are suspended immediately.<br />
                • <strong className="text-foreground">Deleted:</strong> Soft-delete maintains transactional accounting integrity while anonymizing credentials.
              </p>
            </div>

            <div className="rounded-xl bg-muted/30 p-3.5 border border-border/60">
              <span className="font-bold text-foreground block text-sm mb-1">
                Soft-Deletion Architecture
              </span>
              <p className="text-muted-foreground leading-relaxed">
                When equipment or accounts are removed, soft-deletion status prevents data loss and preserves binding contracts, rental history, and payouts. Administrators can restore units at any time.
              </p>
            </div>
          </div>
        </Card>

        {/* Admin Role Documentation */}
        <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h3 className="font-heading text-base font-bold text-foreground">
              Administrator Role Assignment
            </h3>
          </div>

          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <p>
              The platform utilizes a dual-layered security model connecting <strong className="text-foreground">Clerk User Public Metadata</strong> and <strong className="text-foreground">Supabase Profiles Row Level Security</strong>.
            </p>

            <div className="rounded-xl bg-primary/5 p-4 border border-primary/20 space-y-2">
              <span className="font-semibold text-foreground text-xs block">
                How to Promote a User to Admin:
              </span>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Go to your <strong className="text-foreground">Clerk Dashboard → Users</strong>.</li>
                <li>Select the target user account.</li>
                <li>In <strong className="text-foreground">Public Metadata</strong>, set <code className="bg-background px-1.5 py-0.5 rounded text-[11px] font-mono text-primary font-bold">&#123; &quot;role&quot;: &quot;admin&quot; &#125;</code>.</li>
                <li>Optionally execute in Supabase SQL Editor: <code className="block mt-1 bg-background p-2 rounded text-[11px] font-mono text-primary">UPDATE public.profiles SET role = &apos;admin&apos; WHERE email = &apos;target@example.com&apos;;</code></li>
              </ol>
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-muted/30 p-3 border border-border/60">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Administrative privileges take effect immediately on next page navigation or session refresh.
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Admin Audit Trail */}
      <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">
                Administrative Audit Log
              </h3>
              <p className="text-xs text-muted-foreground">
                Tamper-evident trail of all restrictive and restorative administrative actions
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {auditLogs.length} Logged Events
          </Badge>
        </div>

        {auditLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/60 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Target ID</th>
                  <th className="px-4 py-3">Details / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground font-mono">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                      {log.admin_email || log.admin_id.slice(0, 14)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant="outline" className="font-mono text-[10px] capitalize">
                        {log.action.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap capitalize text-muted-foreground">
                      {log.target_type}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {log.target_id.slice(0, 16)}...
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {(log.details?.reason as string) || (log.details?.newStatus as string) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No audit events recorded yet. Admin operations will automatically generate records here.
          </div>
        )}
      </Card>
    </div>
  );
}
