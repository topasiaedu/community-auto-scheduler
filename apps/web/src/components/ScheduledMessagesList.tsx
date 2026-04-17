/**
 * Filterable list of scheduled messages with expand/cancel/draft actions.
 */

import type { ReactElement } from "react";
import { chipClassForStatus, formatScheduledBy, stripCommunityShellPrefix } from "../lib/format.js";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";

type ScheduledMessagesListProps = {
  vm: NmcasViewModel;
};

export function ScheduledMessagesList({ vm }: ScheduledMessagesListProps): ReactElement | null {
  const {
    canUseApiRoutes,
    messages,
    filterStatus,
    setFilterStatus,
    filterType,
    setFilterType,
    expandedMessageId,
    setExpandedMessageId,
    refreshMessages,
    onStartEditPending,
    onCancelMessage,
    onContinueDraft,
  } = vm;

  if (!canUseApiRoutes) {
    return null;
  }

  return (
    <section className="app-card">
      <div className="app-section-title">Scheduled messages</div>
      <div className="message-list-filters">
        <div>
          <label htmlFor="filter-status">
            Status
            <select
              id="filter-status"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
              }}
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="SENDING">Sending</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
              <option value="DRAFT">Draft</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
        </div>
        <div>
          <label htmlFor="filter-type">
            Type
            <select
              id="filter-type"
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
              }}
            >
              <option value="">All</option>
              <option value="POST">Post</option>
              <option value="POLL">Poll</option>
            </select>
          </label>
        </div>
        <button type="button" className="btn" onClick={() => void refreshMessages()}>
          Refresh list
        </button>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {messages.map((m) => (
          <li key={m.id} className="message-card">
            <div className="message-card__row">
              <strong>{stripCommunityShellPrefix(m.groupName)}</strong>
              <span className="chip chip--type">{m.type === "POLL" ? "Poll" : "Post"}</span>
              <span className={`chip ${chipClassForStatus(m.status)}`}>{m.status}</span>
            </div>
            <div className="message-card__meta">
              {new Date(m.scheduledAt).toLocaleString(undefined, { timeZone: "Asia/Kuala_Lumpur" })} MYT
            </div>
            {formatScheduledBy(m.createdByUserId).length > 0 ? (
              <div className="message-card__meta">{formatScheduledBy(m.createdByUserId)}</div>
            ) : null}
            {expandedMessageId === m.id ? (
              <div className="message-card__body">
                {m.type === "POLL" && m.pollQuestion !== null && m.pollQuestion.length > 0 ? (
                  <>
                    <p style={{ fontWeight: 600 }}>{m.pollQuestion}</p>
                    <ul>
                      {(m.pollOptions ?? []).map((o, i) => (
                        <li key={`${m.id}-opt-${String(i)}`}>{o}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {m.type !== "POLL" && m.copyText !== null && m.copyText.length > 0 ? <p>{m.copyText}</p> : null}
                {m.type !== "POLL" && m.imageUrl !== null ? <p className="hint">Image: {m.imageUrl}</p> : null}
              </div>
            ) : null}
            {m.error !== null ? <p className="text-error">{m.error}</p> : null}
            <div className="message-card__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setExpandedMessageId((id) => (id === m.id ? null : m.id));
                }}
              >
                {expandedMessageId === m.id ? "Less" : "Details"}
              </button>
              {m.status === "PENDING" ? (
                <>
                  <button type="button" className="btn" onClick={() => void onStartEditPending(m)}>
                    Edit
                  </button>
                  <button type="button" className="btn" onClick={() => void onCancelMessage(m)}>
                    Cancel
                  </button>
                </>
              ) : null}
              {m.status === "DRAFT" ? (
                <>
                  <button type="button" className="btn btn--primary" onClick={() => void onContinueDraft(m)}>
                    Continue editing
                  </button>
                  <button type="button" className="btn" onClick={() => void onCancelMessage(m)}>
                    Cancel
                  </button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
