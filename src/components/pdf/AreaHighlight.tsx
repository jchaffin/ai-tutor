import React from 'react';

interface AreaHighlightProps {
  left: number;
  top: number;
  width: number;
  height: number;
  pageIndex: number;
  type?: 'circle' | 'rectangle';
  color?: string;
  borderColor?: string;
}

export const AreaHighlight: React.FC<AreaHighlightProps> = ({
  left,
  top,
  width,
  height,
  type = 'circle',
  color = 'rgba(239, 68, 68, 0.1)',
  borderColor = '#ef4444'
}) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    background: color,
    border: `3px solid ${borderColor}`,
    borderRadius: type === 'circle' ? '50%' : '8px',
    boxShadow: `0 0 0 2px ${borderColor}25`,
    pointerEvents: 'none',
    zIndex: 9999,
  };

  return <div style={style} className="area-highlight" />;
};

export default AreaHighlight;
