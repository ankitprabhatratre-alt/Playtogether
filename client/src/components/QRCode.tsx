import { useEffect, useState } from 'react';
import QR from 'qrcode';

/** QR code rendered locally (no external service) as an inline SVG. */
export function QRCode({ value, size = 168 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QR.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#120d2b', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [value]);
  if (!svg) return <div className="qr qr-empty" style={{ width: size, height: size }} />;
  return <div className="qr" style={{ width: size, height: size }} role="img" aria-label="QR code for the invitation link" dangerouslySetInnerHTML={{ __html: svg }} />;
}
