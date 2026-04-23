import React, { useEffect, useState } from 'react';
import './CustomCursor.css';

const CustomCursor: React.FC = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [clicked, setClicked] = useState(false);
  const [linkHovered, setLinkHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [hasMouse, setHasMouse] = useState(false); // Only show if mouse is used (e.g. not on touch devices)

  useEffect(() => {
    // Detect if device has a fine pointer (mouse)
    if (window.matchMedia("(pointer: fine)").matches) {
        setHasMouse(true);
    } else {
        return; // Don't init on touch devices
    }

    const onMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      if (hidden) setHidden(false);
    };

    const onMouseDown = () => {
      setClicked(true);
    };

    const onMouseUp = () => {
      setClicked(false);
    };

    const onMouseLeave = () => {
      setHidden(true);
    };

    const onMouseEnter = () => {
      setHidden(false);
    };

    const handleLinkHoverEvents = () => {
      document.querySelectorAll("a, button, input[type='button'], input[type='submit'], [role='button'], canvas, .test-square, .home-action-card, .toggle-container, .gender-option").forEach(el => {
        // Prevent duplicate listeners
        if (!(el as any)._hasCursorListener) {
            el.addEventListener("mouseenter", () => setLinkHovered(true));
            el.addEventListener("mouseleave", () => setLinkHovered(false));
            (el as any)._hasCursorListener = true;
        }
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseenter", onMouseEnter);
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);

    handleLinkHoverEvents();
    
    // Observer for dynamically added elements
    const observer = new MutationObserver(() => {
        handleLinkHoverEvents();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseenter", onMouseEnter);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      observer.disconnect();
    };
  }, [hidden]);

  if (!hasMouse) return null;

  const cursorClasses = `custom-cursor ${clicked ? 'cursor-clicked' : ''} ${linkHovered ? 'cursor-hovered' : ''} ${hidden ? 'cursor-hidden' : ''}`;
  const dotClasses = `custom-cursor-dot ${hidden ? 'cursor-hidden' : ''} ${linkHovered ? 'cursor-hovered' : ''}`;

  return (
    <>
      <div 
        className={dotClasses}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
      />
      <div
        className={cursorClasses}
        style={{ left: `${position.x}px`, top: `${position.y}px`, transition: 'transform 0.1s ease-out, width 0.3s ease-out, height 0.3s ease-out, background-color 0.3s ease-out' }}
      />
    </>
  );
};

export default CustomCursor;
