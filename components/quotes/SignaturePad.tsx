'use client';

import { useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  onSignatureChange: (dataURL: string) => void;
  readOnly?: boolean;
}

export default function SignaturePad({ onSignatureChange, readOnly }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas | null>(null);

  const handleEnd = useCallback(() => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      const dataURL = sigRef.current.toDataURL('image/png');
      onSignatureChange(dataURL);
    }
  }, [onSignatureChange]);

  const handleClear = () => {
    sigRef.current?.clear();
    onSignatureChange('');
  };

  if (readOnly) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="border rounded-lg bg-white overflow-hidden" style={{ width: 400, height: 200 }}>
        <SignatureCanvas
          ref={sigRef}
          canvasProps={{
            width: 400,
            height: 200,
            className: 'signature-canvas',
            style: { width: '100%', height: '100%' },
          }}
          penColor="black"
          minWidth={1.5}
          maxWidth={2.5}
          onEnd={handleEnd}
        />
      </div>
      <Button variant="outline" size="sm" onClick={handleClear}>
        <Eraser className="h-3.5 w-3.5 me-1" /> مسح التوقيع
      </Button>
    </div>
  );
}
