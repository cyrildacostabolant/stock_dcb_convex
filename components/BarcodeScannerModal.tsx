import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, Zap, RefreshCw, AlertCircle, Barcode, Check } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  description?: string;
}

// Play pleasant confirmation beep upon detection
const playBeep = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
    if ('vibrate' in navigator) {
      navigator.vibrate(80);
    }
  } catch (e) {
    // AudioContext might be blocked or unavailable, ignore safely
  }
};

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = "Scanner un code-barres",
  description = "Pointez la caméra vers le code-barres de l'article"
}) => {
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "barcode-scanner-viewport";
  const hasScannedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn("Error stopping scanner:", err);
      }
      scannerRef.current = null;
    }
  }, []);

  const handleScanSuccess = useCallback((decodedText: string) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    playBeep();
    stopScanner();
    onScan(decodedText.trim());
    onClose();
  }, [onScan, onClose, stopScanner]);

  const startScanner = useCallback(async (cameraId?: string) => {
    setIsInitializing(true);
    setScannerError(null);
    hasScannedRef.current = false;

    await stopScanner();

    try {
      const availableCameras = await Html5Qrcode.getCameras();
      if (!availableCameras || availableCameras.length === 0) {
        setScannerError("Aucune caméra détectée sur cet appareil.");
        setIsInitializing(false);
        return;
      }

      setCameras(availableCameras);

      // Prefer back/environment camera if not specified
      let selectedId = cameraId;
      if (!selectedId) {
        const backCam = availableCameras.find(c => 
          c.label.toLowerCase().includes('back') || 
          c.label.toLowerCase().includes('arrière') ||
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment')
        );
        selectedId = backCam ? backCam.id : availableCameras[0].id;
      }
      setCurrentCameraId(selectedId);

      const html5QrCode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false
      });
      scannerRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: { width: 280, height: 160 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        selectedId,
        config,
        (decodedText) => handleScanSuccess(decodedText),
        () => {
          // Frame read callback without detection - keep silent
        }
      );

      // Check if torch/flashlight is supported
      try {
        const runningTrack = (html5QrCode as any).getRunningTrackCapabilities?.();
        if (runningTrack && 'torch' in runningTrack) {
          setSupportsTorch(true);
        }
      } catch (e) {
        setSupportsTorch(false);
      }

      setIsInitializing(false);
    } catch (err: any) {
      console.error("Camera start error:", err);
      let errorMsg = "Impossible d'accéder à la caméra.";
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        errorMsg = "Autorisation de la caméra refusée. Veuillez autoriser l'accès à la caméra dans votre navigateur.";
      } else if (err.name === 'NotFoundError') {
        errorMsg = "Aucun appareil photo trouvé.";
      } else if (err.name === 'NotReadableError') {
        errorMsg = "La caméra est déjà utilisée par une autre application.";
      }
      setScannerError(errorMsg);
      setIsInitializing(false);
    }
  }, [stopScanner, handleScanSuccess]);

  const toggleTorch = async () => {
    if (!scannerRef.current || !supportsTorch) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any]
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn("Failed to toggle torch:", e);
    }
  };

  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === currentCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    startScanner(cameras[nextIndex].id);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    playBeep();
    stopScanner();
    onScan(manualCode.trim());
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setManualCode('');
      setShowManualInput(false);
      // Small timeout to ensure DOM container is rendered
      const timer = setTimeout(() => {
        startScanner();
      }, 100);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen, startScanner, stopScanner]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gray-900/90 border-b border-gray-800 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5 text-white">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl">
              <Barcode size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base md:text-lg">{title}</h3>
              <p className="text-xs text-gray-400">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Viewport / Scanner */}
        <div className="relative flex-1 bg-black flex flex-col items-center justify-center min-h-[300px] overflow-hidden">
          {/* HTML5 QR Code Mount point */}
          <div 
            id={scannerContainerId} 
            className="w-full h-full min-h-[300px] flex items-center justify-center [&_video]:object-cover [&_video]:w-full [&_video]:h-full"
          />

          {/* Scanner Overlay UI (Cadre et laser) */}
          {!scannerError && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Dimmed surrounding */}
              <div className="relative w-72 h-44 border-2 border-blue-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-center justify-center">
                {/* Corner markers */}
                <span className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                <span className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                <span className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                <span className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />

                {/* Animated scanning laser line */}
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_#ef4444] animate-pulse" />
              </div>

              <div className="mt-4 px-4 py-1.5 bg-black/70 backdrop-blur-md rounded-full border border-white/10 text-white/90 text-xs font-medium tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                Alignez le code-barres dans le cadre
              </div>
            </div>
          )}

          {/* Loading spinner */}
          {isInitializing && !scannerError && (
            <div className="absolute inset-0 bg-gray-950/80 flex flex-col items-center justify-center text-white gap-3 z-10">
              <div className="animate-spin rounded-full h-9 w-9 border-2 border-blue-500 border-t-transparent" />
              <p className="text-sm text-gray-300">Démarrage de l'appareil photo...</p>
            </div>
          )}

          {/* Error Message */}
          {scannerError && (
            <div className="absolute inset-0 bg-gray-950 p-6 flex flex-col items-center justify-center text-center text-gray-300 z-10 gap-3">
              <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl">
                <AlertCircle size={36} />
              </div>
              <h4 className="font-bold text-white text-base">Caméra inaccessible</h4>
              <p className="text-xs text-gray-400 max-w-xs">{scannerError}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => startScanner(currentCameraId || undefined)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw size={14} /> Réessayer
                </button>
                <button
                  onClick={() => setShowManualInput(true)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold transition-all"
                >
                  Saisie manuelle
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls bar (Flashlight, switch camera, manual entry) */}
        <div className="p-4 bg-gray-900 border-t border-gray-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {supportsTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-2.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold ${
                    torchOn 
                      ? 'bg-yellow-400 text-gray-950 border-yellow-300' 
                      : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                  }`}
                  title={torchOn ? "Éteindre le flash" : "Allumer le flash"}
                >
                  <Zap size={16} className={torchOn ? 'fill-current' : ''} />
                  <span>Flash</span>
                </button>
              )}

              {cameras.length > 1 && (
                <button
                  type="button"
                  onClick={switchCamera}
                  className="p-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-1.5 text-xs font-semibold"
                  title="Changer de caméra"
                >
                  <Camera size={16} />
                  <span>Changer</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-4"
            >
              {showManualInput ? "Masquer la saisie" : "Saisir au clavier"}
            </button>
          </div>

          {/* Optional manual entry fallback */}
          {showManualInput && (
            <form onSubmit={handleManualSubmit} className="flex gap-2 pt-1 animate-in slide-in-from-bottom-2 duration-150">
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Ex: 3017620422003"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1"
              >
                <Check size={14} /> Valider
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
