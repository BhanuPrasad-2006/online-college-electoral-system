import { useRef, useState } from "react";
import { Upload, X, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024;

export type FileUploadValue = { name: string; type: string; preview?: string } | null;

export function FileUpload({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FileUploadValue;
  onChange: (v: FileUploadValue) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File | undefined) {
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const okType = ALLOWED.includes(file.type) || ["jpg", "jpeg", "png", "pdf"].includes(ext);
    if (!okType) {
      toast.error("Only JPG, JPEG, PNG, or PDF files are allowed");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("File must be under 5MB");
      return;
    }
    const isImg = file.type.startsWith("image/") || ["jpg", "jpeg", "png"].includes(ext);
    if (isImg) {
      const reader = new FileReader();
      reader.onload = () =>
        onChange({ name: file.name, type: file.type || `image/${ext}`, preview: String(reader.result) });
      reader.readAsDataURL(file);
    } else {
      onChange({ name: file.name, type: "application/pdf" });
    }
  }

  function clear() {
    onChange(null);
    if (ref.current) ref.current.value = "";
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
        dragOver ? "border-[#6C63FF] bg-[#6C63FF]/5" : "border-border"
      }`}
    >
      <p className="text-xs font-medium mb-2">{label}</p>
      <input
        ref={ref}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex flex-col items-center gap-2">
          {value.preview ? (
            <img src={value.preview} alt={value.name} className="max-h-32 rounded-md border border-border" />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-8 w-8 text-[#6C63FF]" />
              <span className="font-medium">{value.name}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {value.preview ? value.name : "PDF uploaded"}
            </span>
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 text-destructive hover:underline"
            >
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="inline-flex items-center gap-2 text-xs text-[#6C63FF] font-medium"
        >
          <Upload className="h-4 w-4" /> Drag & drop or click
        </button>
      )}
      <p className="text-[10px] text-muted-foreground mt-2">JPG, JPEG, PNG, or PDF · max 5MB</p>
    </div>
  );
}
