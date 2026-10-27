import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <Alert
      severity="error"
      aria-live="polite"
      action={
        onRetry ? (
          <Button color="error" size="small" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
      sx={{ borderRadius: 'var(--radius-md)', my: 1 }}
    >
      {message}
    </Alert>
  );
}
