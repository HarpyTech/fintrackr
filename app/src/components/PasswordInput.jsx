import { useState } from 'react';
import EyeIcon from '../icons/EyeIcon';
import EyeOffIcon from '../icons/EyeOffIcon';

/**
 * A password input with a show/hide toggle icon button.
 * Accepts all standard <input> props except `type`.
 */
export default function PasswordInput({ id, className, ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="pw-input-wrap">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        className={className}
        {...props}
      />
      <button
        type="button"
        className="pw-toggle-btn"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
