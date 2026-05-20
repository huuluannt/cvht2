import { ExternalLink, X } from "lucide-react";

type GuideModalProps = {
  open: boolean;
  onClose: () => void;
};

export function GuideModal({ open, onClose }: GuideModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="guide-title"
        className="modal-panel guide-panel"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="guide-title">How to get API key?</h2>
            <p>Chọn Gemini hoặc Groq, rồi lưu khóa vào trình duyệt của bạn.</p>
          </div>
          <button aria-label="Đóng" className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="guide-sections">
          <section>
            <h3>Gemini API key</h3>
            <ol>
              <li>Mở Google AI Studio.</li>
              <li>Đăng nhập bằng tài khoản Google.</li>
              <li>Vào mục API keys và tạo khóa mới.</li>
              <li>Dán khóa vào nút Add API Key trong CVHT2.</li>
            </ol>
            <a href="https://aistudio.google.com/app/apikey" rel="noreferrer" target="_blank">
              Google AI Studio
              <ExternalLink size={14} />
            </a>
          </section>

          <section>
            <h3>Groq API key</h3>
            <ol>
              <li>Mở Groq Console.</li>
              <li>Đăng nhập hoặc tạo tài khoản Groq.</li>
              <li>Vào API Keys và tạo khóa mới.</li>
              <li>Dán khóa vào nút Add API Key trong CVHT2.</li>
            </ol>
            <a href="https://console.groq.com/keys" rel="noreferrer" target="_blank">
              Groq Console
              <ExternalLink size={14} />
            </a>
          </section>
        </div>

        <div className="guide-warning">
          Free tiers thường có rate limit và quota hằng ngày. Không chia sẻ API key, không gửi
          key cho người khác, và xóa key khỏi trình duyệt nếu dùng máy chung.
        </div>
      </section>
    </div>
  );
}

