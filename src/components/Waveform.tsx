import React from 'react';
import { motion } from 'motion/react';

export const Waveform: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-12 gap-1 overflow-hidden opacity-50">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="w-1 bg-brand-primary"
          animate={{
            height: [10, 40, 15, 35, 10],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};
