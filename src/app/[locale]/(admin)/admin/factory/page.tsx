import { Metadata } from 'next';
import { FactoryOverview } from '@/components/admin/factory/FactoryOverview';
import { FactoryPageShell } from '@/components/admin/factory/FactoryPageShell';

export const metadata: Metadata = {
  title: 'Content Factory | NativPost Admin',
  description: 'Content Intelligence Engine command center',
};

export default function FactoryPage() {
  return (
    <FactoryPageShell>
      <FactoryOverview />
    </FactoryPageShell>
  );
}
