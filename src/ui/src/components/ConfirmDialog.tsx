import { useRef, useEffect, useCallback } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
  returnFocusRef,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusableElementsRef = useRef<HTMLElement[]>([]);

  const getFocusableElements = useCallback(() => {
    if (!dialogRef.current) return [];
    const elements = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(elements).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: if on first element, move to last
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element, move to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    },
    [getFocusableElements, onCancel]
  );

  useEffect(() => {
    const focusableElements = getFocusableElements();
    focusableElementsRef.current = focusableElements;

    // Focus the first focusable element when dialog opens
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Add keydown listener to the document to catch focus outside
    const handleDocumentFocus = (e: Event) => {
      const target = e.target as HTMLElement;
      if (dialogRef.current && !dialogRef.current.contains(target)) {
        e.preventDefault();
        const firstElement = focusableElementsRef.current[0];
        if (firstElement) {
          firstElement.focus();
        }
      }
    };

    document.addEventListener('focusin', handleDocumentFocus, true);

    return () => {
      document.removeEventListener('focusin', handleDocumentFocus, true);
      // Optionally return focus to the trigger element
      if (returnFocusRef?.current) {
        returnFocusRef.current.focus();
      }
    };
  }, [getFocusableElements, returnFocusRef]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="bg-gray-800 border border-gray-600 rounded-md shadow-xl p-4 max-w-sm w-full mx-4"
        onKeyDown={handleKeyDown}
      >
        <h3 id="dialog-title" className="text-sm font-semibold text-gray-100 mb-2">
          {title}
        </h3>
        <p className="text-xs text-gray-300 mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs text-white rounded font-medium ${
              danger ? 'bg-red-700 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
