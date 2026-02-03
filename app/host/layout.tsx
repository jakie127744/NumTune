import React from 'react';
import { HostGameEngine } from '@/components/host/HostGameEngine';

export default function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <HostGameEngine />
      {children}
    </>
  );
}
