import { Metadata } from 'next';
import { FactoryDemand } from '@/components/admin/factory/FactoryDemand';
import { FactoryPageShell } from '@/components/admin/factory/FactoryPageShell';

export const metadata: Metadata = {
  title: 'Content Demand | NativPost Admin',
  description: 'Content generation demand and inventory gaps',
};

export default function FactoryDemandPage() {
  return (
    <FactoryPageShell>
      <FactoryDemand />
    </FactoryPageShell>
  );
}
