interface CreateWisePaymentParams {
  amount: string;
  currency: string;
  description?: string;
  recipientName: string;
  accountNumber: string;
  routingNumber: string;
  reference?: string;
  enableProduction: boolean;
}

export async function createWisePayment(params: CreateWisePaymentParams) {
  const response = await fetch('/api/createWiseTransfer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create Wise payment');
  }

  return response.json();
} 