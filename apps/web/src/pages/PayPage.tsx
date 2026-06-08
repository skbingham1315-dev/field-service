import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, PaymentElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { api } from '../lib/api';
import { CheckCircle2, CreditCard, Lock, Loader2, AlertCircle } from 'lucide-react';

function fmt(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fmtDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  amountDueNow: number;
  downPaymentPending: boolean;
  downPaymentAmount: number | null;
  downPaymentDueDate: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  notes: string | null;
  lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; total: number; taxable: boolean }>;
  payments: Array<{ id: string; amount: number; method: string; notes?: string; paidAt: string }>;
  customer: { firstName: string; lastName: string; email: string | null };
  companyName: string;
}

interface PageData {
  invoice: InvoiceData;
  stripePublishableKey: string;
  savedCard: { brand: string; last4: string; paymentMethodId: string } | null;
}

interface CheckoutProps {
  token: string;
  invoice: InvoiceData;
  savedCard: PageData['savedCard'];
  onPaid: () => void;
}

function CheckoutForm({ token, invoice, savedCard, onPaid }: CheckoutProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const defaultAmount = invoice.amountDueNow;
  const payAmount = showCustom
    ? Math.min(Math.max(Math.round((parseFloat(customAmount) || 0) * 100), 1), invoice.amountDue)
    : defaultAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError('');

    try {
      // Create PaymentIntent for the chosen amount
      const { data } = await api.post(`/pay/${token}/intent`, { amount: payAmount });
      const { clientSecret } = data.data;

      const result = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: window.location.href,
          payment_method_data: {
            billing_details: {
              name: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
              email: invoice.customer.email ?? undefined,
            },
          },
        },
        redirect: 'if_required',
      });

      if (result.error) {
        setError(result.error.message ?? 'Payment failed. Please try again.');
      } else {
        onPaid();
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Amount selector */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-700 font-medium">
              {invoice.downPaymentPending ? 'Down Payment Due' : 'Balance Due'}
            </p>
            <p className="text-2xl font-bold text-blue-900">{fmt(defaultAmount)}</p>
            {invoice.dueDate && (
              <p className="text-xs text-blue-600 mt-0.5">Due {fmtDate(invoice.dueDate)}</p>
            )}
          </div>
          {invoice.amountDue > invoice.amountDueNow && (
            <div className="text-right text-xs text-blue-600">
              <p>Total balance: {fmt(invoice.amountDue)}</p>
              <p className="mt-0.5">Paying minimum now</p>
            </div>
          )}
        </div>

        {/* Pay different amount toggle */}
        {invoice.amountDue > 100 && (
          <div className="mt-3 pt-3 border-t border-blue-200">
            {!showCustom ? (
              <button
                type="button"
                onClick={() => setShowCustom(true)}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Pay a different amount
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-700 font-medium">$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={(invoice.amountDue / 100).toFixed(2)}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder={(defaultAmount / 100).toFixed(2)}
                  className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setShowCustom(false); setCustomAmount(''); }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stripe PaymentElement */}
      <div className="border border-gray-200 rounded-xl p-4">
        <PaymentElement
          options={{
            layout: 'tabs',
            defaultValues: {
              billingDetails: {
                name: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
                email: invoice.customer.email ?? undefined,
              },
            },
          }}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={processing || !stripe}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl text-base transition-colors flex items-center justify-center gap-2"
      >
        {processing ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</>
        ) : (
          <><Lock className="h-4 w-4" /> Pay {fmt(payAmount)}</>
        )}
      </button>

      <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
        <Lock className="h-3 w-3" />
        Secure payment powered by Stripe
      </p>
    </form>
  );
}

function PaidBanner({ invoice }: { invoice: InvoiceData }) {
  return (
    <div className="text-center py-8">
      <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="h-9 w-9 text-green-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Invoice Paid — Thank You!</h2>
      <p className="text-gray-600 text-sm mb-6">
        Your payment for Invoice {invoice.invoiceNumber} has been received.
      </p>
      <div className="bg-green-50 rounded-xl p-4 text-sm text-green-800 font-medium">
        {fmt(invoice.total)} — Paid in Full
      </div>
    </div>
  );
}

export function PayPage({ token }: { token: string }) {
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);

  useEffect(() => {
    api.get(`/pay/${token}`)
      .then(({ data }) => {
        const pd: PageData = data.data;
        setPageData(pd);
        if (pd.invoice.status === 'paid') setPaid(true);
        if (pd.stripePublishableKey) {
          setStripePromise(loadStripe(pd.stripePublishableKey));
          // Pre-fetch a payment intent with default amount
          setLoadingIntent(true);
          return api.post(`/pay/${token}/intent`, { amount: pd.invoice.amountDueNow })
            .then(({ data: id }) => setClientSecret(id.data.clientSecret))
            .catch(() => { /* handled in UI */ })
            .finally(() => setLoadingIntent(false));
        }
      })
      .catch((err) => {
        const msg = err?.response?.data?.error?.message ?? 'Invoice not found.';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Invoice Not Found</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const inv = pageData!.invoice;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{inv.companyName}</h1>
              <p className="text-sm text-gray-500">Invoice {inv.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{fmt(inv.total)}</p>
              <p className="text-xs text-gray-500">Invoice Total</p>
            </div>
          </div>

          <div className="text-sm text-gray-700">
            <span className="font-medium">{inv.customer.firstName} {inv.customer.lastName}</span>
            {inv.customer.email && <span className="text-gray-400 ml-2">{inv.customer.email}</span>}
          </div>

          {/* Line items */}
          <div className="mt-4 border-t border-gray-100 pt-4 space-y-1.5">
            {inv.lineItems.map((li) => (
              <div key={li.id} className="flex justify-between text-sm">
                <span className="text-gray-700">{li.description} {li.quantity !== 1 ? `×${li.quantity}` : ''}</span>
                <span className="text-gray-900 font-medium">{fmt(li.total)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-4 border-t border-gray-100 pt-3 space-y-1 text-sm">
            {inv.taxAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Tax</span><span>{fmt(inv.taxAmount)}</span>
              </div>
            )}
            {inv.discountAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Discount</span><span>−{fmt(inv.discountAmount)}</span>
              </div>
            )}
            {inv.amountPaid > 0 && (
              <div className="flex justify-between text-green-700 font-medium">
                <span>Paid</span><span>−{fmt(inv.amountPaid)}</span>
              </div>
            )}
            {inv.amountDue > 0 && (
              <div className="flex justify-between text-blue-700 font-bold text-base pt-1 border-t border-gray-100">
                <span>Balance Due</span><span>{fmt(inv.amountDue)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment history */}
        {inv.payments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Payment History
            </p>
            <div className="space-y-2">
              {inv.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div className="text-gray-700">
                    <span className="font-medium text-green-700">{fmt(p.amount)}</span>
                    <span className="text-gray-400 ml-2 capitalize">{p.method}</span>
                    {p.notes && <span className="text-gray-400 ml-1">· {p.notes}</span>}
                  </div>
                  <span className="text-gray-400">{fmtDate(p.paidAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment form or paid banner */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {paid ? (
            <PaidBanner invoice={inv} />
          ) : !stripePromise ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              <CreditCard className="h-8 w-8 mx-auto mb-3 opacity-40" />
              Online payments not configured. Please contact {inv.companyName} to pay.
            </div>
          ) : loadingIntent || !clientSecret ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
            </div>
          ) : (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: { theme: 'stripe', variables: { colorPrimary: '#2563eb', borderRadius: '8px' } },
              }}
            >
              <CheckoutForm
                token={token}
                invoice={inv}
                savedCard={pageData!.savedCard}
                onPaid={() => setPaid(true)}
              />
            </Elements>
          )}
        </div>

        {inv.notes && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700">{inv.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
