import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useBackDismiss } from '../hooks/useBackDismiss';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  showCloseButton?: boolean;
  /** id of the element that labels the dialog (aria-labelledby) */
  labelledBy?: string;
  /** Element to focus when the dialog opens; falls back to the dialog itself */
  initialFocusRef?: React.RefObject<HTMLElement>;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Swipe-down-to-close thresholds (mobile drawer)
const SWIPE_CLOSE_DISTANCE = 100; // px dragged down
const SWIPE_CLOSE_VELOCITY = 0.5; // px/ms for a fast flick

export default function Modal({
  isOpen,
  onClose,
  children,
  size = 'md',
  showCloseButton = true,
  labelledBy,
  initialFocusRef,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ y: number; time: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Browser Back / mobile back gesture closes the modal instead of leaving.
  useBackDismiss(isOpen, onClose);

  // Close modal on ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Focus the dialog on open, restore focus to the previous element on close
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = initialFocusRef?.current ?? dialogRef.current;
    target?.focus();

    return () => {
      previouslyFocused?.focus();
    };
  }, [isOpen, initialFocusRef]);

  // Reset any in-progress drag when the modal opens/closes
  useEffect(() => {
    dragStartRef.current = null;
    setDragOffset(0);
    setIsDragging(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  };

  // Simple focus trap: keep Tab/Shift+Tab cycling inside the dialog
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }

    if (e.shiftKey) {
      if (document.activeElement === first || document.activeElement === dialog) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Swipe-down-to-close on the drag handle (mobile drawer only)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 640) return; // desktop: centered modal, no drag
    dragStartRef.current = { y: e.clientY, time: e.timeStamp };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    setDragOffset(Math.max(0, e.clientY - dragStartRef.current.y));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const distance = e.clientY - dragStartRef.current.y;
    const elapsed = e.timeStamp - dragStartRef.current.time;
    const velocity = elapsed > 0 ? distance / elapsed : 0;
    dragStartRef.current = null;
    setIsDragging(false);
    setDragOffset(0);

    if (distance > SWIPE_CLOSE_DISTANCE || (distance > 30 && velocity > SWIPE_CLOSE_VELOCITY)) {
      onClose();
    }
  };

  const handlePointerCancel = () => {
    dragStartRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[110] transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal: bottom-sheet drawer on mobile, centered dialog on sm+ */}
      <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
          className={`${sizeClasses[size]} relative w-full max-h-[90dvh] flex flex-col bg-gray-800 rounded-t-2xl sm:rounded-lg shadow-2xl pointer-events-auto safe-area-bottom animate-drawer-up outline-none`}
        >
          {/* Drag handle (mobile drawer) */}
          <div
            className="sm:hidden pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing"
            aria-hidden="true"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <div className="w-10 h-1 rounded-full bg-gray-600 mx-auto" />
          </div>

          {showCloseButton && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors z-10"
            >
              <X size={24} />
            </button>
          )}

          <div className="overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
