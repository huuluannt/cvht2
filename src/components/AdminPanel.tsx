import { FilePlus2, FileText, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  createAdminContent,
  deleteAdminFile,
  listAdminFiles,
  reindexAdminFile,
  uploadAdminFiles,
} from "../lib/api";
import type { PublicDocument } from "../lib/types";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_DIRECT_CONTENT_BYTES = 128 * 1024;
const MAX_DIRECT_CONTENT_CHARS = 100_000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

type AdminPanelProps = {
  email: string | null;
  onCloseMobile?: () => void;
  onLogout: () => void;
};

export function AdminPanel({ email, onCloseMobile, onLogout }: AdminPanelProps) {
  const [files, setFiles] = useState<PublicDocument[]>([]);
  const [contentTitle, setContentTitle] = useState("");
  const [directContent, setDirectContent] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function refreshFiles() {
    const nextFiles = await listAdminFiles();
    setFiles(nextFiles);
  }

  useEffect(() => {
    let isMounted = true;

    void listAdminFiles()
      .then((nextFiles) => {
        if (isMounted) {
          setFiles(nextFiles);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setMessage(error instanceof Error ? error.message : "Không thể tải danh sách file.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = event.target.files;

    if (!selectedFiles?.length) {
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const oversizedFile = Array.from(selectedFiles).find((file) => file.size > MAX_UPLOAD_BYTES);

      if (oversizedFile) {
        setMessage(
          `${oversizedFile.name} lớn hơn 4 MB. Vercel Hobby chỉ nhận payload nhỏ hơn 4.5 MB.`,
        );
        return;
      }

      await uploadAdminFiles(selectedFiles);
      await refreshFiles();
      setMessage("Đã upload và index file.");
      event.target.value = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload thất bại.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleContentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = directContent.trim();

    if (!trimmedContent) {
      setMessage("Vui lòng nhập nội dung trước khi lưu.");
      return;
    }

    if (trimmedContent.length > MAX_DIRECT_CONTENT_CHARS) {
      setMessage("Nội dung nhập trực tiếp quá dài. Vui lòng rút gọn dưới 100.000 ký tự.");
      return;
    }

    if (new Blob([trimmedContent]).size > MAX_DIRECT_CONTENT_BYTES) {
      setMessage(
        `Nội dung nhập trực tiếp quá dài. Vui lòng giữ dưới ${formatBytes(
          MAX_DIRECT_CONTENT_BYTES,
        )}.`,
      );
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      await createAdminContent(contentTitle.trim(), trimmedContent);
      await refreshFiles();
      setContentTitle("");
      setDirectContent("");
      setMessage("Đã lưu và index nội dung nhập trực tiếp.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu nội dung.");
    } finally {
      setIsBusy(false);
    }
  }

  async function removeFile(id: string) {
    setIsBusy(true);
    setMessage("");

    try {
      await deleteAdminFile(id);
      await refreshFiles();
      setMessage("Đã xóa file.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xóa file.");
    } finally {
      setIsBusy(false);
    }
  }

  async function reindexFile(id: string) {
    setIsBusy(true);
    setMessage("");

    try {
      await reindexAdminFile(id);
      await refreshFiles();
      setMessage("Đã re-index file.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể re-index file.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <aside className="admin-panel">
      <div className="admin-panel-inner">
        <header className="admin-header">
          <div>
            <h2>Admin</h2>
            <p>{email}</p>
          </div>
          <div className="admin-header-actions">
            <button className="ghost-button" type="button" onClick={onLogout}>
              Logout
            </button>
            {onCloseMobile && (
              <button
                aria-label="Đóng admin"
                className="icon-button mobile-admin-close"
                title="Đóng admin"
                type="button"
                onClick={onCloseMobile}
              >
                <X size={18} />
              </button>
            )}
          </div>
        </header>

        <section className="upload-box">
          <div>
            <h3>Documents</h3>
            <p>.txt, .md, .pdf, .docx</p>
          </div>
          <input
            multiple
            accept=".txt,.md,.pdf,.docx"
            ref={inputRef}
            type="file"
            onChange={handleUpload}
          />
          <button
            className="primary-button"
            disabled={isBusy}
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={16} />
            Upload files
          </button>
        </section>

        <form className="upload-box direct-content-box" onSubmit={handleContentSubmit}>
          <div>
            <h3>Nội dung nhập trực tiếp</h3>
            <p>Lưu đoạn text này vào dữ liệu để CVHT dùng khi trả lời.</p>
          </div>

          <label className="field-label">
            Tiêu đề
            <input
              disabled={isBusy}
              maxLength={120}
              placeholder="VD: Quy định đăng ký học phần"
              type="text"
              value={contentTitle}
              onChange={(event) => setContentTitle(event.target.value)}
            />
          </label>

          <label className="field-label">
            Content
            <textarea
              disabled={isBusy}
              maxLength={MAX_DIRECT_CONTENT_CHARS}
              placeholder="Dán hoặc nhập nội dung cần thêm vào dữ liệu CVHT..."
              value={directContent}
              onChange={(event) => setDirectContent(event.target.value)}
            />
          </label>

          <button
            className="primary-button"
            disabled={isBusy || directContent.trim().length === 0}
            type="submit"
          >
            <FilePlus2 size={16} />
            Lưu content
          </button>
        </form>

        {message && <div className="admin-message">{message}</div>}

        <section className="file-list" aria-label="Knowledge sources">
          {files.length === 0 ? (
            <div className="empty-files">
              <FileText size={24} />
              Chưa có dữ liệu nào.
            </div>
          ) : (
            files.map((file) => (
              <article className="file-row" key={file.id}>
                <div className="file-row-main">
                  <FileText size={18} />
                  <div>
                    <h3 title={file.file_name}>{file.file_name}</h3>
                    <p>{formatDate(file.uploaded_at)}</p>
                  </div>
                </div>

                <dl className="file-meta">
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(file.file_size)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span className={`status ${file.status}`}>{file.status}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Chunks</dt>
                    <dd>{file.chunk_count}</dd>
                  </div>
                </dl>

                {file.error_message && <p className="file-error">{file.error_message}</p>}

                <div className="file-actions">
                  <button
                    aria-label={`Re-index ${file.file_name}`}
                    className="icon-button"
                    disabled={isBusy}
                    type="button"
                    onClick={() => reindexFile(file.id)}
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    aria-label={`Delete ${file.file_name}`}
                    className="icon-button danger"
                    disabled={isBusy}
                    type="button"
                    onClick={() => removeFile(file.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </aside>
  );
}
