export interface WiseTransfer {
    targetAccount: number;
    quoteUuid: string;
    customerTransactionId: string;
    details: {
        reference: string;
        transferPurpose?: string;
        sourceOfFunds?: string;
    };
}

export interface WisePaymentInfo {
    amount: string;
    currency: string;
    recipientName: string;
    accountNumber: string;
    routingNumber: string;
    reference?: string;
    recipientEmail?: string;
}

export interface PaymentInfo {
    amount: string;
    recipientId: string;
    recipientName?: string;
    recipientEmail?: string;
    accountNumber?: string;
    reference?: string;
}

export interface WiseSettings {
    wiseApiToken: string;
    wiseProfileId: number;
    analysisWindow: number;
}
