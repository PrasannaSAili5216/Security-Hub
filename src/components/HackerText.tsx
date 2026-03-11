import React, { useState, useEffect } from 'react';

interface HackerTextProps {
  text: string;
  className?: string;
  speed?: number;
  onComplete?: () => void;
}

export const HackerText: React.FC<HackerTextProps> = ({ text, className, speed = 30, onComplete }) => {
  const [displayText, setDisplayText] = useState('');
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+{}|:<>?';

  useEffect(() => {
    let iteration = 0;
    const interval = setInterval(() => {
      setDisplayText(
        text
          .split('')
          .map((char, index) => {
            if (index < iteration) {
              return text[index];
            }
            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join('')
      );

      if (iteration >= text.length) {
        clearInterval(interval);
        onComplete?.();
      }

      iteration += 1 / 3;
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return <span className={className}>{displayText}</span>;
};
