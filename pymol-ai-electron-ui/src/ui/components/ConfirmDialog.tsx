import React from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-3xl border border-neutral-700 bg-[#171717] p-5 shadow-2xl">
        <div className="text-lg font-semibold text-neutral-100">{title}</div>
        <div className="mt-2 text-sm text-neutral-400">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-full bg-neutral-800 px-4 text-sm text-neutral-200 hover:bg-neutral-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-10 rounded-full px-4 text-sm font-medium ${
              destructive
                ? 'bg-[#C65536] text-white hover:bg-[#b54a2d]'
                : 'bg-brand text-black hover:bg-brandHover'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
