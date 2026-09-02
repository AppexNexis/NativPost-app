import { Metadata } from 'next';
import { FactoryOperations } from '@/components/admin/factory/FactoryOperations';
import { FactoryPageShell } from '@/components/admin/factory/FactoryPageShell';

export const metadata: Metadata = {
  title: 'Factory Operations | NativPost Admin',
  description: 'Generation pipeline visibility and provenance tracking',
};

export default function FactoryOperationsPage() {
  return (
    <FactoryPageShell>
      <FactoryOperations />
    </FactoryPageShell>
  );
}
