import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Button, Input, Textarea, Select,
} from '@fsp/ui';
import { api } from '../../lib/api';

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amountDue: number;
}

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
}

export function RecordPaymentModal({ invoice, onClose }: Props) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split('T')[0]);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/invoices/${invoice!.id}/mark-paid`, {
        amount: Math.round(parseFloat(amount || '0') * 100) || invoice!.amountDue,
        method,
        notes: notes || undefined,
        paidAt: new Date(paidAt).toISOString(),
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      handleClose();
    },
  });

  const handleClose = () => {
    setAmount('');
    setMethod('cash');
    setNotes('');
    setPaidAt(new Date().toISOString().split('T')[0]);
    onClose();
  };

  if (!invoice) return null;

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            {invoice.invoiceNumber} · Due: {formatMoney(invoice.amountDue)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            label="Amount ($)"
            type="number"
            min="0.01"
            step="0.01"
            placeholder={((invoice.amountDue) / 100).toFixed(2)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Select
            label="Payment Method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="ach">ACH / Bank Transfer</option>
            <option value="stripe">Card (Stripe)</option>
            <option value="other">Other</option>
          </Select>
          <Input
            label="Date Paid"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
          <Textarea
            label="Notes"
            placeholder="Check #, reference, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={() => mutate()} loading={isPending}>Record Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
