export type BrainstormActions = {
  onSubmit: () => void;
  onClear: () => void;
  onEdit: (msgId: string) => void;
  onSave: (msgId: string) => void;
  onRetry: (msgId: string) => void;
  onDelete: (msgId: string) => void;
  onCancelRequest: () => void;
  onContinueRequest: () => void;
};
