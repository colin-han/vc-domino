'use client';
import { useState } from 'react';
import { TransactionModal, type TransactionModalProps } from './transaction-modal';

export function TransactionAddButton({
  modalCtx,
}: {
  modalCtx: Omit<TransactionModalProps, 'open' | 'onClose' | 'presetSide'>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-zinc-900 px-3 py-1 text-xs text-white"
      >
        + 添加交易
      </button>
      <TransactionModal {...modalCtx} open={open} onClose={() => setOpen(false)} presetSide={null} />
    </>
  );
}
