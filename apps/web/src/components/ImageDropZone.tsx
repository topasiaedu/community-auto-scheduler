/**
 * Drag-and-drop image upload area — replaces raw <input type="file">.
 */

import { useRef, useState, type DragEvent, type ReactElement } from "react";

type ImageDropZoneProps = {
  imagePath: string | null;
  onUpload: (file: File | undefined) => void;
  onRemove: () => void;
  disabled?: boolean;
};

export function ImageDropZone({ imagePath, onUpload, onRemove, disabled = false }: ImageDropZoneProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) {
      return;
    }
    const file = e.dataTransfer.files[0];
    if (file !== undefined && file.type.startsWith("image/")) {
      onUpload(file);
    }
  };

  if (imagePath !== null) {
    const filename = imagePath.split("/").pop() ?? imagePath;
    return (
      <div className="image-dropzone image-dropzone--has-file">
        <span className="image-dropzone__filename">{filename}</span>
        <button
          type="button"
          className="image-dropzone__remove"
          disabled={disabled}
          onClick={() => onRemove()}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div
      className={`image-dropzone${dragging ? " image-dropzone--drag" : ""}${disabled ? " image-dropzone--disabled" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload image — drag and drop or click to browse"
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => onUpload(e.target.files?.[0])}
      />
      <span className="image-dropzone__icon" aria-hidden="true">⬆</span>
      <span className="image-dropzone__label">
        {dragging ? "Drop image here" : "Drag image here or click to browse"}
      </span>
      <span className="image-dropzone__hint">Optional — JPEG, PNG, WebP</span>
    </div>
  );
}
