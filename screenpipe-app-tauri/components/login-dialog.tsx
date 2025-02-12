import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExternalLinkIcon } from 'lucide-react';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { useState } from 'react';

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LoginDialog: React.FC<LoginDialogProps> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>login required</DialogTitle>
          <DialogDescription>
            please login to continue. you will be redirected to screenpi.pe
          </DialogDescription>
        </DialogHeader>
        <div className='flex justify-end'>
          <Button
            variant='default'
            onClick={() => {
              openUrl('https://screenpi.pe/login');
              onOpenChange(false);
            }}
          >
            login <ExternalLinkIcon className='w-4 h-4 ml-2' />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const useLoginCheck = () => {
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  const checkLogin = (user: any | null, showDialog: boolean = true) => {
    if (!user?.token) {
      if (showDialog) setShowLoginDialog(true);
      return false;
    }
    return true;
  };

  return { showLoginDialog, setShowLoginDialog, checkLogin };
}; 