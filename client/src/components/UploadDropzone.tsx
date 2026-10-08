import { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { Upload, FileText, Image, AlertCircle, X } from 'lucide-react';
import { upload, Document } from '@/api/documentsApi';
import { toast } from 'react-hot-toast';

// Requirements 4.7, 4.8
const ACCEPTED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

const ACCEPTED_MIME_SET = new Set(Object.keys(ACCEPTED_MIME_TYPES));
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_SIZE_MB = 15;

interface Props {
  /** Called with the created Document on a successful upload. */
  onSuccess?: (doc: Document) => void;
}

/**
 * Drag-and-drop file upload area.
 *
 * - Accepts application/pdf, image/jpeg, image/png, image/webp up to 15 MB.
 * - Validates MIME type and size client-side before submitting (Requirement 4.7).
 * - Displays a progress bar (0–100%) while the upload is in flight (Requirement 4.8).
 * - Calls onSuccess with the created Document on a 202 response.
 */
export default function UploadDropzone({ onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_MIME_SET.has(file.type)) {
      return `Unsupported file type "${file.type}". Please upload a PDF, JPEG, PNG, or WebP file.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return `File is too large (${sizeMB} MB). Maximum allowed size is ${MAX_SIZE_MB} MB.`;
    }
    return null;
  };

  const handleUpload = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        // Requirement 4.7 — show inline error, do NOT submit
        setError(validationError);
        toast.error(validationError);
        setSelectedFile(null);
        return;
      }

      setError(null);
      setSelectedFile(file);
      setUploading(true);
      setProgress(0);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await upload(formData, (progressEvent) => {
          // Requirement 4.8 — update progress percentage
          if (progressEvent.total && progressEvent.total > 0) {
            const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            setProgress(pct);
          }
        });

        // Build a minimal Document from the upload response so callers can
        // immediately add it to their state while the pipeline runs.
        // The full Document shape will be fetched via polling in parent components.
        const createdDoc = {
          _id: response.documentId,
          status: response.status,
        } as unknown as Document;

        onSuccess?.(createdDoc);
        toast.success('Document uploaded — processing has started.');
      } catch {
        setError('Upload failed. Please try again.');
        toast.error('Upload failed. Please try again.');
      } finally {
        setUploading(false);
        setProgress(0);
        setSelectedFile(null);
      }
    },
    [onSuccess],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      // react-dropzone may reject files before our own validation runs
      if (rejectedFiles.length > 0) {
        const first = rejectedFiles[0];
        const errorCode = first.errors[0]?.code;
        if (errorCode === 'file-too-large') {
          const msg = `File is too large. Maximum allowed size is ${MAX_SIZE_MB} MB.`;
          setError(msg);
          toast.error(msg);
        } else if (errorCode === 'file-invalid-type') {
          const msg = 'Unsupported file type. Please upload a PDF, JPEG, PNG, or WebP file.';
          setError(msg);
          toast.error(msg);
        } else {
          const msg = first.errors[0]?.message ?? 'Invalid file.';
          setError(msg);
          toast.error(msg);
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        handleUpload(acceptedFiles[0]);
      }
    },
    [handleUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME_TYPES,
    maxSize: MAX_SIZE_BYTES,
    multiple: false,
    disabled: uploading,
  });

  const clearError = () => setError(null);

  return (
    <div className="w-full space-y-3">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={[
          'relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border bg-background text-muted-foreground hover:border-primary/60 hover:bg-accent/30',
          uploading
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer',
        ].join(' ')}
        aria-disabled={uploading}
      >
        <input {...getInputProps()} aria-label="Upload file" />

        {/* Icon */}
        <div
          className={[
            'flex h-12 w-12 items-center justify-center rounded-full',
            isDragActive ? 'bg-primary/10' : 'bg-muted',
          ].join(' ')}
        >
          {isDragActive ? (
            <Upload className="h-6 w-6 text-primary" />
          ) : (
            <div className="flex gap-1">
              <FileText className="h-5 w-5" />
              <Image className="h-5 w-5" />
            </div>
          )}
        </div>

        {/* Text */}
        <div className="space-y-1">
          {isDragActive ? (
            <p className="font-medium">Drop your file here</p>
          ) : (
            <>
              <p className="font-medium">
                {uploading && selectedFile
                  ? `Uploading ${selectedFile.name}…`
                  : 'Drag & drop a file, or click to browse'}
              </p>
              <p className="text-sm">PDF, JPEG, PNG, or WebP · Max {MAX_SIZE_MB} MB</p>
            </>
          )}
        </div>
      </div>

      {/* Progress bar — visible only while uploading (Requirement 4.8) */}
      {uploading && (
        <div
          className="space-y-1"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
        >
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Uploading…</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Inline validation / upload error (Requirement 4.7) */}
      {error && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="ml-auto shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-destructive/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
