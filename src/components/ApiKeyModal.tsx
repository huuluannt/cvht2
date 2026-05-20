import { Eye, KeyRound, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { Provider } from "../lib/types";

type ApiKeyModalProps = {
  apiKey: string;
  open: boolean;
  provider: Provider;
  onClose: () => void;
  onDelete: () => void;
  onProviderChange: (provider: Provider) => void;
  onSave: (apiKey: string) => void;
};

export function ApiKeyModal({
  apiKey,
  open,
  provider,
  onClose,
  onDelete,
  onProviderChange,
  onSave,
}: ApiKeyModalProps) {
  if (!open) {
    return null;
  }

  return (
    <ApiKeyDialog
      apiKey={apiKey}
      provider={provider}
      onClose={onClose}
      onDelete={onDelete}
      onProviderChange={onProviderChange}
      onSave={onSave}
    />
  );
}

function ApiKeyDialog({
  apiKey,
  provider,
  onClose,
  onDelete,
  onProviderChange,
  onSave,
}: Omit<ApiKeyModalProps, "open">) {
  const [draftKey, setDraftKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="api-key-title"
        className="modal-panel"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="api-key-title">API Key</h2>
            <p>Khóa chỉ lưu trong localStorage của trình duyệt.</p>
          </div>
          <button aria-label="Đóng" className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label className="field-label">
          Provider
          <select
            value={provider}
            onChange={(event) => onProviderChange(event.target.value as Provider)}
          >
            <option value="gemini">Gemini</option>
            <option value="groq">Groq</option>
          </select>
        </label>

        <label className="field-label">
          API key
          <span className="input-with-button">
            <input
              autoFocus
              placeholder="Dán API key của bạn"
              type={showKey ? "text" : "password"}
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
            />
            <button
              aria-label={showKey ? "Ẩn API key" : "Hiện API key"}
              className="icon-button"
              type="button"
              onClick={() => setShowKey((value) => !value)}
            >
              <Eye size={18} />
            </button>
          </span>
        </label>

        <div className="modal-actions">
          <button
            className="secondary-button danger"
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            <Trash2 size={16} />
            Delete API Key
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              onSave(draftKey.trim());
              onClose();
            }}
          >
            <KeyRound size={16} />
            Save
          </button>
        </div>
      </section>
    </div>
  );
}
