'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { CheckCircledIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { useSettings } from '@/hooks/use-settings';
import { useMercuryConnection } from '@/hooks/use-mercury-connection';
import { getConfigurationStatus } from '@/lib/auto-pay-settings';

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OnboardingDialog({ open, onOpenChange }: OnboardingDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { settings, updateSettings } = useSettings();
  const { isConnected, isConnecting, testConnection, disconnect } = useMercuryConnection();
  const config = getConfigurationStatus(settings);
  const [formData, setFormData] = useState({
    mercuryApiKey: settings?.customSettings?.['auto-pay']?.mercuryApiKey || '',
    mercuryAccountId: settings?.customSettings?.['auto-pay']?.mercuryAccountId || '',
  });

  const handleTestConnection = async () => {
    // Save settings temporarily for testing
    try {
      await updateSettings({
        namespace: 'auto-pay',
        isPartialUpdate: true,
        value: {
          mercuryApiKey: formData.mercuryApiKey,
          mercuryAccountId: formData.mercuryAccountId,
        },
      });
      await testConnection();
    } catch (error) {
      console.error('Failed to test connection:', error);
      toast({
        title: 'Error',
        description: 'Failed to test connection. Please check your API key.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      // If not connected yet, test connection first
      if (!isConnected) {
        const success = await testConnection();
        if (!success) {
          toast({
            title: 'Connection Failed',
            description: 'Please verify your Mercury API key and try again.',
            variant: 'destructive',
          });
          return;
        }
      }

      await updateSettings({
        namespace: 'auto-pay',
        isPartialUpdate: true,
        value: {
          mercuryApiKey: formData.mercuryApiKey,
          mercuryAccountId: formData.mercuryAccountId,
        },
      });

      toast({
        title: 'Settings Saved',
        description: 'Mercury settings have been saved.',
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Mercury Payment Settings</DialogTitle>
          <DialogDescription>
            Configure your Mercury API settings to enable automatic payments.
          </DialogDescription>
        </DialogHeader>

        {/* Configuration Status */}
        <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">Mercury</h3>
              {config.mercury.isConfigured ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircledIcon className="mr-1 h-3 w-3" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <ExclamationTriangleIcon className="mr-1 h-3 w-3" />
                  Not Connected
                </Badge>
              )}
            </div>
            {config.mercury.missing.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Missing: {config.mercury.missing.join(', ')}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mercuryApiKey">API Key</Label>
            <Input
              id="mercuryApiKey"
              type="password"
              value={formData.mercuryApiKey}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  mercuryApiKey: e.target.value,
                }))
              }
              placeholder="Enter your Mercury API key"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Mercury Account</Label>
              {isConnected ? (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={disconnect}
                  type="button"
                >
                  Disconnect Account
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={isConnecting || !formData.mercuryApiKey}
                  type="button"
                >
                  {isConnecting ? "Testing..." : "Test Connection"}
                </Button>
              )}
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>To use Mercury for payments:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Enter your Mercury API key above</li>
                <li>Click "Test Connection" to verify your credentials</li>
                <li>Click "Save Settings" to save your configuration</li>
              </ol>
            </div>
          </div>
        </div>

        <DialogFooter>
       </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 