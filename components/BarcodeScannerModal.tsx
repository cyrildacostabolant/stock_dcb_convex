import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  X, 
  Camera, 
  Zap, 
  ZapOff, 
  RefreshCw, 
  AlertCircle, 
  Barcode, 
  Check, 
  Sparkles,
  ZoomIn,
  Info
} from 'lucide-react';

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
    // Ignore if audio is restricted
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
  
  // Flash / Torch states
  const [torchOn, setTorchOn] = useState(false);
  const [supportsTorch, setSupportsTorch] = useState(true); // Default to visible to allow direct user activation
  
  // Zoom states
  const [supportsZoom, setSupportsZoom] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [maxZoom, setMaxZoom] = useState<number>(2);

  // Manual input
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [showTips, setShowTips] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "barcode-scanner-viewport";
  const hasScannedRef = useRef(false);

  // Helper to retrieve current MediaStreamTrack
  const getVideoTrack = useCallback((): MediaStreamTrack | null => {
    try {
      // 1. Try html5QrCode API
      const track = (scannerRef.current as any)?.getRunningTrack?.();
      if (track) return track;

      // 2. Query video element in DOM
      const video = document.querySelector(`#${scannerContainerId} video`) as HTMLVideoElement;
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        const tracks = stream.getVideoTracks();
        if (tracks && tracks.length > 0) return tracks[0];
      }
    } catch (e) {
      console.warn("Could not retrieve video track:", e);
    }
    return null;
  }, []);

  const checkCapabilities = useCallback(() => {
    const track = getVideoTrack();
    if (track) {
      try {
        const caps = (track.getCapabilities ? track.getCapabilities() : {}) as any;
        
        // Torch capability
        if (caps && ('torch' in caps || 'fillLightMode' in caps)) {
          setSupportsTorch(true);
        }

        // Zoom capability
        if (caps && caps.zoom) {
          setSupportsZoom(true);
          if (caps.zoom.max) {
            setMaxZoom(Math.min(caps.zoom.max, 3));
          }
        }
      } catch (e) {
        console.warn("Error reading capabilities:", e);
      }
    }
  }, [getVideoTrack]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        // Turn off torch before stopping if on
        if (torchOn) {
          const track = getVideoTrack();
          if (track) {
            try {
              await track.applyConstraints({ advanced: [{ torch: false } as any] });
            } catch (e) {
              // Ignore
            }
          }
        }
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn("Error stopping scanner:", err);
      }
      scannerRef.current = null;
    }
    setTorchOn(false);
  }, [torchOn, getVideoTrack]);

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
    setTorchOn(false);

    await stopScanner();

    try {
      const availableCameras = await Html5Qrcode.getCameras();
      if (!availableCameras || availableCameras.length === 0) {
        setScannerError("Aucune caméra détectée sur cet appareil.");
        setIsInitializing(false);
        return;
      }

      setCameras(availableCameras);

      // Déterminer la caméra à activer par défaut :
      // 1. Si une caméra spécifique est demandée en paramètre
      let selectedId = cameraId;

      // 2. Sinon, récupérer la dernière caméra validée par l'utilisateur
      if (!selectedId) {
        try {
          const savedCameraId = localStorage.getItem('preferred_scanner_camera_id');
          if (savedCameraId && availableCameras.some(c => c.id === savedCameraId)) {
            selectedId = savedCameraId;
          }
        } catch (e) {
          // ignore
        }
      }

      // 3. Sinon, choisir intelligemment la caméra arrière principale
      if (!selectedId) {
        // Caméras explicitement identifiées comme arrière / back / environment
        const backCams = availableCameras.filter(c => {
          const l = (c.label || '').toLowerCase();
          return l.includes('back') || l.includes('arrière') || l.includes('rear') || l.includes('environment');
        });

        // Éliminer l'ultra grand-angle / macro fixe si possible (souvent sans autofocus pour code-barres)
        const mainBackCam = backCams.find(c => {
          const l = (c.label || '').toLowerCase();
          return !l.includes('ultra') && !l.includes('0.5') && !l.includes('wide-angle');
        }) || backCams[0];

        // Caméras qui ne sont pas étiquetées front/avant/selfie
        const nonFrontCams = availableCameras.filter(c => {
          const l = (c.label || '').toLowerCase();
          return !l.includes('front') && !l.includes('avant') && !l.includes('selfie');
        });

        if (mainBackCam) {
          selectedId = mainBackCam.id;
        } else if (nonFrontCams.length > 0) {
          selectedId = nonFrontCams[0].id;
        } else if (availableCameras.length > 1) {
          // Sur la grande majorité des smartphones Android (Camera2 API), l'index 0 est la caméra avant (selfie)
          // et l'index 1 est la caméra arrière principale avec autofocus. C'est celle qui s'activait au clic sur "Caméra".
          selectedId = availableCameras[1].id;
        } else {
          selectedId = availableCameras[0].id;
        }
      }

      setCurrentCameraId(selectedId);
      try {
        localStorage.setItem('preferred_scanner_camera_id', selectedId);
      } catch (e) {
        // ignore
      }

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
          Html5QrcodeSupportedFormats.DATA_MATRIX
        ],
        verbose: false,
        // Leverage hardware accelerated BarcodeDetector API for 10x faster & better transparent scanning
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
      scannerRef.current = html5QrCode;

      // Dynamic QR box to comfortably fit wide barcodes on transparent packages
      const config = {
        fps: 20, // Higher frame rate for fast responsiveness
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const width = Math.floor(Math.min(viewfinderWidth * 0.88, 320));
          const height = Math.floor(Math.min(viewfinderHeight * 0.55, 180));
          return { width: Math.max(width, 240), height: Math.max(height, 140) };
        },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        selectedId,
        config,
        (decodedText) => handleScanSuccess(decodedText),
        () => {
          // Silent frame callback
        }
      );

      // Mettre à jour avec l'ID réel détecté de la caméra
      try {
        const activeTrack = getVideoTrack();
        const activeDeviceId = activeTrack?.getSettings?.().deviceId;
        if (activeDeviceId) {
          setCurrentCameraId(activeDeviceId);
          localStorage.setItem('preferred_scanner_camera_id', activeDeviceId);
        }
      } catch (e) {}

      setIsInitializing(false);

      // Check capabilities with progressive delays (cameras often expose track caps after stream start)
      setTimeout(checkCapabilities, 250);
      setTimeout(checkCapabilities, 700);
      setTimeout(checkCapabilities, 1500);

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
  }, [stopScanner, handleScanSuccess, checkCapabilities]);

  // Robust torch activation
  const toggleTorch = async () => {
    try {
      const nextTorch = !torchOn;
      let applied = false;

      // Method 1: apply on direct MediaStreamTrack
      const track = getVideoTrack();
      if (track && track.applyConstraints) {
        try {
          await track.applyConstraints({
            advanced: [{ torch: nextTorch } as any]
          });
          applied = true;
        } catch (err1) {
          console.warn("Direct track torch apply failed:", err1);
        }
      }

      // Method 2: apply via Html5Qrcode API
      if (!applied && scannerRef.current) {
        try {
          await scannerRef.current.applyVideoConstraints({
            advanced: [{ torch: nextTorch } as any]
          });
          applied = true;
        } catch (err2) {
          console.warn("Html5Qrcode applyVideoConstraints torch failed:", err2);
        }
      }

      if (applied) {
        setTorchOn(nextTorch);
      } else {
        alert("Le flash n'est pas pris en charge par cette caméra ou ce navigateur.");
      }
    } catch (e: any) {
      console.warn("Failed to toggle torch:", e);
      alert("Impossible d'activer le flash sur cet appareil.");
    }
  };

  // Zoom toggle (helpful for transparent packaging to avoid holding camera too close)
  const toggleZoom = async () => {
    const track = getVideoTrack();
    if (!track || !track.applyConstraints) return;

    try {
      const nextZoom = zoomLevel === 1 ? Math.min(2, maxZoom) : 1;
      await track.applyConstraints({
        advanced: [{ zoom: nextZoom } as any]
      });
      setZoomLevel(nextZoom);
    } catch (e) {
      console.warn("Zoom constraint failed:", e);
    }
  };

  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === currentCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const targetCamera = cameras[nextIndex];
    try {
      localStorage.setItem('preferred_scanner_camera_id', targetCamera.id);
    } catch (e) {}
    startScanner(targetCamera.id);
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
      setShowTips(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-gray-900/95 border-b border-gray-800 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5 text-white">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl">
              <Barcode size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base md:text-lg leading-tight">{title}</h3>
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
        <div className="relative flex-1 bg-black flex flex-col items-center justify-center min-h-[320px] overflow-hidden">
          {/* HTML5 QR Code Mount point */}
          <div 
            id={scannerContainerId} 
            className="w-full h-full min-h-[320px] flex items-center justify-center [&_video]:object-cover [&_video]:w-full [&_video]:h-full"
          />

          {/* Quick Floating Action Controls over the camera stream (Flash & Zoom) */}
          {!scannerError && !isInitializing && (
            <div className="absolute top-4 right-4 z-20 flex flex-col gap-2.5">
              {/* Flash Button Floating directly on Camera */}
              {supportsTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-3 rounded-2xl shadow-lg border backdrop-blur-md transition-all active:scale-95 flex items-center justify-center ${
                    torchOn 
                      ? 'bg-amber-400 text-gray-950 border-amber-300 shadow-amber-400/40 ring-4 ring-amber-400/30' 
                      : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
                  }`}
                  title={torchOn ? "Éteindre le flash" : "Allumer le flash (idéal emballages transparents)"}
                >
                  {torchOn ? <Zap size={22} className="fill-current" /> : <ZapOff size={22} />}
                </button>
              )}

              {/* Zoom Button if available */}
              {supportsZoom && (
                <button
                  type="button"
                  onClick={toggleZoom}
                  className={`p-2.5 rounded-2xl shadow-lg border backdrop-blur-md transition-all active:scale-95 text-xs font-bold flex flex-col items-center justify-center ${
                    zoomLevel > 1
                      ? 'bg-blue-600 text-white border-blue-400 ring-2 ring-blue-500/30'
                      : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
                  }`}
                  title="Agrandir / Zoom 2x"
                >
                  <ZoomIn size={16} />
                  <span>{zoomLevel}x</span>
                </button>
              )}
            </div>
          )}

          {/* Scanner Overlay UI (Cadre de visée et laser dynamique) */}
          {!scannerError && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Dimmed surrounding with target box */}
              <div className="relative w-[82%] max-w-[300px] h-44 border-2 border-blue-400/90 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] flex items-center justify-center">
                {/* Corner markers */}
                <span className="absolute -top-1.5 -left-1.5 w-7 h-7 border-t-4 border-l-4 border-blue-500 rounded-tl-xl" />
                <span className="absolute -top-1.5 -right-1.5 w-7 h-7 border-t-4 border-r-4 border-blue-500 rounded-tr-xl" />
                <span className="absolute -bottom-1.5 -left-1.5 w-7 h-7 border-b-4 border-l-4 border-blue-500 rounded-bl-xl" />
                <span className="absolute -bottom-1.5 -right-1.5 w-7 h-7 border-b-4 border-r-4 border-blue-500 rounded-br-xl" />

                {/* Animated scanning laser line */}
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_14px_#ef4444] animate-pulse" />
              </div>

              {/* Status indicator badge */}
              <div className="mt-4 px-4 py-1.5 bg-black/75 backdrop-blur-md rounded-full border border-white/10 text-white/95 text-xs font-medium tracking-wide flex items-center gap-2 shadow-lg">
                <span className={`w-2 h-2 rounded-full ${torchOn ? 'bg-amber-400 animate-ping' : 'bg-green-500 animate-pulse'}`} />
                <span>{torchOn ? "Flash allumé • Prêt à scanner" : "Placez le code-barres dans le cadre"}</span>
              </div>
            </div>
          )}

          {/* Transparent packaging tip badge banner */}
          {showTips && (
            <div className="absolute bottom-3 left-4 right-4 z-20 p-3 bg-amber-950/90 border border-amber-600/60 rounded-2xl backdrop-blur-md text-amber-200 text-xs shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-start gap-2">
                <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-white mb-0.5">Astuce emballages transparents :</p>
                  <p className="leading-relaxed opacity-90">
                    1. Activez le <strong>Flash</strong> en haut à droite.<br />
                    2. Placez votre main ou un support opaque derrière le film transparent pour faire ressortir les barres noires.
                  </p>
                </div>
                <button 
                  onClick={() => setShowTips(false)}
                  className="text-amber-400 hover:text-white p-1"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Loading spinner */}
          {isInitializing && !scannerError && (
            <div className="absolute inset-0 bg-gray-950/85 flex flex-col items-center justify-center text-white gap-3 z-10">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
              <p className="text-sm text-gray-300 font-medium">Activation de la caméra...</p>
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
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

        {/* Bottom Control Bar */}
        <div className="p-4 bg-gray-900 border-t border-gray-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Flash / Torche toggle button */}
              {supportsTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`px-3 py-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold shadow-sm ${
                    torchOn 
                      ? 'bg-amber-400 text-gray-950 border-amber-300 shadow-amber-400/20' 
                      : 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700'
                  }`}
                  title={torchOn ? "Éteindre le flash" : "Allumer le flash"}
                >
                  <Zap size={16} className={torchOn ? 'fill-current' : ''} />
                  <span>{torchOn ? "Flash ON" : "Allumer Flash"}</span>
                </button>
              )}

              {/* Changer de caméra si plusieurs sont disponibles */}
              {cameras.length > 1 && (
                <button
                  type="button"
                  onClick={switchCamera}
                  className="px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-1.5 text-xs font-semibold"
                  title="Basculer vers une autre caméra"
                >
                  <Camera size={15} />
                  <span>Caméra {cameras.findIndex(c => c.id === currentCameraId) >= 0 ? `(${cameras.findIndex(c => c.id === currentCameraId) + 1}/${cameras.length})` : ''}</span>
                </button>
              )}

              {/* Bouton astuces transparent */}
              <button
                type="button"
                onClick={() => setShowTips(!showTips)}
                className={`p-2 rounded-xl border text-xs transition-all ${
                  showTips 
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                    : 'bg-gray-800/80 text-gray-400 border-gray-700 hover:text-gray-200'
                }`}
                title="Conseils emballages transparents"
              >
                <Info size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-4"
            >
              {showManualInput ? "Masquer la saisie" : "Saisir au clavier"}
            </button>
          </div>

          {/* Saisie manuelle de secours */}
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
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1 shadow-md"
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
