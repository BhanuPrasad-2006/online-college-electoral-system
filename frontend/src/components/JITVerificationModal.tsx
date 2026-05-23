import { useRef, useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck } from "lucide-react";

export function JITVerificationModal({
  open,
  onOpenChange,
  onVerified,
  onLivenessPhoto,
  livenessRequired,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onVerified: () => void;
  onLivenessPhoto?: (photoBase64: string) => void;
  livenessRequired?: boolean;
}) {
  const [val, setVal] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");

  const startCamera = useCallback(async () => {
    setCapturing(true);
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      // Small delay to let the video element mount
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch {
      setCameraError("Camera access denied. Please grant camera permissions.");
      setCapturing(false);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.85);
    setPhoto(base64);
    onLivenessPhoto?.(base64);
    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCapturing(false);
  }, [onLivenessPhoto]);

  const handleCancel = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCapturing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(b) => { if (!b) handleCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center text-center pt-2">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Identity Verification</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            {livenessRequired
              ? "Capture a live photo for facial verification to proceed."
              : "Enter the Student ID printed on your physical college ID card."}
          </p>

          {livenessRequired && (
            <div className="w-full mt-4">
              {!capturing && !photo && (
                <Button variant="outline" className="w-full" onClick={startCamera}>
                  Open Camera
                </Button>
              )}

              {capturing && (
                <div className="flex flex-col items-center gap-2">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-w-[280px] rounded-lg border"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  <Button onClick={capturePhoto} className="w-full">
                    Capture Photo
                  </Button>
                </div>
              )}

              {photo && (
                <div className="flex flex-col items-center gap-2">
                  <img src={photo} alt="Captured" className="w-full max-w-[200px] rounded-lg border" />
                  <p className="text-xs text-muted-foreground">Photo captured successfully</p>
                </div>
              )}

              {cameraError && (
                <p className="text-xs text-destructive mt-2">{cameraError}</p>
              )}
            </div>
          )}

          {!livenessRequired && (
            <Input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="e.g. CS2021001"
              className="mt-5 text-center text-base h-12"
            />
          )}

          <p className="text-xs text-warning-foreground/80 mt-2">3 failed attempts will lock your session.</p>
          <div className="flex gap-3 w-full mt-6">
            <Button variant="outline" className="flex-1" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={
                livenessRequired ? !photo : val.length < 4
              }
              onClick={onVerified}
            >
              {livenessRequired && !photo ? "Take Photo First" : "Verify & Proceed"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
