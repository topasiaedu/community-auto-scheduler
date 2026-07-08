/**
 * Media upload drop zone for reminder images and stickers.
 */

import { useRef, useState, type DragEvent, type ReactElement } from "react";

type MediaDropZoneProps = {
  assetPath: string | null;
  accept: string;
  hint: string;
  uploading?: boolean;
  disabled?: boolean;
  onUpload: (file: File | undefined) => void;
  onRemove: () => void;
};

export function MediaDropZone({
  assetPath,
  accept,
  hint,
  uploading = false,
  disabled = false,
  onUpload,
  onRemove,
}: MediaDropZoneProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const isDisabled = disabled || uploading;

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (isDisabled) {
      return;
    }
    const file = e.dataTransfer.files[0];
    if (file !== undefined) {
      onUpload(file);
    }
  };

  if (assetPath !== null) {
    const filename = assetPath.split("/").pop() ?? assetPath;
    return (
      <div className="image-dropzone image-dropzone--has-file">
        <span className="image-dropzone__filename">{filename}</span>
        <button
          type="button"
          className="image-dropzone__remove"
          disabled={isDisabled}
          onClick={() => onRemove()}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div
      className={`image-dropzone${dragging ? " image-dropzone--drag" : ""}${isDisabled ? " image-dropzone--disabled" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDisabled) {
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => {
        if (!isDisabled) {
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-label="Upload file — drag and drop or click to browse"
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !isDisabled) {
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        disabled={isDisabled}
        onChange={(e) => onUpload(e.target.files?.[0])}
      />
      <span className="image-dropzone__icon" aria-hidden="true">
        ⬆
      </span>
      <span className="image-dropzone__label">
        {uploading ? "Uploading…" : dragging ? "Drop file here" : "Drag file here or click to browse"}
      </span>
      <span className="image-dropzone__hint">{hint}</span>
    </div>
  );
}
