'use client';

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
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons';
import { Settings } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentStepsView } from '@/components/agent-steps-view';
import type { MercuryPaymentRequest } from '@/types/mercury';
import type { PaymentDetails, TransferDetails } from '@/types/payment';
import {
  usePaymentDetector,
  type DetectionSnippet,
} from '@/agents/payment-detector-agent';
import {
  usePaymentPreparer,
  type PreparedTransferDetails,
} from '@/agents/payment-preparer-agent';
import { useAgentStepsStore } from '@/stores/agent-steps-store';
import { useSettings } from '@/hooks/use-settings';
import { OnboardingDialog } from '@/components/onboarding-dialog';
import { getConfigurationStatus } from '@/lib/auto-pay-settings';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Convert TransferDetails to PaymentInfo
function transferDetailsToPaymentInfo(
  details: PreparedTransferDetails,
  settings: any
): PaymentDetailsWithRecipient {
  const mercuryInfo: MercuryPaymentRequest = {
    recipientId: '', // Will be set after recipient creation
    amount: parseFloat(details.amount),
    paymentMethod: 'ach',
    idempotencyKey: crypto.randomUUID(),
  };

  // Extract recipient info from transfer details
  const recipientInfo = {
    name: details.targetAccount.accountHolderName || '',
    email: '', // Will need to be filled by user
    accountNumber: details.targetAccount.accountNumber || '',
    routingNumber: details.targetAccount.routingNumber || '',
    accountType: 'businessChecking' as const,
    address: {
      country: 'US',
      postalCode: '',
      region: '',
      city: '',
      address1: '',
    },
  };

  return {
    method: 'mercury',
    mercury: mercuryInfo,
    recipientInfo,
  };
}

// Add new types
interface RecipientInfo {
  id?: string; // Add id for existing recipients
  name: string;
  email: string;
  accountNumber: string;
  routingNumber: string;
  accountType: 'businessChecking' | 'personalChecking';
  address: {
    country: string;
    postalCode: string;
    region: string;
    city: string;
    address1: string;
  };
}

interface PaymentDetailsWithRecipient {
  method: 'mercury';
  mercury: MercuryPaymentRequest;
  recipientInfo: RecipientInfo;
}

// Add new types for candidate fields
interface CandidateField {
  field: string;
  value: string;
  confidence: number;
  lineIndex: number;
  source: string;
}

export default function Home() {
  const [step, setStep] = useState<
    'idle' | 'detecting' | 'detected' | 'preparing' | 'review' | 'creating'
  >('idle');
  const [selectedDetection, setSelectedDetection] =
    useState<DetectionSnippet | null>(null);
  const [paymentDetails, setPaymentDetails] =
    useState<PaymentDetailsWithRecipient | null>(null);
  const [transferDetails, setTransferDetails] =
    useState<TransferDetails | null>(null);
  const [creatingTransfer, setCreatingTransfer] = useState(false);
  const [recognizedItemId] = useState(() => crypto.randomUUID());
  const { settings, isLoading } = useSettings();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const config = getConfigurationStatus(settings);
  const [showRecipientConfirmation, setShowRecipientConfirmation] =
    useState(false);
  const [existingRecipientDetails, setExistingRecipientDetails] =
    useState<RecipientInfo | null>(null);
  const [confirmedRecipientId, setConfirmedRecipientId] = useState<
    string | null
  >(null);
  const [candidates, setCandidates] = useState<CandidateField[]>([]);

  const {
    result: detectionResult,
    detectPayments,
    isProcessing: isDetecting,
    abort: abortDetection,
  } = usePaymentDetector(recognizedItemId);
  console.log('0xHypr', 'Detection result:', detectionResult);
  console.log('0xHypr', 'Detection isProcessing:', isDetecting);
  const {
    result: preparationResult,
    prepareTransfer,
    isProcessing: isPreparing,
    abort: abortPreparation,
  } = usePaymentPreparer(recognizedItemId);

  console.log('0xHypr', 'Preparation result:', preparationResult);
  console.log('0xHypr', 'Preparation isProcessing:', isPreparing);

  // Clear steps when component unmounts
  useEffect(() => {
    return () => {
      useAgentStepsStore.getState().clearSteps(recognizedItemId);
    };
  }, [recognizedItemId]);

  // Show onboarding dialog when Mercury is not configured
  useEffect(() => {
    if (!isLoading) {
      if (!config.mercury.isConfigured) {
        setShowOnboarding(true);
      }
    }
  }, [config, isLoading]);

  const handleDetect = async () => {
    setStep('detecting');
    useAgentStepsStore.getState().clearSteps(recognizedItemId);
    const result = await detectPayments();
    if (result.detections.length > 0) {
      setStep('detected');
    } else {
      setStep('idle');
    }
  };

  const handlePreparePayment = useCallback(
    async (detection: DetectionSnippet) => {
      setSelectedDetection(detection);
      setStep('preparing');
      setCandidates([]); // Clear previous candidates

      const result = await prepareTransfer(detection.snippet, detection.id);

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
          // Store candidates if available
          if (result.transfer.candidates) {
            setCandidates(result.transfer.candidates);
          }

          const paymentDetails = transferDetailsToPaymentInfo(
            result.transfer.details,
            settings
          );
          setPaymentDetails(paymentDetails);
          setStep('review');

          // Show confidence toast
          toast({
            title: 'Payment Details Prepared',
            description: `Extracted with ${result.transfer.confidence}% confidence`,
          });

          // If there were updates or overrides, show explanation
          if (result.transfer.explanation) {
            toast({
              title: 'Details Updated',
              description: result.transfer.explanation,
            });
          }
        } catch (error) {
          console.error('0xHypr', 'Error converting transfer details:', error);
          setStep('idle');
          toast({
            title: 'Error',
            description: 'Failed to prepare payment details',
            variant: 'destructive',
          });
        }
      } else {
        setStep('idle');
      }
    },
    [prepareTransfer, settings]
  );

  const handleCreateTransfer = async () => {
    if (!paymentDetails?.mercury || !paymentDetails.recipientInfo) return;

    try {
      if (!confirmedRecipientId) {
        setCreatingTransfer(true);

        // First create/get recipient
        const recipientResponse = await fetch('/api/createMercuryRecipient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentDetails.recipientInfo),
        });

        const recipientData = await recipientResponse.json();

        if (!recipientResponse.ok) {
          throw new Error(recipientData.error || 'Failed to create recipient');
        }

        // If existing recipient found, show confirmation dialog
        if (recipientData.needsConfirmation) {
          setExistingRecipientDetails({
            ...recipientData.existingDetails,
            id: recipientData.recipientId,
          });
          setShowRecipientConfirmation(true);
          setCreatingTransfer(false);
          return;
        }

        setConfirmedRecipientId(recipientData.recipientId);
      }

      // Proceed with transfer creation
      setCreatingTransfer(true);
      setStep('creating');

      const transferResponse = await fetch('/api/createMercuryTransfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentInfo: {
            ...paymentDetails.mercury,
            recipientId: confirmedRecipientId!, // We know it's set at this point
          },
        }),
      });

      const transferData = await transferResponse.json();

      if (!transferResponse.ok) {
        throw new Error(transferData.error || 'Failed to create transfer');
      }

      setTransferDetails({
        id: transferData.transferId,
        status: transferData.transfer.status,
        trackingUrl: transferData.transfer.dashboardLink,
        provider: 'mercury',
      });

      toast({
        title: 'Payment Created',
        description: 'Payment has been created successfully.',
      });

      // Reset the flow after successful Mercury payment
      setTimeout(() => {
        setStep('idle');
        setSelectedDetection(null);
        setPaymentDetails(null);
        setTransferDetails(null);
        setConfirmedRecipientId(null);
        setExistingRecipientDetails(null);
        useAgentStepsStore.getState().clearSteps(recognizedItemId);
      }, 3000);
    } catch (error) {
      console.error('0xHypr', 'Failed to create payment:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to create payment',
        variant: 'destructive',
      });
      setStep('review');
      useAgentStepsStore.getState().clearSteps(recognizedItemId);
    } finally {
      setCreatingTransfer(false);
    }
  };

  const getStepProgress = () => {
    switch (step) {
      case 'idle':
        return 0;
      case 'detecting':
        return 20;
      case 'detected':
        return 40;
      case 'preparing':
        return 60;
      case 'review':
        return 80;
      case 'creating':
        return 100;
      default:
        return 0;
    }
  };

  // Add recipient confirmation dialog
  const RecipientConfirmationDialog = () => (
    <Dialog
      open={showRecipientConfirmation}
      onOpenChange={(open) => {
        if (!open) {
          setShowRecipientConfirmation(false);
          setExistingRecipientDetails(null);
          setConfirmedRecipientId(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Existing Recipient Found</DialogTitle>
          <DialogDescription>
            We found an existing recipient with matching account details. Please
            confirm if this is the same recipient:
          </DialogDescription>
        </DialogHeader>
        {existingRecipientDetails && (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <div className="text-sm">{existingRecipientDetails.name}</div>
              </div>
              <div>
                <Label>Email</Label>
                <div className="text-sm">{existingRecipientDetails.email}</div>
              </div>
              <div>
                <Label>Account Number</Label>
                <div className="text-sm">
                  {existingRecipientDetails.accountNumber.replace(
                    /\d(?=\d{4})/g,
                    '*'
                  )}
                </div>
              </div>
              <div>
                <Label>Routing Number</Label>
                <div className="text-sm">
                  {existingRecipientDetails.routingNumber}
                </div>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowRecipientConfirmation(false);
              setExistingRecipientDetails(null);
              setConfirmedRecipientId(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (existingRecipientDetails?.id) {
                const recipientId = existingRecipientDetails.id;
                setConfirmedRecipientId(recipientId);
                setShowRecipientConfirmation(false);
                setExistingRecipientDetails(null);

                // Create a new transfer with the confirmed recipient ID
                if (paymentDetails?.mercury) {
                  setCreatingTransfer(true);
                  setStep('creating');

                  try {
                    const transferResponse = await fetch(
                      '/api/createMercuryTransfer',
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          paymentInfo: {
                            ...paymentDetails.mercury,
                            recipientId: recipientId,
                          },
                        }),
                      }
                    );

                    const transferData = await transferResponse.json();

                    if (!transferResponse.ok) {
                      throw new Error(
                        transferData.error || 'Failed to create transfer'
                      );
                    }

                    setTransferDetails({
                      id: transferData.transferId,
                      status: transferData.transfer.status,
                      trackingUrl: transferData.transfer.dashboardLink,
                      provider: 'mercury',
                    });

                    toast({
                      title: 'Payment Created',
                      description: 'Payment has been created successfully.',
                    });

                    // Reset the flow after successful Mercury payment
                    setTimeout(() => {
                      setStep('idle');
                      setSelectedDetection(null);
                      setPaymentDetails(null);
                      setTransferDetails(null);
                      setConfirmedRecipientId(null);
                      useAgentStepsStore
                        .getState()
                        .clearSteps(recognizedItemId);
                    }, 3000);
                  } catch (error) {
                    console.error('0xHypr', 'Failed to create payment:', error);
                    toast({
                      title: 'Error',
                      description:
                        error instanceof Error
                          ? error.message
                          : 'Failed to create payment',
                      variant: 'destructive',
                    });
                    setStep('review');
                    useAgentStepsStore.getState().clearSteps(recognizedItemId);
                  } finally {
                    setCreatingTransfer(false);
                  }
                }
              }
            }}
          >
            Confirm & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-5xl mx-auto p-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>auto pay</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOnboarding(true)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              hey! auto pay helps you handle payments instantly by spotting them
              on your screen (with your permission!)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-primary/5 border-none">
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <MagnifyingGlassIcon className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">1. spot & scan</h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      your zero-effort sidekick that notices payment info from
                      invoices, emails, and docs while you work
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-primary/5 border-none">
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <CheckCircledIcon className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">2. quick check</h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      take a peek to make sure it looks good. we'll handle the
                      rest with mercury
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-primary/5 border-none">
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <ArrowRightIcon className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">3. done!</h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      that's it! payment goes through mercury. no extra steps
                      needed
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-start space-x-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium">quick heads up:</span> hit
                      the settings icon up top to connect your mercury account
                      first!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Progress value={getStepProgress()} className="flex-1" />
                {step !== 'idle' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      abortDetection();
                      abortPreparation();
                      setStep('idle');
                      setSelectedDetection(null);
                      setPaymentDetails(null);
                      setTransferDetails(null);
                      useAgentStepsStore
                        .getState()
                        .clearSteps(recognizedItemId);
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>

              {step === 'idle' && (
                <div className="flex justify-center">
                  <Button
                    onClick={handleDetect}
                    disabled={!config.mercury.isConfigured}
                  >
                    <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
                    start scanning
                  </Button>
                </div>
              )}

              {step === 'detecting' && (
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                    <ReloadIcon className="h-4 w-4 animate-spin" />
                    <span>looking for payments...</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      abortDetection();
                      handleDetect();
                    }}
                  >
                    Retry Detection
                  </Button>
                </div>
              )}
              {console.log(step, detectionResult?.detections)}
              {step === 'detected' && detectionResult?.detections && (

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">
                      Found {detectionResult.detections.length} potential
                      payment
                      {detectionResult.detections.length === 1 ? '' : 's'}
                    </h3>
                    <Button variant="outline" size="sm" onClick={handleDetect}>
                      Scan Again
                    </Button>
                  </div>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-4">
                      {detectionResult.detections.map((detection, index) => (
                        <Card key={index}>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                            {console.log('0xHypr', 'Detection:', detection)}
                            </div>
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg">
                                {detection.label}
                              </CardTitle>
                              <Badge variant="outline">
                                {detection.confidence}% confident
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              <div className="text-sm text-muted-foreground">
                                {detection.snippet}
                              </div>
                              {detection.source && (
                                <div className="text-xs text-muted-foreground">
                                  Found in: {detection.source.app}{' '}
                                  {detection.source.window &&
                                    `- ${detection.source.window}`}
                                </div>
                              )}
                            </div>
                          </CardContent>
                          <CardFooter>
                            <Button
                              className="ml-auto"
                              onClick={() => handlePreparePayment(detection)}
                            >
                              <ArrowRightIcon className="mr-2 h-4 w-4" />
                              Prepare Payment
                            </Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {step === 'preparing' && (
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                    <ReloadIcon className="h-4 w-4 animate-spin" />
                    <span>Preparing payment details...</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      abortPreparation();
                      if (selectedDetection) {
                        handlePreparePayment(selectedDetection);
                      }
                    }}
                  >
                    Retry Preparation
                  </Button>
                </div>
              )}

              {step === 'review' &&
                paymentDetails?.mercury &&
                paymentDetails.recipientInfo && (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>Review Payment Details</CardTitle>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (selectedDetection) {
                                handlePreparePayment(selectedDetection);
                              }
                            }}
                          >
                            <ReloadIcon className="mr-2 h-4 w-4" />
                            Refresh Details
                          </Button>
                        </div>
                        {candidates.length > 0 && (
                          <CardDescription>
                            Multiple values were found. We've selected the most confident ones.
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                Amount
                              </Label>
                              <Input
                                value={paymentDetails.mercury.amount}
                                onChange={(e) => {
                                  setPaymentDetails({
                                    ...paymentDetails,
                                    mercury: {
                                      ...paymentDetails.mercury,
                                      amount: parseFloat(e.target.value),
                                    },
                                  });
                                }}
                                type="number"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                Recipient Name
                              </Label>
                              <Input
                                value={paymentDetails.recipientInfo.name}
                                onChange={(e) => {
                                  setPaymentDetails({
                                    ...paymentDetails,
                                    recipientInfo: {
                                      ...paymentDetails.recipientInfo,
                                      name: e.target.value,
                                    },
                                  });
                                }}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                Email
                              </Label>
                              <Input
                                value={paymentDetails.recipientInfo.email}
                                onChange={(e) => {
                                  setPaymentDetails({
                                    ...paymentDetails,
                                    recipientInfo: {
                                      ...paymentDetails.recipientInfo,
                                      email: e.target.value,
                                    },
                                  });
                                }}
                                type="email"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                Account Type
                              </Label>
                              <Input
                                value={paymentDetails.recipientInfo.accountType}
                                onChange={(e) => {
                                  setPaymentDetails({
                                    ...paymentDetails,
                                    recipientInfo: {
                                      ...paymentDetails.recipientInfo,
                                      accountType: e.target.value as
                                        | 'businessChecking'
                                        | 'personalChecking',
                                    },
                                  });
                                }}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                Account Number
                              </Label>
                              <Input
                                value={
                                  paymentDetails.recipientInfo.accountNumber
                                }
                                onChange={(e) => {
                                  setPaymentDetails({
                                    ...paymentDetails,
                                    recipientInfo: {
                                      ...paymentDetails.recipientInfo,
                                      accountNumber: e.target.value,
                                    },
                                  });
                                }}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                Routing Number
                              </Label>
                              <Input
                                value={
                                  paymentDetails.recipientInfo.routingNumber
                                }
                                onChange={(e) => {
                                  setPaymentDetails({
                                    ...paymentDetails,
                                    recipientInfo: {
                                      ...paymentDetails.recipientInfo,
                                      routingNumber: e.target.value,
                                    },
                                  });
                                }}
                                required
                              />
                            </div>
                          </div>

                          {/* Show candidates if available */}
                          {candidates.length > 0 && (
                            <div className="mt-6 space-y-2">
                              <Label className="text-sm font-medium">Alternative Values Found</Label>
                              <ScrollArea className="h-[200px] rounded-md border p-4">
                                <div className="space-y-4">
                                  {candidates.map((candidate, index) => (
                                    <div key={index} className="flex items-center justify-between text-sm">
                                      <div>
                                        <span className="font-medium">{candidate.field}:</span>{' '}
                                        {candidate.value}
                                        <p className="text-xs text-muted-foreground">
                                          Found in: {candidate.source}
                                        </p>
                                      </div>
                                      <Badge variant="outline">
                                        {candidate.confidence}% confident
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </ScrollArea>
                            </div>
                          )}
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button
                          className="ml-auto"
                          onClick={handleCreateTransfer}
                          disabled={creatingTransfer}
                        >
                          {creatingTransfer && (
                            <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Create Transfer
                        </Button>
                      </CardFooter>
                    </Card>
                  </div>
                )}

              {step === 'creating' && (
                <div className="flex items-center justify-center gap-2">
                  <ReloadIcon className="h-4 w-4 animate-spin" />
                  <span>Creating transfer...</span>
                </div>
              )}

              <Separator className="my-4" />

              <AgentStepsView recognizedItemId={recognizedItemId} />
            </div>
          </CardContent>

          {/* Feedback Section */}
          <div className="px-6 pb-6">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex flex-col items-center space-y-3 text-center">
                <h4 className="font-medium">Something not quite right?</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    Drop me a line at{' '}
                    <a
                      href="mailto:benjamin.shafii@gmail.com"
                      className="text-primary hover:underline"
                    >
                      benjamin.shafii@gmail.com
                    </a>
                  </p>
                  <p>
                    or{' '}
                    <a
                      href="https://cal.com/team/different-ai/auto-pay-feature-request"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      grab a quick call
                    </a>{' '}
                    and we'll make it work for your setup
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="ml-auto flex p-2 items-center w-full justify-end gap-2">
            <div className="text-xs text-muted-foreground">made by folks @</div>
            <a
              href="https://hyprsqrl.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src="/hyprsqrl-long-logo.png"
                alt="Made by hyprsqrl"
                className="h-10 opacity-30 hover:opacity-60 transition-opacity rounded-md"
              />
            </a>
          </div>
        </Card>
      </div>

      <OnboardingDialog
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
      />
      <RecipientConfirmationDialog />
    </div>
  );
}
