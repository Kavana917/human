interface SideToggleProps {
    value: 'left' | 'right';
    onChange: (side: 'left' | 'right') => void;
    disabled?: boolean;
}

export default function SideToggle({ value, onChange, disabled = false }: SideToggleProps) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 0',
        }}>
            <span style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
            }}>
                Side
            </span>
            <div style={{
                display: 'flex',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #e5e5e5',
                opacity: disabled ? 0.5 : 1,
                pointerEvents: disabled ? 'none' : 'auto',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
                <button
                    type="button"
                    onClick={() => onChange('left')}
                    style={{
                        padding: '8px 20px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        border: 'none',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.2s ease',
                        backgroundColor: value === 'left' ? '#111' : '#fff',
                        color: value === 'left' ? '#fff' : '#6b7280',
                    }}
                >
                    LEFT
                </button>
                <button
                    type="button"
                    onClick={() => onChange('right')}
                    style={{
                        padding: '8px 20px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        border: 'none',
                        borderLeft: '1px solid #e5e5e5',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.2s ease',
                        backgroundColor: value === 'right' ? '#111' : '#fff',
                        color: value === 'right' ? '#fff' : '#6b7280',
                    }}
                >
                    RIGHT
                </button>
            </div>
            {disabled && (
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                    locked during recording
                </span>
            )}
        </div>
    );
}
