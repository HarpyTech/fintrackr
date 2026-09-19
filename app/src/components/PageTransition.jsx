import { motion, useReducedMotion } from 'framer-motion';

/**
 * Wraps route content so ProtectedLayout's page area crossfades on
 * navigation. Duration/easing mirror the --motion-base/--ease-out tokens in
 * base.css, but framer-motion animates via JS rather than CSS transitions,
 * so it isn't covered by the global prefers-reduced-motion override there —
 * useReducedMotion() is checked explicitly instead.
 */
const variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const reducedVariants = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 1, y: 0 },
};

export default function PageTransition({ children }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={prefersReducedMotion ? reducedVariants : variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
