import React, { useState } from 'react';

interface InfoTooltipProps {
  text: string;
  side?: 'top' | 'left' | 'top-left' | 'bottom' | 'bottom-left';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, side = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);

  // Bestimmt die Positionierung des Popups
  const getPositionClasses = () => {
    switch (side) {
      case 'left':
        // Pop-up erscheint links NEBEN dem Icon
        return 'right-full top-1/2 -translate-y-1/2 mr-2';
      case 'top-left':
        // Pop-up erscheint OBERHALB, wächst nach LINKS
        return 'bottom-full right-0 mb-2';
      case 'bottom':
        // Pop-up erscheint UNTERHALB, mittig ausgerichtet
        return 'top-full left-1/2 -translate-x-1/2 mt-2';
      case 'bottom-left':
        // Pop-up erscheint UNTERHALB, ist rechtsbündig ausgerichtet und wächst nach LINKS
        return 'top-full right-0 mt-2';
      default:
        // Standard: mittig darüber
        return 'bottom-full left-1/2 -translate-x-1/2 mb-2';
    }
  };

  return (
    <div 
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {/* Icon */}
      <span className="cursor-pointer text-gray-400 hover:text-gray-600 text-xs bg-gray-100 rounded-full w-4 h-4 inline-flex items-center justify-center font-bold">
        ?
      </span>

      {/* Pop-up */}
      {isVisible && (
        <div className={`absolute z-50 w-56 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl pointer-events-none ${getPositionClasses()}`}>
          {text}
        </div>
      )}
    </div>
  );
};