import { Inbox } from 'lucide-react';

/**
 * Shared empty state.
 *
 * `compact` drops the icon and tightens padding for use inside chart cards,
 * where the surrounding card already provides a heading and framing.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action = null,
  compact = false,
}) {
  return (
    <div
      className="empty-state"
      style={compact ? { padding: 'var(--space-5) var(--space-3)' } : undefined}
    >
      {!compact ? (
        <span className="empty-state-icon" aria-hidden="true">
          <Icon />
        </span>
      ) : null}
      {title ? <p className="empty-state-title">{title}</p> : null}
      {body ? <p className="empty-state-body">{body}</p> : null}
      {action}
    </div>
  );
}
