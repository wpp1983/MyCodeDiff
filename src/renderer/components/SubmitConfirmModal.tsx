import { useEffect } from "react";
import type { ChangelistSummary } from "@core/models/changeModels";

export type SubmitConfirmModalProps = {
  open: boolean;
  cl: ChangelistSummary | null;
  openedCount: number;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function SubmitConfirmModal(props: SubmitConfirmModalProps) {
  const { open, cl, openedCount, submitting, error, onConfirm, onCancel } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && !submitting) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onCancel, onConfirm]);

  if (!open || !cl) return null;

  const description = (cl.description ?? "").trim();

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Submit changelist"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="submit-confirm-title"
        style={{
          width: "min(520px, 92vw)",
          background: "var(--bg-1)",
          border: "1px solid var(--line-strong)",
          borderRadius: 12,
          boxShadow:
            "0 12px 40px oklch(0% 0 0 / 0.55), 0 4px 12px oklch(0% 0 0 / 0.35)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <h2
            id="submit-confirm-title"
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--fg-1)",
            }}
          >
            Submit changelist {cl.id}
          </h2>
          <p
            style={{
              margin: "8px 0 0",
              color: "var(--fg-2)",
              fontSize: 12.5,
            }}
          >
            Runs <code>p4 submit -c {cl.id}</code> using the changelist&apos;s
            existing description. {openedCount} file(s) will be submitted.
          </p>
        </div>

        {description ? (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--fg-2)",
                marginBottom: 6,
              }}
            >
              Description
            </div>
            <div
              style={{
                background: "var(--bg-0)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "8px 10px",
                fontFamily: "var(--app-font-family, ui-monospace, monospace)",
                fontSize: 12.5,
                whiteSpace: "pre-wrap",
                maxHeight: 160,
                overflow: "auto",
                color: "var(--fg-0)",
              }}
            >
              {description}
            </div>
          </div>
        ) : (
          <div
            className="error-banner"
            style={{ marginTop: 0, fontSize: 12.5 }}
          >
            This changelist has no description. p4 may reject the submit.
          </div>
        )}

        {error ? (
          <div className="error-banner" style={{ marginTop: 0 }}>
            {error}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            className="btn ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
