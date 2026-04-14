import DashboardLayout from './DashboardClientLayout';

export const dynamic = 'force-dynamic';

export default function DashboardLayoutGate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
