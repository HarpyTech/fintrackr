import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

interface PageSpinnerProps {
  label?: string;
  minHeight?: number;
}

export default function PageSpinner({ label = 'Loading…', minHeight = 200 }: PageSpinnerProps) {
  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight={minHeight}
      aria-label={label}
      role="status"
    >
      <CircularProgress />
    </Box>
  );
}
