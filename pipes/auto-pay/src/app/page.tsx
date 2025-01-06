'use client'
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import {
  ReloadIcon,
  ArrowRightIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  MagnifyingGlassIcon,
} from '@radix-ui/react-icons';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentStepsView } from '@/components/agent-steps-view';
import type { PaymentInfo } from '@/types/wise';
import {
  usePaymentDetector,
  type DetectedPayment,
} from '@/agents/payment-detector-agent';
import {
  usePaymentPreparer,
  type TransferDetails,
} from '@/agents/payment-preparer-agent';
import { useAgentStepsStore } from '@/stores/agent-steps-store';
import { useSettings } from '@/hooks/use-settings';

// Convert TransferDetails to PaymentInfo
function transferDetailsToPaymentInfo(details: TransferDetails): PaymentInfo {
  return {
    amount: details.amount,
    currency: details.currency,
    recipientName: details.targetAccount.accountHolderName || '',
    accountNumber: details.targetAccount.accountNumber || '',
    routingNumber: details.targetAccount.routingNumber || '',
    reference: details.reference || '',
  };
}

interface WiseTransferDetails {
  id: string;
  status: string;
  wiseUrl: string;
}

export default function Home() {
  const [step, setStep] = useState<
    | 'idle'
    | 'detecting'
    | 'detected'
    | 'preparing'
    | 'review'
    | 'creating'
    | 'funding'
  >('idle');
  const [selectedPayment, setSelectedPayment] =
    useState<DetectedPayment | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [transferDetails, setTransferDetails] =
    useState<WiseTransferDetails | null>(null);
  const [creatingTransfer, setCreatingTransfer] = useState(false);
  const [fundingTransfer, setFundingTransfer] = useState(false);
  const [recognizedItemId] = useState(() => crypto.randomUUID());
  const { settings } = useSettings();

  // Remove separate transferId state and use transferDetails.id instead
  const transferId = transferDetails?.id;

  // Use both agents with abort capability
  const {
    result: detectionResult,
    detectPayments,
    isProcessing: isDetecting,
    abort: abortDetection,
  } = usePaymentDetector(recognizedItemId);
  const {
    result: preparationResult,
    prepareTransfer,
    isProcessing: isPreparing,
    abort: abortPreparation,
  } = usePaymentPreparer(recognizedItemId);

  // Clear steps when component unmounts
  useEffect(() => {
    return () => {
      useAgentStepsStore.getState().clearSteps(recognizedItemId);
    };
  }, [recognizedItemId]);

  const handleDetect = async () => {
    setStep('detecting');
    useAgentStepsStore.getState().clearSteps(recognizedItemId);
    const result = await detectPayments();
    if (result.payments.length > 0) {
      setStep('detected');
    } else {
      setStep('idle');
    }
  };

  const handlePreparePayment = useCallback(
    async (payment: DetectedPayment) => {
      setSelectedPayment(payment);
      setStep('preparing');

      const result = await prepareTransfer(payment.vitalInfo);

      if ('error' in result) {
        toast({
          title: 'Preparation Failed',
          description: result.error,
          variant: 'destructive',
        });
        setStep('idle');
        return;
      }

      if (result.transfer) {
        try {
          // Try to convert transfer details to payment info
          const paymentInfo = transferDetailsToPaymentInfo(
            result.transfer.details
          );
          setPaymentInfo(paymentInfo);
          setStep('review');
        } catch (error) {
          // If conversion fails, use the original payment info from detection
          console.log('0xHypr', 'Using detected payment info as fallback');
          setPaymentInfo(payment.paymentInfo);
          setStep('review');
        }
      } else {
        setStep('idle');
      }
    },
    [prepareTransfer, toast]
  );

  const handleCreateTransfer = async () => {
    if (!paymentInfo) return;
    try {
      setCreatingTransfer(true);
      setStep('creating');
      const res = await fetch('/api/createTransfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentInfo }),
      });
      const data = await res.json();
      if (data.transfer?.id) {
        const transferId = data.transfer.id.toString();
        const status =
          typeof data.transfer.status === 'string'
            ? data.transfer.status
            : 'created';
        // sample link https://sandbox.transferwise.tech/transactions/activities/by-resource/TRANSFER/54689164
        const baseUrl = settings?.customSettings?.['auto-pay']?.enableProduction
          ? 'https://wise.com'
          : 'https://sandbox.transferwise.tech';

        const wiseUrl = `${baseUrl}/transactions/activities/by-resource/TRANSFER/${transferId}`;
        setTransferDetails({
          id: transferId,
          status,
          wiseUrl,
        });
        setStep('funding');
        toast({
          title: 'Transfer Created',
          description: `Transfer #${transferId} has been created successfully.`,
        });
      }
    } catch (error) {
      console.error('Failed to create transfer:', error);
      toast({
        title: 'Error',
        description: 'Failed to create transfer',
        variant: 'destructive',
      });
      setStep('review');
    } finally {
      setCreatingTransfer(false);
    }
  };

  const handleFundTransfer = async () => {
    if (!transferDetails) return;
    try {
      setFundingTransfer(true);
      await fetch('/api/fundTransfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferId: transferDetails.id }),
      });
      toast({
        title: 'Success!',
        description: 'Transfer has been funded and is being processed.',
      });
      // Reset the flow
      setTimeout(() => {
        setStep('idle');
        setSelectedPayment(null);
        setPaymentInfo(null);
        setTransferDetails(null);
        useAgentStepsStore.getState().clearSteps(recognizedItemId);
      }, 3000);
    } catch (error) {
      console.error('Failed to fund transfer:', error);
      toast({
        title: 'Error',
        description: 'Failed to fund transfer',
        variant: 'destructive',
      });
    } finally {
      setFundingTransfer(false);
    }
  };

  const getStepProgress = () => {
    switch (step) {
      case 'idle':
        return 0;
      case 'detecting':
        return 15;
      case 'detected':
        return 30;
      case 'preparing':
        return 45;
      case 'review':
        return 60;
      case 'creating':
        return 75;
      case 'funding':
        return 90;
      default:
        return 0;
    }
  };
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-5xl mx-auto p-8">
        <div className="space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Auto-Pay</h1>
            <p className="text-muted-foreground">
              Automatically process payments from your screen activity
            </p>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <Progress value={getStepProgress()} className="h-2" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Detect</span>
              <span>Prepare</span>
              <span>Review</span>
              <span>Create</span>
              <span>Fund</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="col-span-2 space-y-6">
              {step === 'idle' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Start New Payment</CardTitle>
                    <CardDescription>
                      We'll analyze your recent screen activity to detect
                      payment information
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={handleDetect}
                      disabled={isDetecting}
                      size="lg"
                      className="w-full"
                    >
                      {isDetecting ? (
                        <>
                          <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                          Detecting...
                        </>
                      ) : (
                        <>
                          <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
                          Start Detection
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {step === 'detecting' && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center justify-center space-y-4 py-6">
                      <ReloadIcon className="h-8 w-8 animate-spin text-primary" />
                      <div className="text-center">
                        <h3 className="font-semibold">Detecting Payments</h3>
                        <p className="text-sm text-muted-foreground">
                          Looking for payment information...
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          abortDetection();
                          setStep('idle');
                        }}
                        className="mt-4"
                      >
                        <CrossCircledIcon className="mr-2 h-4 w-4" />
                        Cancel Detection
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 'detected' && detectionResult?.payments && (
                <Card>
                  <CardHeader>
                    <CardTitle>Detected Payments</CardTitle>
                    <CardDescription>
                      Select a payment to prepare
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {detectionResult.payments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 cursor-pointer"
                          onClick={() => handlePreparePayment(payment)}
                        >
                          <div className="space-y-1">
                            <div className="font-medium">{payment.summary}</div>
                            <div className="text-sm text-muted-foreground">
                              {payment.source.app} -{' '}
                              {new Date(payment.timestamp).toLocaleString()}
                            </div>
                          </div>
                          <Badge variant="secondary">
                            {payment.confidence}% confidence
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setStep('idle');
                        useAgentStepsStore
                          .getState()
                          .clearSteps(recognizedItemId);
                      }}
                      className="w-full"
                    >
                      <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
                      Detect More
                    </Button>
                  </CardFooter>
                </Card>
              )}

              {step === 'preparing' && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center justify-center space-y-4 py-6">
                      <ReloadIcon className="h-8 w-8 animate-spin text-primary" />
                      <div className="text-center">
                        <h3 className="font-semibold">Preparing Payment</h3>
                        <p className="text-sm text-muted-foreground">
                          Extracting payment details...
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          abortPreparation();
                          setStep('detected');
                        }}
                        className="mt-4"
                      >
                        <CrossCircledIcon className="mr-2 h-4 w-4" />
                        Cancel Preparation
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 'review' && paymentInfo && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Review Payment Details</CardTitle>
                      <Badge variant="outline" className="font-mono">
                        {paymentInfo.currency}
                      </Badge>
                    </div>
                    <CardDescription>
                      Please verify the payment information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Payment Amount */}
                    <div className="rounded-lg bg-primary/5 p-4">
                      <div className="text-3xl font-bold text-primary">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: paymentInfo.currency,
                        }).format(Number(paymentInfo.amount))}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Total Amount
                      </div>
                    </div>

                    {/* Bank Details */}
                    <div className="space-y-4">
                      <h4 className="font-medium">Bank Account Details</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-sm text-muted-foreground">
                            Account Number
                          </label>
                          <div className="font-mono bg-muted p-2 rounded">
                            {paymentInfo.accountNumber}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm text-muted-foreground">
                            Routing Number
                          </label>
                          <div className="font-mono bg-muted p-2 rounded">
                            {paymentInfo.routingNumber}
                          </div>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Additional Details */}
                    {paymentInfo.recipientName && (
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">
                          Recipient
                        </label>
                        <div className="font-medium">
                          {paymentInfo.recipientName}
                        </div>
                      </div>
                    )}
                    {paymentInfo.reference && (
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">
                          Reference
                        </label>
                        <div className="font-mono text-sm">
                          {paymentInfo.reference}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setStep('detected');
                        setPaymentInfo(null);
                      }}
                    >
                      <CrossCircledIcon className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateTransfer}
                      disabled={creatingTransfer}
                    >
                      <CheckCircledIcon className="mr-2 h-4 w-4" />
                      Confirm & Create Transfer
                    </Button>
                  </CardFooter>
                </Card>
              )}

              {(step === 'creating' || step === 'funding') &&
                transferDetails && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {step === 'creating'
                          ? 'Creating Transfer'
                          : 'Processing Payment'}
                      </CardTitle>
                      <CardDescription>
                        Transfer #{transferDetails.id}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        {/* Transfer Status */}
                        <div className="rounded-lg bg-primary/5 p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm text-muted-foreground">
                                Status
                              </div>
                              <div className="font-medium">
                                {transferDetails.status || 'Processing'}
                              </div>
                            </div>
                            {step === 'funding' && (
                              <Badge variant="outline">Ready to Fund</Badge>
                            )}
                          </div>
                        </div>

                        {/* Payment Details */}
                        {paymentInfo && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="text-sm text-muted-foreground">
                                Amount
                              </div>
                              <div className="font-medium">
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: paymentInfo.currency,
                                }).format(Number(paymentInfo.amount))}
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="text-sm text-muted-foreground">
                                Recipient
                              </div>
                              <div className="font-medium">
                                {paymentInfo.recipientName}
                              </div>
                            </div>
                            {paymentInfo.reference && (
                              <div className="flex items-center justify-between">
                                <div className="text-sm text-muted-foreground">
                                  Reference
                                </div>
                                <div className="font-mono text-sm">
                                  {paymentInfo.reference}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Wise Link */}
                        {transferDetails.wiseUrl && (
                          <div className="pt-4">
                            <a
                              href={transferDetails.wiseUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
                            >
                              <ArrowRightIcon className="mr-2 h-4 w-4" />
                              View on Wise
                            </a>
                          </div>
                        )}

                        {/* Fund Button */}
                        {step === 'funding' && (
                          <Button
                            onClick={handleFundTransfer}
                            disabled={fundingTransfer}
                            className="w-full"
                          >
                            {fundingTransfer ? (
                              <>
                                <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <ArrowRightIcon className="mr-2 h-4 w-4" />
                                Complete Payment
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
            </div>

            {/* Agent Steps Sidebar */}
            <div className="col-span-1">
              <Card className="h-[calc(100vh-12rem)] flex flex-col">
                <CardHeader className="flex-shrink-0">
                  <CardTitle>Agent Progress</CardTitle>
                  <CardDescription>
                    {step === 'detecting' || step === 'detected'
                      ? 'Payment detection steps'
                      : step === 'preparing' || step === 'review'
                      ? 'Payment preparation steps'
                      : 'Real-time progress'}
                  </CardDescription>
                </CardHeader>
                <ScrollArea className="flex-1">
                  <AgentStepsView
                    recognizedItemId={recognizedItemId}
                    className="p-4"
                  />
                </ScrollArea>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
