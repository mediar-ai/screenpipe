import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface MotionDivProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
}

const MotionDiv = ({ children, delay = 0.3, duration = 0.6 }: MotionDivProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration }}
    >
      {children}
    </motion.div>
  );
};

export default MotionDiv;